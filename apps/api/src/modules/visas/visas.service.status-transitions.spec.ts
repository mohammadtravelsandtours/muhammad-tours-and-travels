import { ConflictException } from '@nestjs/common';
import { VisasService } from './visas.service';

/**
 * Covers VisasService.updateStatus's transition table exhaustively —
 * every (from, to) pair against every declared VisaApplicationStatus,
 * the same "agrees with the table for every declared state" discipline
 * booking-state-machine.service.spec.ts applies to bookings — plus the
 * one real branching behavior in the table (ADDITIONAL_INFO_REQUIRED can
 * loop back to UNDER_REVIEW, unlike every other non-terminal state).
 * Previously untested, per docs/ROADMAP.md's Phase 6 "what remains".
 */
const STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED'] as const;

// Mirrors VisasService's own private `assertValidTransition` table —
// kept as a second, independently-written copy (not imported) so this
// test actually catches the table being edited incorrectly, rather than
// grading the implementation against itself.
const EXPECTED_ALLOWED: Record<(typeof STATUSES)[number], (typeof STATUSES)[number][]> = {
  SUBMITTED: ['UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED'],
  UNDER_REVIEW: ['ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED'],
  ADDITIONAL_INFO_REQUIRED: ['UNDER_REVIEW', 'REJECTED'],
  APPROVED: [],
  REJECTED: [],
};

function makeFakePrisma(initialStatus: (typeof STATUSES)[number], reviewerNote: string | null = null) {
  const application = { id: 'visa-1', status: initialStatus, reviewerNote };
  const historyRows: any[] = [];
  const prisma = {
    visaApplication: {
      findUnique: jest.fn(async () => ({ ...application })),
      update: jest.fn(async ({ data }: any) => {
        application.status = data.status;
        application.reviewerNote = data.reviewerNote;
        return { ...application };
      }),
      findUniqueOrThrow: jest.fn(async () => ({ ...application, statusHistory: historyRows })),
    },
    visaStatusHistory: {
      create: jest.fn(async ({ data }: any) => {
        historyRows.push(data);
        return data;
      }),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma, application, historyRows };
}

function makeService(prisma: any) {
  return new VisasService(prisma, { record: jest.fn() } as any);
}

describe('VisasService.updateStatus — transition table', () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const shouldAllow = EXPECTED_ALLOWED[from].includes(to);
      it(`${shouldAllow ? 'allows' : 'refuses'} ${from} -> ${to}`, async () => {
        const { prisma, application } = makeFakePrisma(from);
        const service = makeService(prisma);
        const user = { id: 'staff-1' } as any;

        if (shouldAllow) {
          await service.updateStatus(user, 'visa-1', { toStatus: to } as any);
          expect(application.status).toBe(to);
        } else {
          await expect(service.updateStatus(user, 'visa-1', { toStatus: to } as any)).rejects.toBeInstanceOf(ConflictException);
          expect(application.status).toBe(from); // untouched on a refused transition
        }
      });
    }
  }

  it('treats APPROVED and REJECTED as dead ends — nothing, not even the reverse, moves out of them', async () => {
    for (const terminal of ['APPROVED', 'REJECTED'] as const) {
      const { prisma } = makeFakePrisma(terminal);
      const service = makeService(prisma);
      for (const to of STATUSES) {
        await expect(service.updateStatus({ id: 'staff-1' } as any, 'visa-1', { toStatus: to } as any)).rejects.toBeInstanceOf(ConflictException);
      }
    }
  });

  it('records exactly one status-history row for an allowed transition, with the correct from/to', async () => {
    const { prisma, historyRows } = makeFakePrisma('SUBMITTED');
    const service = makeService(prisma);
    await service.updateStatus({ id: 'staff-1' } as any, 'visa-1', { toStatus: 'UNDER_REVIEW', note: 'Reviewing documents' } as any);

    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]).toMatchObject({ fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW', actorUserId: 'staff-1', note: 'Reviewing documents' });
  });

  it('never writes a history row for a refused transition', async () => {
    const { prisma, historyRows } = makeFakePrisma('APPROVED');
    const service = makeService(prisma);
    await expect(service.updateStatus({ id: 'staff-1' } as any, 'visa-1', { toStatus: 'REJECTED' } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(historyRows).toHaveLength(0);
  });

  it('the ADDITIONAL_INFO_REQUIRED <-> UNDER_REVIEW loop can go back and forth more than once', async () => {
    const { prisma, application } = makeFakePrisma('UNDER_REVIEW');
    const service = makeService(prisma);

    await service.updateStatus({ id: 'staff-1' } as any, 'visa-1', { toStatus: 'ADDITIONAL_INFO_REQUIRED' } as any);
    expect(application.status).toBe('ADDITIONAL_INFO_REQUIRED');

    await service.updateStatus({ id: 'staff-1' } as any, 'visa-1', { toStatus: 'UNDER_REVIEW' } as any);
    expect(application.status).toBe('UNDER_REVIEW');

    await service.updateStatus({ id: 'staff-1' } as any, 'visa-1', { toStatus: 'ADDITIONAL_INFO_REQUIRED' } as any);
    expect(application.status).toBe('ADDITIONAL_INFO_REQUIRED');
  });

  it('preserves the existing reviewerNote when a transition supplies no new note', async () => {
    const { prisma, application } = makeFakePrisma('SUBMITTED', 'Earlier note from a previous review pass');
    const service = makeService(prisma);
    await service.updateStatus({ id: 'staff-1' } as any, 'visa-1', { toStatus: 'UNDER_REVIEW' } as any);
    expect(application.reviewerNote).toBe('Earlier note from a previous review pass');
  });
});
