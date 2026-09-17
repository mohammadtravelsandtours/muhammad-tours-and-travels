import {
  Booking,
  BookingSummary,
  CreateBookingInput,
  FlightSearchSegmentInput,
  PriceConfirmationRequired,
  RepriceResponse,
  SearchResult,
  TripType,
  CabinClass,
} from './flight-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

interface RequestOptions extends RequestInit {
  /** Adds an Authorization: Bearer header — every corporate page requires sign-in, so this is set on nearly every call here. */
  token?: string;
  /** Adds the Idempotency-Key header the booking-creation endpoint requires. */
  idempotencyKey?: string;
}

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> | undefined) };
  if (init?.token) headers.Authorization = `Bearer ${init.token}`;
  if (init?.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    const message = Array.isArray(body.message) ? body.message.join('; ') : body.message ?? 'Request failed';
    throw new ApiError(message, res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface AuthResponse {
  accessToken: string; refreshToken: string;
  user: { id: string; email: string; fullName: string; roles: string[]; permissions: string[] };
}

/**
 * Returned by /auth/login instead of AuthResponse when the account has
 * 2FA enabled. No corporate account can enable 2FA today — that setup UI
 * only exists in apps/admin's Security page — so this is handled purely
 * defensively (see login()'s call site) so such an account never crashes
 * this app on a malformed assumption.
 */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  twoFactorToken: string;
}

export interface PendingApproval {
  id: string;
  bookingId: string;
  status: string;
  reason?: string;
  decidedAt?: string;
  createdAt: string;
  requestedBy?: { name?: string; email?: string; title?: string };
  booking?: {
    id: string;
    bookingReference: string;
    status: string;
    currency: string;
    totalAmount: number;
    segments: Array<{ origin: string; destination: string; departureAt: string; arrivalAt: string; marketingCarrier: string; flightNumber: string }>;
  };
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface SearchFlightsInput {
  tripType: TripType;
  cabin: CabinClass;
  segments: FlightSearchSegmentInput[];
  adults: number;
  children?: number;
  infants?: number;
  currency: string;
  nationality?: string;
}

/**
 * Generates a client-side idempotency key for one booking *attempt*,
 * reused across a requiresPriceConfirmation retry so the server treats
 * it as the same request rather than a second booking — see
 * apps/web/src/lib/api-client.ts's identical helper for the full
 * rationale; kept as its own copy per-app rather than a shared package
 * since these four frontends are deliberately independent deployables.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const apiClient = {
  login: (email: string, password: string) =>
    request<AuthResponse | TwoFactorChallenge>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  searchAirports: (q: string) =>
    request<{ results: Array<{ iataCode: string; name: string; city: string; country: string }> }>(
      `/airports/search?q=${encodeURIComponent(q)}`,
    ),

  // Search always carries the signed-in employee's token — every
  // corporate-app page requires sign-in first, and the token is what
  // makes FlightsController.deriveChannel() classify the search (and
  // every offer/booking it produces) as CORPORATE rather than B2C, which
  // is what routes the resulting booking through the approval gate.
  searchFlights: (input: SearchFlightsInput, token: string) =>
    request<SearchResult>('/flights/search', { method: 'POST', body: JSON.stringify(input), token }),
  getSearch: (searchId: string) => request<SearchResult>(`/flights/search/${searchId}`),
  getOffer: (offerId: string) => request<SearchResult['offers'][number]>(`/flights/offers/${offerId}`),
  repriceOffer: (offerId: string) => request<RepriceResponse>(`/flights/offers/${offerId}/reprice`, { method: 'POST' }),

  createBooking: (input: CreateBookingInput, token: string, idempotencyKey: string) =>
    request<Booking | PriceConfirmationRequired>('/bookings', {
      method: 'POST',
      body: JSON.stringify(input),
      token,
      idempotencyKey,
    }),
  listBookings: (token: string) => request<{ bookings: BookingSummary[] }>('/bookings', { token }),
  getBooking: (id: string, token: string) => request<Booking>(`/bookings/${id}`, { token }),

  // Self-service — the signed-in employee's OWN company's active cost
  // centers, scoped server-side (see MyCostCentersController); there is
  // deliberately no companyId param here for this endpoint.
  listMyCostCenters: (token: string) => request<{ costCenters: CostCenter[] }>('/corporate/cost-centers', { token }),

  listPendingApprovals: (token: string) =>
    request<{ approvals: PendingApproval[] }>('/corporate-approvals/pending', { token }),
  decideApproval: (token: string, id: string, decision: 'APPROVED' | 'REJECTED', reason?: string) =>
    request<PendingApproval>(`/corporate-approvals/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
      token,
    }),
};

export function isPriceConfirmationRequired(x: Booking | PriceConfirmationRequired): x is PriceConfirmationRequired {
  return (x as PriceConfirmationRequired).requiresPriceConfirmation === true;
}
