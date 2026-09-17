import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ManpowerService } from './manpower.service';

/**
 * Covers ManpowerService.updateStatus's transition table exhaustively —
 * every (from, to) pair against every declared ManpowerApplicationStatus,
 * the same "agrees with the table for every declared state" discipline
 * visas.service.status-transitions.spec.ts and
 * booking-state-machine.service.spec.ts apply to their own tables — plus
 * the applicant-facing withdraw() path, which shares the same table but a
 * different caller/ownership check.
 */
const STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'INTERVIEW_SCHEDULED',
  'SELECTED',
  'VISA_PROCESSING',
  'DEPLOYED',
  'REJECTED',
  'WITHDRAWN',
] as const;

// Mirrors ManpowerService's own private `assertValidTransition` table —
// kept as a second, independently-written copy (not imported) so this
// test actually catches the table being edited incorrectly, rather than
// grading the implementation against itself.
const EXPECTED_ALLOWED: Record<(typeof STATUSES)[number], (typeof STATUSES)[number][]> = {
  SUBMITTED: ['UNDER_REVIEW', 'SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
  SHORTLISTED: ['INTERVIEW_SCHEDULED', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW_SCHEDULED: ['SELECTED', 'REJECTED', 'WITHDRAWN'],
  SELECTED: ['VISA_PROCESSING', 'REJECTED'],
  VISA_PROCESSING: ['DEPLOYED', 'REJECTED'],
  DEPLOYED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

function makeFakePrisma(initialStatus: (typeof STATUSES)[number], reviewerNote: string | null = null) {
  const application = {
    id: 'application-1',
    status: initialStatus,
    reviewerNote,
    customerId: 'customer-1',
    agentId: null,
    employeeId: null,
  };
  const historyRows: any[] = [];
  const prisma = {
    manpowerApplication: {
      findUnique: jest.fn(async () => ({ ...application })),
      findUniqueOrThrow: jest.fn(async () => ({ ...application, job: null, statusHistory: historyRows })),
      update: jest.fn(async ({ data }: any) => {
        if (data.status !== undefined) application.status = data.status;
        if (data.reviewerNote !== undefined) application.reviewerNote = data.reviewerNote;
        return { ...application };
      }),
    },
    manpowerStatusHistory: {
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
  return new ManpowerService(prisma, { record: jest.fn() } as any);
}

describe('ManpowerService.updateStatus — transition table', () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      // updateStatus (the staff endpoint) never accepts WITHDRAWN or
      // SUBMITTED as a target — WITHDRAWN is withdraw()'s job (tested
      // separately below) and SUBMITTED is only ever the initial status —
      // so this loop only exercises the staff-reachable subset of the table.
      if (to === 'WITHDRAWN' || to === 'SUBMITTED') continue;
      const shouldAllow = EXPECTED_ALLOWED[from].includes(to);

      it(`${shouldAllow ? 'allows' : 'refuses'} ${from} -> ${to} via updateStatus`, async () => {
        const { prisma, application } = makeFakePrisma(from);
        const service = makeService(prisma);
        const user = { id: 'staff-1' } as any;

        if (shouldAllow) {
          await service.updateStatus(user, 'application-1', { toStatus: to } as any);
          expect(application.status).toBe(to);
        } else {
          await expect(service.updateStatus(user, 'application-1', { toStatus: to } as any)).rejects.toBeInstanceOf(ConflictException);
          expect(application.status).toBe(from); // untouched on a refused transition
        }
      });
    }
  }

  it('treats DEPLOYED, REJECTED, and WITHDRAWN as dead ends — nothing moves out of them', async () => {
    for (const terminal of ['DEPLOYED', 'REJECTED', 'WITHDRAWN'] as const) {
      const { prisma } = makeFakePrisma(terminal);
      const service = makeService(prisma);
      for (const to of STATUSES) {
        if (to === 'SUBMITTED' || to === 'WITHDRAWN') continue;
        await expect(service.updateStatus({ id: 'staff-1' } as any, 'application-1', { toStatus: to } as any)).rejects.toBeInstanceOf(
          ConflictException,
        );
      }
    }
  });

  it('records exactly one status-history row for an allowed transition, with the correct from/to', async () => {
    const { prisma, historyRows } = makeFakePrisma('SUBMITTED');
    const service = makeService(prisma);
    await service.updateStatus({ id: 'staff-1' } as any, 'application-1', { toStatus: 'UNDER_REVIEW', note: 'Reviewing CV' } as any);

    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]).toMatchObject({ fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW', actorUserId: 'staff-1', note: 'Reviewing CV' });
  });

  it('never writes a history row for a refused transition', async () => {
    const { prisma, historyRows } = makeFakePrisma('DEPLOYED');
    const service = makeService(prisma);
    await expect(service.updateStatus({ id: 'staff-1' } as any, 'application-1', { toStatus: 'REJECTED' } as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(historyRows).toHaveLength(0);
  });

  it('preserves the existing reviewerNote when a transition supplies no new note', async () => {
    const { prisma, application } = makeFakePrisma('SUBMITTED', 'Earlier note from a previous review pass');
    const service = makeService(prisma);
    await service.updateStatus({ id: 'staff-1' } as any, 'application-1', { toStatus: 'UNDER_REVIEW' } as any);
    expect(application.reviewerNote).toBe('Earlier note from a previous review pass');
  });

  it('the full happy path reaches DEPLOYED one step at a time', async () => {
    const { prisma, application } = makeFakePrisma('SUBMITTED');
    const service = makeService(prisma);
    const user = { id: 'staff-1' } as any;
    const path: (typeof STATUSES)[number][] = ['UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'SELECTED', 'VISA_PROCESSING', 'DEPLOYED'];
    for (const to of path) {
      await service.updateStatus(user, 'application-1', { toStatus: to } as any);
      expect(application.status).toBe(to);
    }
  });
});

describe('ManpowerService.withdraw — applicant self-service', () => {
  function ownerUser() {
    return { id: 'user-1', permissions: [] } as any;
  }

  it('allows withdrawal from SUBMITTED, UNDER_REVIEW, SHORTLISTED, and INTERVIEW_SCHEDULED', async () => {
    for (const from of ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW_SCHEDULED'] as const) {
      const { prisma, application } = makeFakePrisma(from);
      const service = makeService(prisma);
      // getOne's ownership check compares actor ids resolved from
      // prisma.user.findUnique — stub it to resolve to the same customerId
      // the fake application already carries.
      prisma.user = { findUnique: jest.fn(async () => ({ customer: { id: 'customer-1' } })) } as any;

      await service.withdraw(ownerUser(), 'application-1');
      expect(application.status).toBe('WITHDRAWN');
    }
  });

  it('refuses withdrawal once SELECTED, VISA_PROCESSING, or DEPLOYED', async () => {
    for (const from of ['SELECTED', 'VISA_PROCESSING', 'DEPLOYED'] as const) {
      const { prisma, application } = makeFakePrisma(from);
      const service = makeService(prisma);
      prisma.user = { findUnique: jest.fn(async () => ({ customer: { id: 'customer-1' } })) } as any;

      await expect(service.withdraw(ownerUser(), 'application-1')).rejects.toBeInstanceOf(ConflictException);
      expect(application.status).toBe(from);
    }
  });

  it('refuses withdrawal by someone who does not own the application', async () => {
    const { prisma } = makeFakePrisma('SUBMITTED');
    const service = makeService(prisma);
    prisma.user = { findUnique: jest.fn(async () => ({ customer: { id: 'someone-elses-customer-id' } })) } as any;

    await expect(service.withdraw(ownerUser(), 'application-1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
