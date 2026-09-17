import Constants from 'expo-constants';
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

// Mirrors apps/web/src/lib/api-client.ts's request/error shape exactly —
// same ApiError class, same header conventions — so the two clients never
// silently diverge in how they talk to the same API. The only real
// difference is where the base URL and bearer token come from: an env var
// baked at build time on web, expo's `extra` config (overridable by
// EXPO_PUBLIC_API_URL for local dev against a physical device) here, and
// AsyncStorage instead of sessionStorage for the token (see auth-context.tsx).
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

interface RequestOptions extends RequestInit {
  token?: string;
  idempotencyKey?: string;
}

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> | undefined) };
  if (init?.token) headers.Authorization = `Bearer ${init.token}`;
  if (init?.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    // A native fetch failure here (no network, host unreachable) has no
    // res.status to report — surface it as a distinct 0 so callers can
    // tell "server said no" apart from "never reached the server".
    throw new ApiError('Could not reach the server — check your connection and try again.', 0);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    const message = Array.isArray(body.message) ? body.message.join('; ') : body.message ?? 'Request failed';
    throw new ApiError(message, res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string; roles: string[]; permissions: string[] };
}

/**
 * Returned by /auth/login instead of AuthResponse when the account has
 * 2FA enabled. No B2C account can enable 2FA today — that setup UI only
 * exists in apps/admin's Security page — so this is handled purely
 * defensively (see LoginScreen) so such an account never crashes the app.
 */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  twoFactorToken: string;
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

export function newIdempotencyKey(): string {
  return `idem-mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const apiClient = {
  login: (email: string, password: string) =>
    request<AuthResponse | TwoFactorChallenge>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (input: { email: string; password: string; fullName: string; phoneNumber: string; address?: string }) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ ...input, accountType: 'B2C_CUSTOMER' }),
    }),

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
  cancelBooking: (id: string, reason: string | undefined, token: string) =>
    request<Booking>(`/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }), token }),
};

export function isPriceConfirmationRequired(x: Booking | PriceConfirmationRequired): x is PriceConfirmationRequired {
  return (x as PriceConfirmationRequired).requiresPriceConfirmation === true;
}
