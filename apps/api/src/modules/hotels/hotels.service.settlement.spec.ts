import { ConflictException, ForbiddenException } from '@nestjs/common';
import { HotelsService, HotelPriceChangedError } from './hotels.service';
import { InsufficientFundsError } from '../wallet/wallet.service';

/**
 * Covers HotelsService.createBooking's settlement branching — the two
 * highest money-risk decisions this service makes (previously untested,
 * per docs/ROADMAP.md's own honest "what remains" note for Phase 6):
 * mandatory reprice/price-change enforcement before a booking is ever
 * created, and which of wallet-vs-payment-gateway actually gets charged.
 * Mirrors bookings.service.agency-gate.spec.ts's fake-collaborators
 * style, including tracking calls with plain arrays rather than a mock
 * framework's call-assertion API (this repo's spec files are executed
 * directly under a minimal hand-rolled jest-compatible shim in this
 * sandbox — see run.mjs/globals.mjs — which only supports a small
 * matcher subset; real CI runs them under real jest, where this style
 * works identically). HotelsService intentionally has no state machine
 * (see its own class doc comment), so there's less to fake than
 * BookingsService.
 */
function makeOffer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'offer-1',
    supplierOfferId: 'sup-off-1',
    supplierCode: 'MOCK_HOTEL_A',
    totalFare: 200,
    currency: 'USD',
    search: { channel: 'B2C', expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    property: { name: 'Test Hotel' },
    ...overrides,
  };
}

function makeCollaborators(options: {
  reprice: { stillAvailable: boolean; priceChanged: boolean; newTotal?: number };
  supplierCreateResult?: { status: 'CONFIRMED' | 'FAILED'; supplierBookingReference?: string };
  actorAgencyId?: string;
  agencyStatus?: 'ACTIVE' | 'PENDING_APPROVAL' | 'SUSPENDED';
  walletDebitError?: InsufficientFundsError;
}) {
  const offer = makeOffer(options.actorAgencyId ? { search: { channel: 'B2B', expiresAt: new Date(Date.now() + 60 * 60 * 1000) } } : {});

  const createBookingCalls: unknown[] = [];
  const adapter = {
    repriceHotel: async () => options.reprice,
    createBooking: (...args: unknown[]) => {
      createBookingCalls.push(args);
      return Promise.resolve(options.supplierCreateResult ?? { status: 'CONFIRMED', supplierBookingReference: 'SUPH123' });
    },
  };

  const updateCalls: unknown[] = [];
  const bookingRow = { id: 'hbk-1', bookingReference: 'MH000001' };
  const prisma = {
    hotelBooking: {
      findUnique: async () => null, // no existing idempotent booking
      create: async (args: unknown) => {
        (prisma as any)._createArgs = args;
        return bookingRow;
      },
      update: async (args: unknown) => {
        updateCalls.push(args);
        return {};
      },
      findUniqueOrThrow: async () => ({ ...bookingRow, status: 'CONFIRMED', offer: { supplierCode: offer.supplierCode }, refunds: [] }),
    },
    hotelOffer: { findUnique: async () => offer },
    user: {
      findUnique: async () =>
        options.actorAgencyId ? { agent: { id: 'agent-1', agencyId: options.actorAgencyId } } : { customer: { id: 'cust-1' } },
    },
    b2BAgency: {
      findUniqueOrThrow: async () => ({ id: options.actorAgencyId, status: options.agencyStatus ?? 'ACTIVE', creditEnabled: false, creditLimit: 0 }),
    },
  } as any;

  const registry = { get: () => adapter };
  const orchestrator = {};
  const auditCalls: unknown[] = [];
  const audit = { record: async (entry: unknown) => auditCalls.push(entry) };
  const walletDebitCalls: unknown[] = [];
  const wallet = {
    getOrCreateWallet: async () => ({ balance: 100000, currency: 'USD' }),
    debitForHotelBooking: (...args: unknown[]) => {
      walletDebitCalls.push(args);
      if (options.walletDebitError) return Promise.reject(options.walletDebitError);
      return Promise.resolve({});
    },
    creditForHotelBooking: async () => ({}),
  };
  const paymentsChargeCalls: unknown[] = [];
  const payments = {
    chargeForHotelBooking: (...args: unknown[]) => {
      paymentsChargeCalls.push(args);
      return Promise.resolve({});
    },
    refundHotelPayment: async () => ({}),
  };
  const notifications = { sendBookingConfirmed: async () => ({}) };

  const service = new HotelsService(prisma, registry as any, orchestrator as any, audit as any, wallet as any, payments as any, notifications as any);

  const dto = { offerId: 'offer-1', rooms: 1, guestName: 'Jane Doe', contactEmail: 'jane@example.com', contactPhone: '+8801700000000', acceptedTotalAmount: undefined as number | undefined };
  const user = { id: 'user-1', email: 'jane@example.com', fullName: 'Jane', roles: ['B2C_CUSTOMER'], permissions: [] };

  return { service, dto, user, prisma, createBookingCalls, updateCalls, walletDebitCalls, paymentsChargeCalls, auditCalls };
}

describe('HotelsService.createBooking — mandatory reprice / price-change enforcement', () => {
  it('refuses to book when the supplier reports the rate is no longer available', async () => {
    const { service, dto, user, prisma, createBookingCalls } = makeCollaborators({ reprice: { stillAvailable: false, priceChanged: false } });
    await expect(service.createBooking(user as any, dto as any, 'idem-1')).rejects.toBeInstanceOf(ConflictException);
    expect((prisma as any)._createArgs).toBeUndefined();
    expect(createBookingCalls).toHaveLength(0);
  });

  it('throws HotelPriceChangedError when the price changed and the caller has not accepted the new total', async () => {
    const { service, dto, user, prisma } = makeCollaborators({ reprice: { stillAvailable: true, priceChanged: true, newTotal: 250 } });
    await expect(service.createBooking(user as any, dto as any, 'idem-2')).rejects.toBeInstanceOf(HotelPriceChangedError);
    expect((prisma as any)._createArgs).toBeUndefined();
  });

  it('proceeds to book at the new total once the caller explicitly accepts the changed price', async () => {
    const { service, dto, user, prisma } = makeCollaborators({ reprice: { stillAvailable: true, priceChanged: true, newTotal: 250 } });
    await service.createBooking(user as any, { ...dto, acceptedTotalAmount: 250 } as any, 'idem-3');
    expect((prisma as any)._createArgs).toMatchObject({ data: { totalAmount: 250 } });
  });
});

describe('HotelsService.createBooking — wallet vs. payment-gateway settlement', () => {
  it('a B2B (agency) booking settles through the wallet, never the payment gateway', async () => {
    const { service, dto, user, walletDebitCalls, paymentsChargeCalls } = makeCollaborators({ reprice: { stillAvailable: true, priceChanged: false }, actorAgencyId: 'agency-1' });
    await service.createBooking(user as any, dto as any, 'idem-4');
    expect(walletDebitCalls).toHaveLength(1);
    expect(paymentsChargeCalls).toHaveLength(0);
  });

  it('a non-agency (B2C/Corporate) booking settles through the payment gateway, never the wallet', async () => {
    const { service, dto, user, walletDebitCalls, paymentsChargeCalls } = makeCollaborators({ reprice: { stillAvailable: true, priceChanged: false } });
    await service.createBooking(user as any, dto as any, 'idem-5');
    expect(paymentsChargeCalls).toHaveLength(1);
    expect(walletDebitCalls).toHaveLength(0);
  });

  it('never calls the wallet or payment gateway when the supplier declines to confirm the booking', async () => {
    const { service, dto, user, updateCalls, walletDebitCalls, paymentsChargeCalls } = makeCollaborators({
      reprice: { stillAvailable: true, priceChanged: false },
      supplierCreateResult: { status: 'FAILED' },
    });
    await service.createBooking(user as any, dto as any, 'idem-6');
    expect(walletDebitCalls).toHaveLength(0);
    expect(paymentsChargeCalls).toHaveLength(0);
    expect(updateCalls[updateCalls.length - 1]).toMatchObject({ data: { status: 'FAILED' } });
  });

  it('a wallet debit failure after supplier confirmation is logged to audit, never thrown, and the booking stays CONFIRMED (needs manual reconciliation, matching flights\' documented posture)', async () => {
    const { service, dto, user, updateCalls, auditCalls } = makeCollaborators({
      reprice: { stillAvailable: true, priceChanged: false },
      actorAgencyId: 'agency-1',
      walletDebitError: new InsufficientFundsError('insufficient funds'),
    });
    // Must resolve, not throw — a supplier-confirmed booking is never
    // rolled back just because the wallet debit failed after the fact.
    const result = await service.createBooking(user as any, dto as any, 'idem-7');
    expect(result).toMatchObject({ id: 'hbk-1' });
    expect(auditCalls.some((a: any) => a.action === 'HOTEL_BOOKING_WALLET_DEBIT_FAILED')).toBe(true);
    // The booking's own status update to CONFIRMED must have already
    // happened before the wallet was ever touched.
    expect(updateCalls.some((c: any) => c.data?.status === 'CONFIRMED')).toBe(true);
  });

  it('rejects a booking for a non-ACTIVE agency before ever calling the supplier (same ACTIVE gate as flights)', async () => {
    const { service, dto, user, createBookingCalls } = makeCollaborators({
      reprice: { stillAvailable: true, priceChanged: false },
      actorAgencyId: 'agency-1',
      agencyStatus: 'PENDING_APPROVAL',
    });
    await expect(service.createBooking(user as any, dto as any, 'idem-8')).rejects.toBeInstanceOf(ForbiddenException);
    expect(createBookingCalls).toHaveLength(0);
  });
});
