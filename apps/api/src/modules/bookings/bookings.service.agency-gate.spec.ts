import { ForbiddenException } from '@nestjs/common';
import { BookingsService } from './bookings.service';

/**
 * Regression test for a real gap fixed alongside this suite: a
 * self-registered B2B agency starts PENDING_APPROVAL (see
 * AuthService.register) and nothing previously checked that status at
 * booking time — a brand-new, never-reviewed agency could book and spend
 * from its wallet immediately, before any admin ever looked at it. The
 * fix is the `agency.status !== 'ACTIVE'` check in
 * BookingsService.createBooking, right after the wallet is loaded and
 * before the funds check or any supplier call. This spec pins that: the
 * supplier adapter must never be reached for a non-ACTIVE agency.
 */
function makeOffer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'offer-1',
    supplierOfferId: 'sup-off-1',
    baseFare: 100,
    taxes: 10,
    fees: 5,
    markupAmount: 0,
    currency: 'USD',
    cabin: 'ECONOMY',
    supplier: { code: 'MOCK_SUPPLIER_A' },
    search: { expiresAt: new Date(Date.now() + 60 * 60 * 1000), channel: 'B2B' },
    segments: [],
    ...overrides,
  };
}

function makeCollaborators(agencyStatus: 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED') {
  const createBookingCalls: unknown[] = [];
  const adapter = {
    repriceFlight: jest.fn().mockResolvedValue({ stillAvailable: true, priceChanged: false }),
    createBooking: (...args: unknown[]) => {
      createBookingCalls.push(args);
      return Promise.resolve({ status: 'CONFIRMED', supplierBookingReference: 'SUP123' });
    },
    // issueTicket intentionally omitted — issueTicketsForBooking() no-ops without it.
  };

  const offer = makeOffer();
  const prisma = {
    booking: {
      findUnique: jest.fn().mockResolvedValue(null), // no existing idempotent booking
      create: jest.fn().mockResolvedValue({ id: 'bk-1', bookingReference: 'MT000001', createdAt: new Date() }),
      update: jest.fn().mockResolvedValue({}),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'bk-1', bookingReference: 'MT000001', status: 'CONFIRMED' }),
    },
    flightOffer: { findUnique: jest.fn().mockResolvedValue(offer) },
    user: { findUnique: jest.fn().mockResolvedValue({ agent: { id: 'agent-1', agencyId: 'agency-1' } }) },
    b2BAgency: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'agency-1', status: agencyStatus, creditEnabled: false, creditLimit: 0 }) },
  };
  const supplierRegistry = { get: () => adapter };
  const stateMachine = { transition: jest.fn() };
  const audit = { record: jest.fn() };
  const wallet = {
    getOrCreateWallet: jest.fn().mockResolvedValue({ balance: 1000, currency: 'USD' }),
    debitForBooking: jest.fn(),
  };
  const payments = { chargeForBooking: jest.fn() };
  const notifications = { sendBookingConfirmed: jest.fn(), sendBookingFailed: jest.fn() };
  const googleSheets = { recordBooking: jest.fn() };
  const travelPolicy = {};

  const service = new BookingsService(
    prisma as any,
    supplierRegistry as any,
    stateMachine as any,
    audit as any,
    wallet as any,
    payments as any,
    notifications as any,
    googleSheets as any,
    travelPolicy as any,
  );

  const dto = { offerId: 'offer-1', passengers: [], contactName: 'Jane Doe', contactEmail: 'jane@example.com', contactPhone: '+8801700000000' };
  const user = { id: 'user-1', email: 'jane@example.com', fullName: 'Jane', roles: ['B2B_AGENT'], permissions: [] };

  return { service, dto, user, prisma, createBookingCalls };
}

describe('BookingsService.createBooking — agency ACTIVE gate', () => {
  it('rejects a booking for a PENDING_APPROVAL agency before ever calling the supplier', async () => {
    const { service, dto, user, createBookingCalls } = makeCollaborators('PENDING_APPROVAL');
    await expect(service.createBooking(user as any, dto as any, 'idem-key-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(createBookingCalls).toHaveLength(0);
  });

  it('rejects a booking for a SUSPENDED agency before ever calling the supplier', async () => {
    const { service, dto, user, createBookingCalls } = makeCollaborators('SUSPENDED');
    await expect(service.createBooking(user as any, dto as any, 'idem-key-2')).rejects.toBeInstanceOf(ForbiddenException);
    expect(createBookingCalls).toHaveLength(0);
  });

  it('proceeds to the supplier for an ACTIVE agency', async () => {
    const { service, dto, user, createBookingCalls } = makeCollaborators('ACTIVE');
    const result = await service.createBooking(user as any, dto as any, 'idem-key-3');
    expect(createBookingCalls).toHaveLength(1);
    expect(result).toMatchObject({ id: 'bk-1' });
  });
});
