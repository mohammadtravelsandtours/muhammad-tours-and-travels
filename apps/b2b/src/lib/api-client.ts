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
  /** Adds an Authorization: Bearer header — never inline this into headers by hand, so a missing token can't silently produce an unauthenticated call where one was required. */
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
 * 2FA enabled. No B2B account can enable 2FA today — that setup UI only
 * exists in apps/admin's Security page — so this is handled purely
 * defensively (see login()'s call site) so such an account never crashes
 * this app on a malformed assumption.
 */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  twoFactorToken: string;
}

export interface WalletDto {
  id: string;
  agencyId: string;
  currency: string;
  balance: number;
  updatedAt: string;
}

export interface WalletTransactionDto {
  id: string;
  type: string;
  debit: number;
  credit: number;
  previousBalance: number;
  newBalance: number;
  currency: string;
  reference?: string;
  description?: string;
  bookingId?: string;
  createdAt: string;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
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
 * Generates a client-side idempotency key for one booking *attempt*.
 * Reused across a requiresPriceConfirmation retry (same traveler intent,
 * re-submitted with acceptedTotalFare set) so the server treats that as
 * the same request rather than a second booking — a fresh key is only
 * drawn when the traveler starts over from a blank form.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const apiClient = {
  login: (email: string, password: string) =>
    request<AuthResponse | TwoFactorChallenge>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (input: { email: string; password: string; fullName: string; phoneNumber: string; address?: string }) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ ...input, accountType: 'B2B_AGENT' }),
    }),

  getWallet: (accessToken: string) => request<WalletDto>('/wallet', { headers: authHeaders(accessToken) }),
  listWalletTransactions: (accessToken: string) =>
    request<{ transactions: WalletTransactionDto[] }>('/wallet/transactions', { headers: authHeaders(accessToken) }),

  searchAirports: (q: string) =>
    request<{ results: Array<{ iataCode: string; name: string; city: string; country: string }> }>(
      `/airports/search?q=${encodeURIComponent(q)}`,
    ),

  searchFlights: (input: SearchFlightsInput, token?: string) =>
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
};

export function isPriceConfirmationRequired(x: Booking | PriceConfirmationRequired): x is PriceConfirmationRequired {
  return (x as PriceConfirmationRequired).requiresPriceConfirmation === true;
}
