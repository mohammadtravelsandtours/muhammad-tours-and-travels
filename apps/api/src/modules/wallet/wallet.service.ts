import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '@mohammad-travels/types';
import { LedgerTransactionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export class InsufficientFundsError extends Error {
  constructor(
    public readonly available: number,
    public readonly requested: number,
    public readonly currency: string,
  ) {
    super(`Insufficient wallet balance/credit: ${available} ${currency} available, ${requested} ${currency} requested`);
  }
}

interface ApplyTransactionInput {
  agencyId: string;
  type: LedgerTransactionType;
  debit?: number;
  credit?: number;
  bookingId?: string;
  /** Set instead of bookingId for a hotel-settled entry — see Payment's doc comment in schema.prisma for why this ledger is polymorphic across product lines. */
  hotelBookingId?: string;
  reference?: string;
  description?: string;
  createdBy?: string;
  /** Required for every debit/credit driven by a booking event (reuse the booking's own idempotencyKey) or an admin adjustment (a caller-supplied key) — the DB's unique constraint on this column, not application logic, is what actually prevents a double-write on retry. */
  idempotencyKey: string;
  /** BOOKING_DEBIT only: reject rather than let the agency go past its credit limit. Admin adjustments and credits never enforce this — an explicit admin action is allowed to move the balance any direction. */
  enforceCreditLimit?: boolean;
}

/**
 * The single writer for wallets.balance (see schema.prisma's comment on
 * Wallet.balance) — every change is a WalletTransaction row created in
 * the same DB transaction as the balance update, so `balance` is always
 * exactly the sum of transactions and never drifts from its own ledger.
 * Nothing outside this service may call prisma.wallet.update({ data:
 * { balance } }) directly.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getOrCreateWallet(agencyId: string) {
    const existing = await this.prisma.wallet.findUnique({ where: { agencyId } });
    if (existing) return existing;
    const agency = await this.prisma.b2BAgency.findUnique({ where: { id: agencyId } });
    if (!agency) throw new NotFoundException('Agency not found');
    return this.prisma.wallet.create({ data: { agencyId, currency: agency.currency, balance: 0 } });
  }

  async applyTransaction(input: ApplyTransactionInput) {
    const debit = round2(input.debit ?? 0);
    const credit = round2(input.credit ?? 0);
    if (debit < 0 || credit < 0) throw new BadRequestException('debit/credit amounts cannot be negative');
    if (debit > 0 && credit > 0) throw new BadRequestException('A single ledger entry moves money in one direction only');

    return this.prisma.$transaction(async (tx) => {
      // Idempotency first — a retried call with the same key returns the
      // original entry rather than applying the balance change twice.
      const existing = await tx.walletTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;

      const wallet = await tx.wallet.findUnique({ where: { agencyId: input.agencyId } });
      if (!wallet) throw new NotFoundException('This agency has no wallet yet');

      const agency = await tx.b2BAgency.findUniqueOrThrow({ where: { id: input.agencyId } });
      const previousBalance = Number(wallet.balance);
      const newBalance = round2(previousBalance - debit + credit);

      if (input.enforceCreditLimit) {
        const floor = agency.creditEnabled ? -Number(agency.creditLimit) : 0;
        if (newBalance < floor) {
          throw new InsufficientFundsError(round2(previousBalance - floor), debit, wallet.currency);
        }
      }

      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });

      return tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          bookingId: input.bookingId ?? null,
          hotelBookingId: input.hotelBookingId ?? null,
          type: input.type,
          debit,
          credit,
          previousBalance,
          newBalance,
          currency: wallet.currency,
          reference: input.reference ?? null,
          description: input.description ?? null,
          createdBy: input.createdBy ?? null,
          idempotencyKey: input.idempotencyKey,
        },
      });
    });
  }

  /** Debits the agency's wallet for a confirmed B2B booking. Rejects (InsufficientFundsError) rather than let the booking push the agency past its credit limit. */
  async debitForBooking(agencyId: string, amount: number, bookingId: string, bookingReference: string, idempotencyKey: string) {
    return this.applyTransaction({
      agencyId,
      type: 'BOOKING_DEBIT',
      debit: amount,
      bookingId,
      reference: bookingReference,
      description: `Booking ${bookingReference}`,
      idempotencyKey,
      enforceCreditLimit: true,
    });
  }

  /** Credits back a wallet-funded booking that failed after the debit was taken, or a refund. Never enforces the credit limit — a credit only ever moves the balance up. */
  async creditForBooking(agencyId: string, amount: number, bookingId: string, bookingReference: string, idempotencyKey: string, type: 'REFUND_CREDIT' | 'ADJUSTMENT_CREDIT' = 'ADJUSTMENT_CREDIT') {
    return this.applyTransaction({
      agencyId,
      type,
      credit: amount,
      bookingId,
      reference: bookingReference,
      description: `Reversal for booking ${bookingReference}`,
      idempotencyKey,
    });
  }

  /** Hotel-booking counterpart of debitForBooking — see ApplyTransactionInput.hotelBookingId. */
  async debitForHotelBooking(agencyId: string, amount: number, hotelBookingId: string, bookingReference: string, idempotencyKey: string) {
    return this.applyTransaction({
      agencyId,
      type: 'BOOKING_DEBIT',
      debit: amount,
      hotelBookingId,
      reference: bookingReference,
      description: `Hotel booking ${bookingReference}`,
      idempotencyKey,
      enforceCreditLimit: true,
    });
  }

  /** Hotel-booking counterpart of creditForBooking — see ApplyTransactionInput.hotelBookingId. */
  async creditForHotelBooking(agencyId: string, amount: number, hotelBookingId: string, bookingReference: string, idempotencyKey: string, type: 'REFUND_CREDIT' | 'ADJUSTMENT_CREDIT' = 'ADJUSTMENT_CREDIT') {
    return this.applyTransaction({
      agencyId,
      type,
      credit: amount,
      hotelBookingId,
      reference: bookingReference,
      description: `Reversal for hotel booking ${bookingReference}`,
      idempotencyKey,
    });
  }

  /** Admin-only deposit/adjustment — see WalletController's WALLET_ADJUST guard. */
  async adminAdjust(
    actingUser: AuthenticatedUser,
    agencyId: string,
    input: { type: 'DEPOSIT' | 'ADJUSTMENT_CREDIT' | 'ADJUSTMENT_DEBIT'; amount: number; description?: string },
    idempotencyKey: string,
  ) {
    if (input.amount <= 0) throw new BadRequestException('amount must be positive');
    await this.getOrCreateWallet(agencyId);

    const isDebit = input.type === 'ADJUSTMENT_DEBIT';
    const txn = await this.applyTransaction({
      agencyId,
      type: input.type === 'DEPOSIT' ? 'DEPOSIT' : isDebit ? 'ADJUSTMENT_DEBIT' : 'ADJUSTMENT_CREDIT',
      debit: isDebit ? input.amount : undefined,
      credit: isDebit ? undefined : input.amount,
      description: input.description,
      createdBy: actingUser.id,
      idempotencyKey,
      // A manual debit adjustment (e.g. correcting an error) is still an
      // explicit admin action — it can still be rejected past the credit
      // floor, same as a booking debit, so a mistaken adjustment can't
      // silently blow through an agency's credit terms either.
      enforceCreditLimit: isDebit,
    });

    await this.audit.record({
      userId: actingUser.id,
      action: 'WALLET_ADJUSTED',
      resource: 'wallet',
      resourceId: agencyId,
      newValue: { type: input.type, amount: input.amount, description: input.description },
    });

    return txn;
  }

  async getWalletForUser(user: AuthenticatedUser) {
    const agencyId = await this.resolveOwnAgencyId(user);
    return this.getOrCreateWallet(agencyId);
  }

  async listTransactionsForUser(user: AuthenticatedUser, pagination: { take: number; cursor?: string }) {
    const agencyId = await this.resolveOwnAgencyId(user);
    const wallet = await this.getOrCreateWallet(agencyId);
    return this.listTransactions(wallet.id, pagination);
  }

  async getWalletForAgency(user: AuthenticatedUser, agencyId: string) {
    this.assertCanManage(user);
    return this.getOrCreateWallet(agencyId);
  }

  async listTransactionsForAgency(user: AuthenticatedUser, agencyId: string, pagination: { take: number; cursor?: string }) {
    this.assertCanManage(user);
    const wallet = await this.getOrCreateWallet(agencyId);
    return this.listTransactions(wallet.id, pagination);
  }

  async listAgencyWallets(user: AuthenticatedUser) {
    this.assertCanManage(user);
    return this.prisma.b2BAgency.findMany({
      orderBy: { name: 'asc' },
      include: { wallet: true },
    });
  }

  private async listTransactions(walletId: string, pagination: { take: number; cursor?: string }) {
    return this.prisma.walletTransaction.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      take: pagination.take,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
    });
  }

  private assertCanManage(user: AuthenticatedUser): void {
    // WalletController's WALLET_ADJUST-guarded routes already enforce
    // this at the HTTP layer via PermissionsGuard — this second check is
    // defense in depth for anything that calls the service directly.
    if (!user.permissions.includes('wallet:adjust')) {
      throw new ForbiddenException('You do not have access to this agency wallet');
    }
  }

  private async resolveOwnAgencyId(user: AuthenticatedUser): Promise<string> {
    const record = await this.prisma.user.findUnique({ where: { id: user.id }, select: { agent: { select: { agencyId: true } } } });
    if (!record?.agent) {
      throw new ConflictException('This account is not a B2B agent and has no agency wallet');
    }
    return record.agent.agencyId;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
