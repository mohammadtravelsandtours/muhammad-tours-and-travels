import { ForbiddenException } from '@nestjs/common';
import { BookingsService } from './bookings.service';

/**
 * Regression test for a real ownership-enforcement bug fixed alongside
 * this suite: BookingsService.getBooking() used to authorize purely by
 * matching the requester's ROLE against which id field the booking had
 * set (e.g. "the booking has a customerId AND the caller is SOME
 * B2C_CUSTOMER") without ever comparing that id to the caller's OWN
 * customerId/agentId/employeeId. That let any customer load any other
 * customer's booking — passenger names, DOB, passport numbers, contact
 * info, price — by id alone, and the same across agents and employees.
 * This is exactly the case the mega-prompt's ownership rule exists for
 * ("a customer never sees another customer's booking, an agent never
 * sees another agency's"), so it's covered here with its own spec file
 * rather than folded into a general bookings.service.spec.ts.
 */
function makeFakePrisma(booking: any, actorsByUserId: Record<string, any>) {
  return {
    booking: {
      findUniqueOrThrow: jest.fn(async () => booking),
    },
    user: {
      findUnique: jest.fn(async ({ where }: any) => actorsByUserId[where.id] ?? null),
    },
  };
}

function makeBookingsService(prisma: any) {
  // Only prisma is exercised by getBooking()/resolveActor()/assertCanView —
  // every other collaborator is dead weight for this spec.
  return new BookingsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
}

describe('BookingsService.getBooking — ownership enforcement', () => {
  it('lets a customer view their own booking', async () => {
    const booking = { id: 'bk-1', customerId: 'cust-A', agentId: null, employeeId: null };
    const prisma = makeFakePrisma(booking, { 'user-A': { customer: { id: 'cust-A' } } });
    const service = makeBookingsService(prisma);

    const result = await service.getBooking({ id: 'user-A', roles: ['B2C_CUSTOMER'], permissions: [] } as any, 'bk-1');
    expect(result).toBe(booking);
  });

  it('never lets one customer view another customer\'s booking', async () => {
    const booking = { id: 'bk-1', customerId: 'cust-A', agentId: null, employeeId: null };
    const prisma = makeFakePrisma(booking, { 'user-B': { customer: { id: 'cust-B' } } });
    const service = makeBookingsService(prisma);

    await expect(
      service.getBooking({ id: 'user-B', roles: ['B2C_CUSTOMER'], permissions: [] } as any, 'bk-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never lets one B2B agent view another agent\'s booking, even at the same agency', async () => {
    const booking = { id: 'bk-1', customerId: null, agentId: 'agent-A', employeeId: null };
    const prisma = makeFakePrisma(booking, {
      'user-agentB': { agent: { id: 'agent-B', agencyId: 'agency-1' } },
    });
    const service = makeBookingsService(prisma);

    await expect(
      service.getBooking({ id: 'user-agentB', roles: ['B2B_AGENT'], permissions: [] } as any, 'bk-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never lets one corporate employee view another employee\'s booking', async () => {
    const booking = { id: 'bk-1', customerId: null, agentId: null, employeeId: 'emp-A' };
    const prisma = makeFakePrisma(booking, {
      'user-empB': { employee: { id: 'emp-B' } },
    });
    const service = makeBookingsService(prisma);

    await expect(
      service.getBooking({ id: 'user-empB', roles: ['CORPORATE_EMPLOYEE'], permissions: [] } as any, 'bk-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies access to a user with no customer/agent/employee profile at all', async () => {
    const booking = { id: 'bk-1', customerId: 'cust-A', agentId: null, employeeId: null };
    const prisma = makeFakePrisma(booking, { 'user-ghost': null });
    const service = makeBookingsService(prisma);

    await expect(
      service.getBooking({ id: 'user-ghost', roles: ['B2C_CUSTOMER'], permissions: [] } as any, 'bk-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a booking:read:any holder (ops/support) view any booking without an owning profile', async () => {
    const booking = { id: 'bk-1', customerId: 'cust-A', agentId: null, employeeId: null };
    const prisma = makeFakePrisma(booking, {}); // no profile registered for this user at all
    const service = makeBookingsService(prisma);

    const result = await service.getBooking({ id: 'ops-1', roles: ['OPS_SUPPORT'], permissions: ['booking:read:any'] } as any, 'bk-1');
    expect(result).toBe(booking);
  });

  it('lets a booking:read:agency holder (agency admin) view another agent\'s booking at the SAME agency', async () => {
    // agent-B made the booking; agent-Admin is a different agent at the
    // same agency (agencyId "agency-1" on both sides) with the
    // booking:read:agency permission DEFAULT_ROLE_PERMISSIONS grants
    // B2B_AGENCY_ADMIN — this is the actual gap fixed here.
    const booking = { id: 'bk-1', customerId: null, agentId: 'agent-B', employeeId: null, agent: { agencyId: 'agency-1' } };
    const prisma = makeFakePrisma(booking, {
      'user-admin': { agent: { id: 'agent-Admin', agencyId: 'agency-1' } },
    });
    const service = makeBookingsService(prisma);

    const result = await service.getBooking(
      { id: 'user-admin', roles: ['B2B_AGENCY_ADMIN'], permissions: ['booking:read:agency'] } as any,
      'bk-1',
    );
    expect(result).toBe(booking);
  });

  it('never lets a booking:read:agency holder view a booking at a DIFFERENT agency', async () => {
    const booking = { id: 'bk-1', customerId: null, agentId: 'agent-B', employeeId: null, agent: { agencyId: 'agency-2' } };
    const prisma = makeFakePrisma(booking, {
      'user-admin': { agent: { id: 'agent-Admin', agencyId: 'agency-1' } },
    });
    const service = makeBookingsService(prisma);

    await expect(
      service.getBooking({ id: 'user-admin', roles: ['B2B_AGENCY_ADMIN'], permissions: ['booking:read:agency'] } as any, 'bk-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never grants agency-wide access to a plain B2B_AGENT who lacks booking:read:agency, even at the same agency', async () => {
    const booking = { id: 'bk-1', customerId: null, agentId: 'agent-B', employeeId: null, agent: { agencyId: 'agency-1' } };
    const prisma = makeFakePrisma(booking, {
      'user-agentA': { agent: { id: 'agent-A', agencyId: 'agency-1' } },
    });
    const service = makeBookingsService(prisma);

    await expect(
      service.getBooking({ id: 'user-agentA', roles: ['B2B_AGENT'], permissions: [] } as any, 'bk-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
