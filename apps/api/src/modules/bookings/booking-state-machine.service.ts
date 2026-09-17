import { ConflictException, Injectable } from '@nestjs/common';
import { BookingStatus } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ALLOWED_BOOKING_TRANSITIONS } from './booking-status.transitions';

export interface TransitionOptions {
  actorUserId?: string;
  reason?: string;
}

/**
 * The ONLY place `bookings.status` is ever written. Every transition is
 * checked against ALLOWED_BOOKING_TRANSITIONS and recorded as a
 * BookingStatusHistory row in the same database transaction — so the
 * status column and its audit trail can never drift apart, and a
 * booking's status can never be set to an arbitrary value by a
 * controller, a frontend request body, or anything else that bypasses
 * this service.
 */
@Injectable()
export class BookingStateMachineService {
  constructor(private readonly prisma: PrismaService) {}

  async transition(bookingId: string, to: BookingStatus, options: TransitionOptions = {}) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      const allowed = ALLOWED_BOOKING_TRANSITIONS[booking.status as BookingStatus] ?? [];
      if (!allowed.includes(to)) {
        throw new ConflictException(`Cannot move booking ${bookingId} from ${booking.status} to ${to}`);
      }

      const updated = await tx.booking.update({ where: { id: bookingId }, data: { status: to } });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          fromStatus: booking.status,
          toStatus: to,
          actorUserId: options.actorUserId ?? null,
          reason: options.reason ?? null,
        },
      });
      return updated;
    });
  }
}
