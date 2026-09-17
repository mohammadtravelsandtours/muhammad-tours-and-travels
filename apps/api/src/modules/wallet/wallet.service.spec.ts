import { BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { WalletService, InsufficientFundsError } from './wallet.service';

/**
 * WalletService is the single writer of Wallet.balance (see its own
 * doc comment) — the highest-financial-risk piece of the platform, so
 * this is a real execution test against an in-memory fake Prisma
 * (including a working $transaction), not just a syntax check. This
 * supersedes an earlier throwaway tsx harness used to verify the same
 * behavior before this suite existed; that one is gone, this is the
 * permanent, CI-checked version of it.
 */
function makeFakePrisma() {
  const wallets = new Map<string, any>(); // keyed by agencyId
  const walletsById = new Map<string, any>();
  const agencies = new Map<string, any>();
  const walletTransactions = new Map<string, any>();
  let seq = 0;

  function seedAgency(agency: { id: string; currency?: string; creditEnabled?: boolean; creditLimit?: number }) {
    const row = { currency: 'USD', creditEnabled: false, creditLimit: 0, ...agency };
    agencies.set(row.id, row);
  }

  function seedWallet(wallet: { id: string; agencyId: string; currency?: string; balance?: number }) {
    const row = { currency: 'USD', balance: 0, ...wallet };
    wallets.set(row.agencyId, row);
    walletsById.set(row.id, row);
  }

  const tx = {
    walletTransaction: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.idempotencyKey !== undefined) {
          for (const t of walletTransactions.values()) if (t.idempotencyKey === where.idempotencyKey) return t;
          return null;
        }
        return walletTransactions.get(where.id) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const id = `txn-${++seq}`;
        const row = { id, createdAt: new Date(), ...data };
        walletTransactions.set(id, row);
        return row;
      }),
    },
    wallet: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.agencyId !== undefined) return wallets.get(where.agencyId) ?? null;
        return walletsById.get(where.id) ?? null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = walletsById.get(where.id);
        if (!row) throw new Error(`no wallet ${where.id}`);
        Object.assign(row, data);
        return row;
      }),
      create: jest.fn(async ({ data }: any) => {
        const id = `wallet-${data.agencyId}`;
        const row = { id, ...data };
        seedWallet(row);
        return row;
      }),
    },
    b2BAgency: {
      findUnique: jest.fn(async ({ where }: any) => agencies.get(where.id) ?? null),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const row = agencies.get(where.id);
        if (!row) throw new Error(`no agency ${where.id}`);
        return row;
      }),
      findMany: jest.fn(async () => [...agencies.values()].map((a) => ({ ...a, wallet: wallets.get(a.id) ?? null }))),
    },
    user: { findUnique: jest.fn() },
  };

  const prisma = {
    ...tx,
    $transaction: jest.fn(async (fn: (tx: typeof tx) => unknown) => fn(tx)),
  };

  return { prisma, seedAgency, seedWallet, walletsById };
}

describe('WalletService.applyTransaction', () => {
  const audit = { record: jest.fn() };

  it('debits a wallet with no credit line and records the ledger entry', async () => {
    const { prisma, seedAgency, seedWallet } = makeFakePrisma();
    seedAgency({ id: 'ag-1' });
    seedWallet({ id: 'w-1', agencyId: 'ag-1', balance: 500 });
    const wallet = new WalletService(prisma as any, audit as any);

    const txn = await wallet.debitForBooking('ag-1', 120, 'bk-1', 'MT-0001', 'idem-1');

    expect(txn.previousBalance).toBe(500);
    expect(txn.newBalance).toBe(380);
    expect(txn.debit).toBe(120);
    expect(txn.credit).toBe(0);
  });

  it('replays an idempotency key instead of debiting twice', async () => {
    const { prisma, seedAgency, seedWallet } = makeFakePrisma();
    seedAgency({ id: 'ag-1' });
    seedWallet({ id: 'w-1', agencyId: 'ag-1', balance: 500 });
    const wallet = new WalletService(prisma as any, audit as any);

    const first = await wallet.debitForBooking('ag-1', 120, 'bk-1', 'MT-0001', 'idem-1');
    const second = await wallet.debitForBooking('ag-1', 120, 'bk-1', 'MT-0001', 'idem-1');

    expect(second.id).toBe(first.id);
    const finalWallet = await prisma.wallet.findUnique({ where: { agencyId: 'ag-1' } });
    expect(finalWallet.balance).toBe(380); // not 260 — the retry did not debit again
  });

  it('rejects a debit that would exceed the agency credit limit', async () => {
    const { prisma, seedAgency, seedWallet } = makeFakePrisma();
    seedAgency({ id: 'ag-1', creditEnabled: true, creditLimit: 100 });
    seedWallet({ id: 'w-1', agencyId: 'ag-1', balance: 0 });
    const wallet = new WalletService(prisma as any, audit as any);

    await expect(wallet.debitForBooking('ag-1', 150, 'bk-1', 'MT-0001', 'idem-1')).rejects.toBeInstanceOf(
      InsufficientFundsError,
    );
    const finalWallet = await prisma.wallet.findUnique({ where: { agencyId: 'ag-1' } });
    expect(finalWallet.balance).toBe(0); // rejected — balance must not have moved
  });

  it('allows a debit that draws on an approved credit line without exceeding it', async () => {
    const { prisma, seedAgency, seedWallet } = makeFakePrisma();
    seedAgency({ id: 'ag-1', creditEnabled: true, creditLimit: 100 });
    seedWallet({ id: 'w-1', agencyId: 'ag-1', balance: 0 });
    const wallet = new WalletService(prisma as any, audit as any);

    const txn = await wallet.debitForBooking('ag-1', 80, 'bk-1', 'MT-0001', 'idem-1');
    expect(txn.newBalance).toBe(-80); // within the -100 floor
  });

  it('never lets one ledger entry move money in both directions at once', async () => {
    const { prisma, seedAgency, seedWallet } = makeFakePrisma();
    seedAgency({ id: 'ag-1' });
    seedWallet({ id: 'w-1', agencyId: 'ag-1', balance: 0 });
    const wallet = new WalletService(prisma as any, audit as any);

    await expect(
      wallet.applyTransaction({ agencyId: 'ag-1', type: 'ADJUSTMENT_CREDIT', debit: 10, credit: 10, idempotencyKey: 'x' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects negative amounts outright', async () => {
    const { prisma, seedAgency, seedWallet } = makeFakePrisma();
    seedAgency({ id: 'ag-1' });
    seedWallet({ id: 'w-1', agencyId: 'ag-1', balance: 0 });
    const wallet = new WalletService(prisma as any, audit as any);

    await expect(
      wallet.applyTransaction({ agencyId: 'ag-1', type: 'ADJUSTMENT_CREDIT', credit: -5, idempotencyKey: 'x' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a deposit never enforces the credit limit, however large', async () => {
    const { prisma, seedAgency, seedWallet } = makeFakePrisma();
    seedAgency({ id: 'ag-1', creditEnabled: true, creditLimit: 50 });
    seedWallet({ id: 'w-1', agencyId: 'ag-1', balance: -50 });
    const wallet = new WalletService(prisma as any, audit as any);

    const txn = await wallet.adminAdjust(
      { id: 'admin-1', permissions: [] } as any,
      'ag-1',
      { type: 'DEPOSIT', amount: 10_000 },
      'idem-deposit-1',
    );
    expect(txn.newBalance).toBe(9_950);
  });

  it('an admin debit adjustment still cannot push an agency past its credit floor', async () => {
    const { prisma, seedAgency, seedWallet } = makeFakePrisma();
    seedAgency({ id: 'ag-1', creditEnabled: true, creditLimit: 50 });
    seedWallet({ id: 'w-1', agencyId: 'ag-1', balance: 0 });
    const wallet = new WalletService(prisma as any, audit as any);

    await expect(
      wallet.adminAdjust({ id: 'admin-1', permissions: [] } as any, 'ag-1', { type: 'ADJUSTMENT_DEBIT', amount: 60 }, 'idem-adj-1'),
    ).rejects.toBeInstanceOf(InsufficientFundsError);
  });
});

describe('WalletService admin-only access', () => {
  const audit = { record: jest.fn() };

  it('refuses to read an agency wallet without wallet:adjust', async () => {
    const { prisma, seedAgency, seedWallet } = makeFakePrisma();
    seedAgency({ id: 'ag-1' });
    seedWallet({ id: 'w-1', agencyId: 'ag-1', balance: 0 });
    const wallet = new WalletService(prisma as any, audit as any);

    await expect(wallet.getWalletForAgency({ id: 'u1', permissions: [] } as any, 'ag-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows reading an agency wallet with wallet:adjust', async () => {
    const { prisma, seedAgency, seedWallet } = makeFakePrisma();
    seedAgency({ id: 'ag-1' });
    seedWallet({ id: 'w-1', agencyId: 'ag-1', balance: 42 });
    const wallet = new WalletService(prisma as any, audit as any);

    const result = await wallet.getWalletForAgency({ id: 'u1', permissions: ['wallet:adjust'] } as any, 'ag-1');
    expect(result.balance).toBe(42);
  });
});

describe('WalletService.getWalletForUser', () => {
  it('refuses a user with no agent profile rather than guessing an agency', async () => {
    const { prisma } = makeFakePrisma();
    prisma.user.findUnique.mockResolvedValue({ agent: null });
    const wallet = new WalletService(prisma as any, { record: jest.fn() } as any);

    await expect(wallet.getWalletForUser({ id: 'u1', permissions: [] } as any)).rejects.toBeInstanceOf(ConflictException);
  });
});
