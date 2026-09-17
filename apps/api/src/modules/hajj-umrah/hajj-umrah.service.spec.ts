import { ConflictException, ForbiddenException } from '@nestjs/common';
import { HajjUmrahService } from './hajj-umrah.service';

/**
 * Covers HajjUmrahService's money/capacity logic — the parts of this
 * new phase with real financial and overbooking risk, mirroring
 * hotels.service.settlement.spec.ts's fake-collaborators style (manual
 * call-tracking arrays, only this sandbox's jest-shim matcher subset —
 * see that file's own doc comment for why). In particular:
 * - calculateMinimumDeposit's two branches (PERCENTAGE of the
 *   pilgrim-scaled total; FIXED per pilgrim, not a flat booking total —
 *   see that method's doc comment on why FIXED is interpreted per
 *   pilgrim).
 * - the seats-remaining capacity guard inside createBooking's
 *   $transaction.
 * - computeStatus's four-way status transition
 *   (PENDING_DEPOSIT/DEPOSIT_PAID/PARTIALLY_PAID/FULLY_PAID).
 * - that a failed initial charge leaves the seat reserved (this
 *   service's documented "no hold-expiry" tradeoff) rather than rolling
 *   back the reservation.
 * - paymentMethodToken threading through to PaymentsService.
 */
function makePackage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pkg-1',
    active: true,
    departureDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60), // 60 days out
    totalAmount: 1000, // per pilgrim
    depositType: 'PERCENTAGE',
    depositValue: 20,
    capacity: 10,
    seatsBooked: 0,
    currency: 'USD',
    ...overrides,
  };
}

function makeFakePrisma(options: { packages: Record<string, any>; userRecords?: Record<string, any> }) {
  const packages = new Map(Object.entries(options.packages));
  const bookings = new Map<string, any>();
  const userRecords = options.userRecords ?? { 'user-1': { customer: { id: 'cust-1' } } };
  let seq = 0;

  const bookingModel = {
    findUnique: async ({ where }: any) => {
      if (where.idempotencyKey !== undefined) {
        for (const b of bookings.values()) if (b.idempotencyKey === where.idempotencyKey) return b;
        return null;
      }
      if (where.bookingReference !== undefined) {
        for (const b of bookings.values()) if (b.bookingReference === where.bookingReference) return b;
        return null;
      }
      return where.id !== undefined ? (bookings.get(where.id) ?? null) : null;
    },
    findUniqueOrThrow: async ({ where }: any) => {
      const found = bookings.get(where.id);
      if (!found) throw new Error(`no fake booking ${where.id}`);
      return found;
    },
    create: async ({ data }: any) => {
      seq += 1;
      const row = { id: `booking-${seq}`, ...data };
      bookings.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const updated = { ...bookings.get(where.id), ...data };
      bookings.set(where.id, updated);
      return updated;
    },
  };

  const packageModel = {
    findUnique: async ({ where }: any) => packages.get(where.id) ?? null,
    update: async ({ where, data }: any) => {
      const row = packages.get(where.id);
      const updated = { ...row };
      if (data.seatsBooked?.increment !== undefined) updated.seatsBooked = row.seatsBooked + data.seatsBooked.increment;
      packages.set(where.id, updated);
      return updated;
    },
  };

  const userModel = { findUnique: async ({ where }: any) => userRecords[where.id] ?? null };

  const prisma: any = { hajjUmrahPackage: packageModel, hajjUmrahBooking: bookingModel, user: userModel };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);

  return { prisma, packages, bookings };
}

function makePaymentsFake(statusToReturn: 'PAID' | 'FAILED' = 'PAID') {
  const calls: any[] = [];
  return {
    payments: {
      chargeForHajjUmrahBooking: async (
        hajjUmrahBookingId: string,
        bookingReference: string,
        amount: number,
        currency: string,
        idempotencyKey: string,
        paymentMethodToken?: string,
      ) => {
        calls.push({ hajjUmrahBookingId, bookingReference, amount, currency, idempotencyKey, paymentMethodToken });
        return { status: statusToReturn, amount };
      },
    },
    calls,
  };
}

const auditFake = { record: async () => undefined };
const notificationsFake = { sendHajjUmrahBookingConfirmed: async () => undefined };

const BASE_DTO = { packageId: 'pkg-1', pilgrims: 2, leadPilgrimName: 'Ali', contactPhone: '+8801700000000', contactEmail: 'ali@example.com' };
const USER_1 = { id: 'user-1', permissions: [] as string[] };

describe('HajjUmrahService.createBooking — deposit calculation', () => {
  it('PERCENTAGE: computes the deposit as a % of the pilgrim-scaled total (2 pilgrims × 1000, 20% deposit = 400)', async () => {
    const { prisma } = makeFakePrisma({ packages: { 'pkg-1': makePackage({ depositType: 'PERCENTAGE', depositValue: 20, totalAmount: 1000 }) } });
    const { payments } = makePaymentsFake('PAID');
    const service = new HajjUmrahService(prisma, auditFake as any, payments as any, notificationsFake as any);

    const booking = await service.createBooking(USER_1 as any, BASE_DTO as any, 'idem-1');
    expect(booking.totalAmount).toBe(2000);
    expect(booking.minimumDepositAmount).toBe(400);
    expect(booking.amountPaid).toBe(400);
    expect(booking.status).toBe('DEPOSIT_PAID');
  });

  it('FIXED: computes the deposit as a flat amount PER PILGRIM, not a flat amount for the whole booking (3 pilgrims × 200/pilgrim = 600)', async () => {
    const { prisma } = makeFakePrisma({ packages: { 'pkg-1': makePackage({ depositType: 'FIXED', depositValue: 200, totalAmount: 1000, capacity: 10 }) } });
    const { payments } = makePaymentsFake('PAID');
    const service = new HajjUmrahService(prisma, auditFake as any, payments as any, notificationsFake as any);

    const booking = await service.createBooking(USER_1 as any, { ...BASE_DTO, pilgrims: 3 } as any, 'idem-2');
    expect(booking.totalAmount).toBe(3000);
    expect(booking.minimumDepositAmount).toBe(600);
    expect(booking.amountPaid).toBe(600);
  });

  it('rejects an explicit paymentAmount below the computed minimum deposit, before ever calling the payment provider', async () => {
    const { prisma } = makeFakePrisma({ packages: { 'pkg-1': makePackage({ depositType: 'PERCENTAGE', depositValue: 20, totalAmount: 1000 }) } });
    const { payments, calls } = makePaymentsFake('PAID');
    const service = new HajjUmrahService(prisma, auditFake as any, payments as any, notificationsFake as any);

    await expect(service.createBooking(USER_1 as any, { ...BASE_DTO, paymentAmount: 100 } as any, 'idem-3')).rejects.toBeInstanceOf(ConflictException);
    expect(calls).toHaveLength(0);
  });
});

describe('HajjUmrahService.createBooking — capacity guard', () => {
  it('refuses to book when there are not enough seats remaining, and never touches the payment provider or the seat count', async () => {
    const { prisma, packages } = makeFakePrisma({ packages: { 'pkg-1': makePackage({ capacity: 5, seatsBooked: 4 }) } });
    const { payments, calls } = makePaymentsFake('PAID');
    const service = new HajjUmrahService(prisma, auditFake as any, payments as any, notificationsFake as any);

    // 4 already booked + 2 requested > capacity 5.
    await expect(service.createBooking(USER_1 as any, BASE_DTO as any, 'idem-4')).rejects.toBeInstanceOf(ConflictException);
    expect(calls).toHaveLength(0);
    expect((packages.get('pkg-1') as any).seatsBooked).toBe(4);
  });

  it('allows a booking that exactly fills the remaining capacity', async () => {
    const { prisma, packages } = makeFakePrisma({ packages: { 'pkg-1': makePackage({ capacity: 5, seatsBooked: 3 }) } });
    const { payments } = makePaymentsFake('PAID');
    const service = new HajjUmrahService(prisma, auditFake as any, payments as any, notificationsFake as any);

    await service.createBooking(USER_1 as any, BASE_DTO as any, 'idem-5'); // 3 + 2 == 5
    expect((packages.get('pkg-1') as any).seatsBooked).toBe(5);
  });

  it('rejects a booking against an inactive package before touching the payment provider', async () => {
    const { prisma } = makeFakePrisma({ packages: { 'pkg-1': makePackage({ active: false }) } });
    const { payments, calls } = makePaymentsFake('PAID');
    const service = new HajjUmrahService(prisma, auditFake as any, payments as any, notificationsFake as any);

    await expect(service.createBooking(USER_1 as any, BASE_DTO as any, 'idem-6')).rejects.toBeInstanceOf(ConflictException);
    expect(calls).toHaveLength(0);
  });
});

describe('HajjUmrahService.createBooking — status transitions and the no-hold-expiry tradeoff', () => {
  it('paying more than the minimum deposit upfront marks PARTIALLY_PAID, not DEPOSIT_PAID', async () => {
    const { prisma } = makeFakePrisma({ packages: { 'pkg-1': makePackage({ depositType: 'PERCENTAGE', depositValue: 20, totalAmount: 1000 }) } });
    const { payments } = makePaymentsFake('PAID');
    const service = new HajjUmrahService(prisma, auditFake as any, payments as any, notificationsFake as any);

    // total 2000, minimum deposit 400, pays 600.
    const booking = await service.createBooking(USER_1 as any, { ...BASE_DTO, paymentAmount: 600 } as any, 'idem-7');
    expect(booking.amountPaid).toBe(600);
    expect(booking.status).toBe('PARTIALLY_PAID');
  });

  it('paying the full total upfront marks FULLY_PAID', async () => {
    const { prisma } = makeFakePrisma({ packages: { 'pkg-1': makePackage({ depositType: 'PERCENTAGE', depositValue: 20, totalAmount: 1000 }) } });
    const { payments } = makePaymentsFake('PAID');
    const service = new HajjUmrahService(prisma, auditFake as any, payments as any, notificationsFake as any);

    const booking = await service.createBooking(USER_1 as any, { ...BASE_DTO, paymentAmount: 2000 } as any, 'idem-8');
    expect(booking.status).toBe('FULLY_PAID');
  });

  it('a failed initial charge leaves the booking PENDING_DEPOSIT with amountPaid 0 — but the seat stays reserved (no hold-expiry, see class doc comment)', async () => {
    const { prisma, packages } = makeFakePrisma({ packages: { 'pkg-1': makePackage({ capacity: 10, seatsBooked: 0 }) } });
    const { payments } = makePaymentsFake('FAILED');
    const service = new HajjUmrahService(prisma, auditFake as any, payments as any, notificationsFake as any);

    const booking = await service.createBooking(USER_1 as any, BASE_DTO as any, 'idem-9');
    expect(booking.status).toBe('PENDING_DEPOSIT');
    expect(booking.amountPaid).toBe(0);
    expect((packages.get('pkg-1') as any).seatsBooked).toBe(2); // still reserved despite the failed charge
  });

  it('a retried createBooking call with the same idempotency key never reserves seats twice', async () => {
    const { prisma, packages } = makeFakePrisma({ packages: { 'pkg-1': makePackage({ capacity: 10, seatsBooked: 0 }) } });
    const { payments, calls } = makePaymentsFake('PAID');
    const service = new HajjUmrahService(prisma, auditFake as any, payments as any, notificationsFake as any);

    const first = await service.createBooking(USER_1 as any, BASE_DTO as any, 'idem-10');
    const second = await service.createBooking(USER_1 as any, BASE_DTO as any, 'idem-10');
    expect(second.id).toBe(first.id);
    expect((packages.get('pkg-1') as any).seatsBooked).toBe(2); // not 4
    expect(calls).toHaveLength(1); // second call short-circuited before any charge
  });
});

describe('HajjUmrahService.createBooking — paymentMethodToken threading', () => {
  it('passes paymentMethodToken through to PaymentsService.chargeForHajjUmrahBooking untouched', async () => {
    const { prisma } = makeFakePrisma({ packages: { 'pkg-1': makePackage() } });
    const { payments, calls } = makePaymentsFake('PAID');
    const service = new HajjUmrahService(prisma, auditFake as any, payments as any, notificationsFake as any);

    await service.createBooking(USER_1 as any, { ...BASE_DTO, paymentMethodToken: 'pm_test_123' } as any, 'idem-11');
    expect(calls[0].paymentMethodToken).toBe('pm_test_123');
  });
});

describe('HajjUmrahService.addPayment — installments', () => {
  async function makeBookedFixture() {
    const { prisma, packages, bookings } = makeFakePrisma({ packages: { 'pkg-1': makePackage({ depositType: 'PERCENTAGE', depositValue: 20, totalAmount: 1000 }) } });
    const { payments, calls } = makePaymentsFake('PAID');
    const service = new HajjUmrahService(prisma, auditFake as any, payments as any, notificationsFake as any);
    const booking = await service.createBooking(USER_1 as any, BASE_DTO as any, 'idem-seed'); // total 2000, deposit 400 paid
    return { service, booking, calls, packages, bookings };
  }

  it('an installment that reaches the full total marks the booking FULLY_PAID', async () => {
    const { service, booking } = await makeBookedFixture();
    const updated = await service.addPayment(USER_1 as any, booking.id, { amount: 1600 } as any, 'idem-pay-1'); // 400 + 1600 = 2000
    expect(updated.status).toBe('FULLY_PAID');
    expect(updated.amountPaid).toBe(2000);
  });

  it('an installment that does not reach the full total marks PARTIALLY_PAID', async () => {
    const { service, booking } = await makeBookedFixture();
    const updated = await service.addPayment(USER_1 as any, booking.id, { amount: 800 } as any, 'idem-pay-2'); // 400 + 800 = 1200 < 2000
    expect(updated.status).toBe('PARTIALLY_PAID');
    expect(updated.amountPaid).toBe(1200);
  });

  it('rejects an installment larger than the remaining balance', async () => {
    const { service, booking } = await makeBookedFixture();
    await expect(service.addPayment(USER_1 as any, booking.id, { amount: 999999 } as any, 'idem-pay-3')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects any further payment once the booking is already FULLY_PAID', async () => {
    const { service, booking } = await makeBookedFixture();
    await service.addPayment(USER_1 as any, booking.id, { amount: 1600 } as any, 'idem-pay-4'); // now FULLY_PAID
    await expect(service.addPayment(USER_1 as any, booking.id, { amount: 1 } as any, 'idem-pay-5')).rejects.toBeInstanceOf(ConflictException);
  });

  it('threads paymentMethodToken through addPayment the same way as createBooking', async () => {
    const { service, booking, calls } = await makeBookedFixture();
    await service.addPayment(USER_1 as any, booking.id, { amount: 100, paymentMethodToken: 'pm_test_456' } as any, 'idem-pay-6');
    expect(calls[calls.length - 1].paymentMethodToken).toBe('pm_test_456');
  });

  it('refuses a payment from a user who is neither the booking owner nor HAJJ_UMRAH_MANAGE-permitted', async () => {
    const { prisma, packages } = makeFakePrisma({
      packages: { 'pkg-1': makePackage({ depositType: 'PERCENTAGE', depositValue: 20, totalAmount: 1000 }) },
      userRecords: { 'user-1': { customer: { id: 'cust-1' } }, 'user-2': { customer: { id: 'cust-2' } } },
    });
    const { payments } = makePaymentsFake('PAID');
    const service = new HajjUmrahService(prisma, auditFake as any, payments as any, notificationsFake as any);

    const booking = await service.createBooking(USER_1 as any, BASE_DTO as any, 'idem-owner-1'); // owned by cust-1 (user-1)
    const otherUser = { id: 'user-2', permissions: [] as string[] };
    await expect(service.addPayment(otherUser as any, booking.id, { amount: 100 } as any, 'idem-owner-2')).rejects.toBeInstanceOf(ForbiddenException);
    void packages;
  });
});
