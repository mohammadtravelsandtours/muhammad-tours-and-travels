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
import {
  CreateHotelBookingInput,
  HotelBooking,
  HotelBookingSummary,
  HotelOffer,
  HotelPriceConfirmationRequired,
  HotelRepriceResponse,
  HotelSearchResult,
  SearchHotelsInput,
} from './hotel-types';
import { ApplyVisaInput, VisaApplication } from './visa-types';
import { CreatePackageInput, TravelPackage } from './package-types';
import { AddHajjUmrahPaymentInput, CreateHajjUmrahBookingInput, HajjUmrahBooking, HajjUmrahPackage } from './hajj-umrah-types';
import { ApplyManpowerJobInput, ManpowerApplication, ManpowerJob } from './manpower-types';
import { ChatRequest, ChatResponse } from './assistant-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
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
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string; roles: string[]; permissions: string[] };
}

/**
 * Returned by /auth/login instead of AuthResponse when the account has
 * 2FA enabled. No B2C account can enable 2FA today — that UI only exists
 * in apps/admin's Security page — so this should never actually occur
 * here in practice. It's still handled defensively (see login()'s call
 * site) so a 2FA-enabled account never crashes this app on a malformed
 * assumption; it just gets a clear "not supported here" message instead.
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
  verifyTwoFactor: (twoFactorToken: string, code: string) =>
    request<AuthResponse>('/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ twoFactorToken, code }) }),
  register: (input: { email: string; password: string; fullName: string; phoneNumber: string; address?: string }) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ ...input, accountType: 'B2C_CUSTOMER' }),
    }),
  // Always resolves successfully regardless of whether the email is
  // registered — the API itself never reveals that either (anti-
  // enumeration; see AuthService.requestPasswordReset), so this app's
  // forgot-password page shows the same confirmation either way.
  requestPasswordReset: (email: string) =>
    request<void>('/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email }) }),
  confirmPasswordReset: (token: string, newPassword: string) =>
    request<void>('/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),

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

  // ── Hotels ──────────────────────────────────────────────────────────
  searchHotels: (input: SearchHotelsInput, token?: string) =>
    request<HotelSearchResult>('/hotels/search', { method: 'POST', body: JSON.stringify(input), token }),
  getHotelSearch: (searchId: string) => request<HotelSearchResult>(`/hotels/search/${searchId}`),
  getHotelOffer: (offerId: string) => request<HotelOffer>(`/hotels/offers/${offerId}`),
  repriceHotelOffer: (offerId: string, rooms?: number) =>
    request<HotelRepriceResponse>(`/hotels/offers/${offerId}/reprice`, { method: 'POST', body: JSON.stringify({ rooms }) }),

  createHotelBooking: (input: CreateHotelBookingInput, token: string, idempotencyKey: string) =>
    request<HotelBooking | HotelPriceConfirmationRequired>('/hotels/bookings', {
      method: 'POST',
      body: JSON.stringify(input),
      token,
      idempotencyKey,
    }),
  listHotelBookings: (token: string) => request<{ bookings: HotelBookingSummary[] }>('/hotels/bookings', { token }),
  getHotelBooking: (id: string, token: string) => request<HotelBooking>(`/hotels/bookings/${id}`, { token }),
  cancelHotelBooking: (id: string, reason: string | undefined, token: string) =>
    request<HotelBooking>(`/hotels/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }), token }),

  // ── Visas ───────────────────────────────────────────────────────────
  applyForVisa: (input: ApplyVisaInput, token: string) =>
    request<VisaApplication>('/visas', { method: 'POST', body: JSON.stringify(input), token }),
  listVisaApplications: (token: string) => request<{ applications: VisaApplication[] }>('/visas', { token }),
  getVisaApplication: (id: string, token: string) => request<VisaApplication>(`/visas/${id}`, { token }),

  // ── Packages ────────────────────────────────────────────────────────
  createPackage: (input: CreatePackageInput, token: string) =>
    request<TravelPackage>('/packages', { method: 'POST', body: JSON.stringify(input), token }),
  listPackages: (token: string) => request<{ packages: TravelPackage[] }>('/packages', { token }),
  getPackage: (id: string, token: string) => request<TravelPackage>(`/packages/${id}`, { token }),

  // ── Hajj & Umrah ────────────────────────────────────────────────────
  listHajjUmrahPackages: (type?: 'HAJJ' | 'UMRAH') =>
    request<{ packages: HajjUmrahPackage[] }>(`/hajj-umrah/packages${type ? `?type=${type}` : ''}`),
  getHajjUmrahPackage: (id: string) => request<HajjUmrahPackage>(`/hajj-umrah/packages/${id}`),
  createHajjUmrahBooking: (input: CreateHajjUmrahBookingInput, token: string, idempotencyKey: string) =>
    request<HajjUmrahBooking>('/hajj-umrah/bookings', { method: 'POST', body: JSON.stringify(input), token, idempotencyKey }),
  listHajjUmrahBookings: (token: string) => request<{ bookings: HajjUmrahBooking[] }>('/hajj-umrah/bookings', { token }),
  getHajjUmrahBooking: (id: string, token: string) => request<HajjUmrahBooking>(`/hajj-umrah/bookings/${id}`, { token }),
  addHajjUmrahPayment: (id: string, input: AddHajjUmrahPaymentInput, token: string, idempotencyKey: string) =>
    request<HajjUmrahBooking>(`/hajj-umrah/bookings/${id}/payments`, { method: 'POST', body: JSON.stringify(input), token, idempotencyKey }),

  // ── Manpower ──────────────────────────────────────────────────────
  listManpowerJobs: (filter?: { country?: string; category?: string }) => {
    const params = new URLSearchParams();
    if (filter?.country) params.set('country', filter.country);
    if (filter?.category) params.set('category', filter.category);
    const qs = params.toString();
    return request<{ jobs: ManpowerJob[] }>(`/manpower/jobs${qs ? `?${qs}` : ''}`);
  },
  getManpowerJob: (id: string) => request<ManpowerJob>(`/manpower/jobs/${id}`),
  applyForManpowerJob: (jobId: string, input: ApplyManpowerJobInput, token: string) =>
    request<ManpowerApplication>(`/manpower/jobs/${jobId}/applications`, { method: 'POST', body: JSON.stringify(input), token }),
  listManpowerApplications: (token: string) => request<{ applications: ManpowerApplication[] }>('/manpower/applications', { token }),
  getManpowerApplication: (id: string, token: string) => request<ManpowerApplication>(`/manpower/applications/${id}`, { token }),
  withdrawManpowerApplication: (id: string, token: string) =>
    request<ManpowerApplication>(`/manpower/applications/${id}/withdraw`, { method: 'POST', token }),

  // ── AI assistant ────────────────────────────────────────────────────
  assistantStatus: () => request<{ configured: boolean }>('/assistant/status'),
  assistantChat: (input: ChatRequest, token?: string) =>
    request<ChatResponse>('/assistant/chat', { method: 'POST', body: JSON.stringify(input), token }),
};

export function isPriceConfirmationRequired(x: Booking | PriceConfirmationRequired): x is PriceConfirmationRequired {
  return (x as PriceConfirmationRequired).requiresPriceConfirmation === true;
}

export function isHotelPriceConfirmationRequired(
  x: HotelBooking | HotelPriceConfirmationRequired,
): x is HotelPriceConfirmationRequired {
  return (x as HotelPriceConfirmationRequired).requiresPriceConfirmation === true;
}
