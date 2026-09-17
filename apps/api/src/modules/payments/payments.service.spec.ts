import { PaymentsService } from './payments.service';

/**
 * Covers PaymentsService's two thin but money-risk responsibilities that
 * had no test coverage at all before this: idempotent charge replay, and
 * correctly threading paymentMethodToken through to whichever
 * PaymentProvider is registered (see ChargeRequest.paymentMethodToken —
 * StripePaymentProvider refuses to charge a real gateway without one).
 * Mirrors this repo's manual-call-tracking-array style rather than a
 * mock framework's call-assertion API — see hotels.service.settlement.spec.ts's
 * own doc comment for why.
 */
function makeCollaborators(options: { chargeResult?: { status: 'PAID' | 'FAILED'; providerReference?: string }; chargeError?: Error } = {}) {
  const payments = new Map<string, any>();
  let nextId = 1;
  const updateCalls: unknown[] = [];
  const prisma = {
    payment: {
      findUnique: async ({ where }: any) => payments.get(where.idempotencyKey) ?? null,
      create: async ({ data }: any) => {
        const row = { id: `pay-${nextId++}`, ...data };
        payments.set(data.idempotencyKey, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        updateCalls.push({ where, data });
        for (const row of payments.values()) {
          if (row.id === where.id) Object.assign(row, data);
        }
        return [...payments.values()].find((r) => r.id === where.id);
      },
    },
  } as any;

  const chargeCalls: unknown[] = [];
  const provider = {
    providerCode: 'STRIPE',
    charge: (request: unknown) => {
      chargeCalls.push(request);
      if (options.chargeError) return Promise.reject(options.chargeError);
      return Promise.resolve(options.chargeResult ?? { status: 'PAID', providerReference: 'pi_123' });
    },
  };

  const metrics = { incrementCounter: () => {} };

  const service = new PaymentsService(prisma, provider as any, metrics as any);
  return { service, prisma, chargeCalls, updateCalls };
}

describe('PaymentsService.chargeForBooking', () => {
  it('passes the caller-supplied paymentMethodToken through to the provider', async () => {
    const { service, chargeCalls } = makeCollaborators();
    await service.chargeForBooking('bk-1', 'MT000001', 500, 'USD', 'idem-1', 'pm_card_visa');
    expect(chargeCalls).toHaveLength(1);
    expect(chargeCalls[0]).toMatchObject({ paymentMethodToken: 'pm_card_visa', amount: 500, currency: 'USD' });
  });

  it('still charges successfully with no paymentMethodToken (the MANUAL-provider default path, unchanged)', async () => {
    const { service, chargeCalls } = makeCollaborators();
    const result = await service.chargeForBooking('bk-1', 'MT000001', 500, 'USD', 'idem-2');
    expect(chargeCalls[0]).toMatchObject({ paymentMethodToken: undefined });
    expect(result).toMatchObject({ status: 'PAID' });
  });

  it('replays an idempotency key instead of charging the provider twice', async () => {
    const { service, chargeCalls } = makeCollaborators();
    const first = await service.chargeForBooking('bk-1', 'MT000001', 500, 'USD', 'idem-3', 'pm_1');
    const second = await service.chargeForBooking('bk-1', 'MT000001', 500, 'USD', 'idem-3', 'pm_1');
    expect(chargeCalls).toHaveLength(1);
    expect(second).toMatchObject({ id: first.id });
  });

  it('marks the payment FAILED (never throws) when the provider rejects', async () => {
    const { service, updateCalls } = makeCollaborators({ chargeError: new Error('card declined') });
    const result = await service.chargeForBooking('bk-1', 'MT000001', 500, 'USD', 'idem-4', 'pm_declined');
    expect(result).toMatchObject({ status: 'FAILED' });
    expect(updateCalls[updateCalls.length - 1]).toMatchObject({ data: { status: 'FAILED' } });
  });

  it('marks the payment FAILED when the provider itself reports FAILED (e.g. a 3DS challenge it cannot resume)', async () => {
    const { service } = makeCollaborators({ chargeResult: { status: 'FAILED' } });
    const result = await service.chargeForBooking('bk-1', 'MT000001', 500, 'USD', 'idem-5', 'pm_needs_action');
    expect(result).toMatchObject({ status: 'FAILED' });
  });
});

describe('PaymentsService.chargeForHotelBooking', () => {
  it('passes the caller-supplied paymentMethodToken through to the provider, on the hotel-booking ledger path', async () => {
    const { service, chargeCalls } = makeCollaborators();
    await service.chargeForHotelBooking('hbk-1', 'MH000001', 300, 'USD', 'idem-h1', 'pm_hotel');
    expect(chargeCalls).toHaveLength(1);
    expect(chargeCalls[0]).toMatchObject({ paymentMethodToken: 'pm_hotel', bookingId: 'hbk-1' });
  });

  it('replays an idempotency key instead of charging the provider twice', async () => {
    const { service, chargeCalls } = makeCollaborators();
    await service.chargeForHotelBooking('hbk-1', 'MH000001', 300, 'USD', 'idem-h2', 'pm_1');
    await service.chargeForHotelBooking('hbk-1', 'MH000001', 300, 'USD', 'idem-h2', 'pm_1');
    expect(chargeCalls).toHaveLength(1);
  });
});
