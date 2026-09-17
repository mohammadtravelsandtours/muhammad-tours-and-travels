import { ConflictException } from '@nestjs/common';
import { BookingStateMachineService } from './booking-state-machine.service';
import { ALLOWED_BOOKING_TRANSITIONS, isTransitionAllowed } from './booking-status.transitions';

/**
 * BookingStateMachineService is documented as "the ONLY place
 * bookings.status is ever written" — this test proves both halves of
 * that promise actually hold: an allowed transition writes the new
 * status AND a history row in the same operation, and a disallowed one
 * writes neither.
 */
function makeFakePrisma(initialStatus: string) {
  const booking = { id: 'bk-1', status: initialStatus };
  const historyRows: any[] = [];
  const tx = {
    booking: {
      findUniqueOrThrow: jest.fn(async () => ({ ...booking })),
      update: jest.fn(async ({ data }: any) => {
        booking.status = data.status;
        return { ...booking };
      }),
    },
    bookingStatusHistory: {
      create: jest.fn(async ({ data }: any) => {
        historyRows.push(data);
        return data;
      }),
    },
  };
  const prisma = { $transaction: jest.fn(async (fn: (tx: typeof tx) => unknown) => fn(tx)) };
  return { prisma, booking, historyRows };
}

describe('BookingStateMachineService.transition', () => {
  it('applies an allowed transition and records exactly one history row for it', async () => {
    const { prisma, booking, historyRows } = makeFakePrisma('SEARCHED');
    const machine = new BookingStateMachineService(prisma as any);

    await machine.transition('bk-1', 'PRICE_PENDING', { actorUserId: 'u1' });

    expect(booking.status).toBe('PRICE_PENDING');
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]).toMatchObject({ fromStatus: 'SEARCHED', toStatus: 'PRICE_PENDING', actorUserId: 'u1' });
  });

  it('refuses a disallowed transition and leaves status and history untouched', async () => {
    const { prisma, booking, historyRows } = makeFakePrisma('TICKETED');
    const machine = new BookingStateMachineService(prisma as any);

    // TICKETED can only go to REFUND_PENDING or CANCELLED, never back to CONFIRMED.
    await expect(machine.transition('bk-1', 'CONFIRMED')).rejects.toBeInstanceOf(ConflictException);
    expect(booking.status).toBe('TICKETED');
    expect(historyRows).toHaveLength(0);
  });

  it('treats every terminal status as a dead end', async () => {
    for (const terminal of ['FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED']) {
      const { prisma } = makeFakePrisma(terminal);
      const machine = new BookingStateMachineService(prisma as any);
      await expect(machine.transition('bk-1', 'CONFIRMED')).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it('never allows BOOKING_PENDING to fall back to an earlier pre-supplier-call state', async () => {
    const { prisma } = makeFakePrisma('BOOKING_PENDING');
    const machine = new BookingStateMachineService(prisma as any);

    // A real supplier call was already made from BOOKING_PENDING — the
    // only legal exits are CONFIRMED or FAILED, never back to SEARCHED
    // or PRICE_CONFIRMED.
    await expect(machine.transition('bk-1', 'SEARCHED')).rejects.toBeInstanceOf(ConflictException);
    await expect(machine.transition('bk-1', 'PRICE_CONFIRMED')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('isTransitionAllowed', () => {
  it('agrees with the transitions table for every declared state', () => {
    for (const [from, tos] of Object.entries(ALLOWED_BOOKING_TRANSITIONS) as [string, string[]][]) {
      for (const to of tos) {
        expect(isTransitionAllowed(from as any, to as any)).toBe(true);
      }
    }
  });

  it('rejects a transition that is not in the table', () => {
    expect(isTransitionAllowed('TICKETED' as any, 'SEARCHED' as any)).toBe(false);
  });
});
