import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, Permission } from '@mohammad-travels/types';
import { WalletService, InsufficientFundsError } from './wallet.service';
import { AdjustWalletDto } from './dto/adjust-wallet.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Agent/agency-admin-facing wallet endpoints — always the CALLING
 * user's own agency, resolved server-side from their Agent record.
 * There is deliberately no :agencyId param here; that's what
 * admin/wallets below is for, and only WALLET_ADJUST holders get it —
 * see docs/ARCHITECTURE.md § RBAC on why "own agency only" is enforced
 * in the service layer, not just by hiding the UI control.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @RequirePermissions(Permission.WALLET_READ_OWN)
  @Get()
  async getOwnWallet(@CurrentUser() user: AuthenticatedUser) {
    return serializeWallet(await this.walletService.getWalletForUser(user));
  }

  @RequirePermissions(Permission.WALLET_READ_OWN)
  @Get('transactions')
  async listOwnTransactions(@CurrentUser() user: AuthenticatedUser, @Query('cursor') cursor?: string, @Query('take') take?: string) {
    const transactions = await this.walletService.listTransactionsForUser(user, { take: parseTake(take), cursor });
    return { transactions: transactions.map(serializeTransaction) };
  }
}

/**
 * Platform-admin wallet management — FINANCE/SUPER_ADMIN only
 * (Permission.WALLET_ADJUST). Lets ops fund an agency's wallet
 * (DEPOSIT) or correct it (ADJUSTMENT_CREDIT/ADJUSTMENT_DEBIT); every
 * write is idempotency-keyed and audit-logged, same as a booking.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/wallets')
export class AdminWalletController {
  constructor(private readonly walletService: WalletService) {}

  @RequirePermissions(Permission.WALLET_ADJUST)
  @Get()
  async listAgencyWallets(@CurrentUser() user: AuthenticatedUser) {
    const agencies = await this.walletService.listAgencyWallets(user);
    return {
      agencies: agencies.map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        currency: a.currency,
        creditEnabled: a.creditEnabled,
        creditLimit: Number(a.creditLimit),
        wallet: a.wallet ? serializeWallet(a.wallet) : null,
      })),
    };
  }

  @RequirePermissions(Permission.WALLET_ADJUST)
  @Get(':agencyId')
  async getAgencyWallet(@CurrentUser() user: AuthenticatedUser, @Param('agencyId') agencyId: string) {
    assertUuid(agencyId);
    return serializeWallet(await this.walletService.getWalletForAgency(user, agencyId));
  }

  @RequirePermissions(Permission.WALLET_ADJUST)
  @Get(':agencyId/transactions')
  async listAgencyTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agencyId') agencyId: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    assertUuid(agencyId);
    const transactions = await this.walletService.listTransactionsForAgency(user, agencyId, { take: parseTake(take), cursor });
    return { transactions: transactions.map(serializeTransaction) };
  }

  @RequirePermissions(Permission.WALLET_ADJUST)
  @Post(':agencyId/adjust')
  async adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agencyId') agencyId: string,
    @Body() dto: AdjustWalletDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    assertUuid(agencyId);
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new BadRequestException('An Idempotency-Key header (at least 8 characters) is required to adjust a wallet');
    }
    try {
      const txn = await this.walletService.adminAdjust(user, agencyId, dto, idempotencyKey);
      return serializeTransaction(txn);
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        return {
          error: 'INSUFFICIENT_FUNDS',
          available: err.available,
          requested: err.requested,
          currency: err.currency,
          message: err.message,
        };
      }
      throw err;
    }
  }
}

function parseTake(raw?: string): number {
  const n = raw ? Number(raw) : 20;
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(n, 100);
}

function assertUuid(value: string): void {
  if (!UUID_RE.test(value)) throw new BadRequestException('agencyId is not a valid id');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeWallet(wallet: any) {
  return {
    id: wallet.id,
    agencyId: wallet.agencyId,
    currency: wallet.currency,
    balance: Number(wallet.balance),
    updatedAt: wallet.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeTransaction(t: any) {
  return {
    id: t.id,
    type: t.type,
    debit: Number(t.debit),
    credit: Number(t.credit),
    previousBalance: Number(t.previousBalance),
    newBalance: Number(t.newBalance),
    currency: t.currency,
    reference: t.reference,
    description: t.description,
    bookingId: t.bookingId,
    createdAt: t.createdAt,
  };
}
