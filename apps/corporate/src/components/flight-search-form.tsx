'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AirportInput } from './airport-input';
import { apiClient, ApiError } from '@/lib/api-client';
import { CabinClass, FlightSearchSegmentInput, TripType } from '@/lib/flight-types';
import { useAuth } from '@/lib/auth-context';

const TRIP_TYPES: { value: TripType; label: string }[] = [
  { value: 'ONE_WAY', label: 'One way' },
  { value: 'ROUND_TRIP', label: 'Round trip' },
  { value: 'MULTI_CITY', label: 'Multi-city' },
];

const CABINS: { value: CabinClass; label: string }[] = [
  { value: 'ECONOMY', label: 'Economy' },
  { value: 'PREMIUM_ECONOMY', label: 'Premium economy' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'FIRST', label: 'First' },
];

const CURRENCIES = ['USD', 'BDT', 'AED', 'SGD', 'GBP'];

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function emptySegment(departureDate: string): FlightSearchSegmentInput {
  return { origin: '', destination: '', departureDate };
}

/**
 * Every page in this app requires sign-in first (see CorporateHeader),
 * so unlike apps/web's identically-shaped form, accessToken here is
 * never optional — a signed-in employee's token is what makes the
 * resulting search (and any booking made from it) CORPORATE-channel,
 * which is what puts it behind the approval gate.
 */
export function FlightSearchForm() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [tripType, setTripType] = useState<TripType>('ROUND_TRIP');
  const [segments, setSegments] = useState<FlightSearchSegmentInput[]>([
    emptySegment(todayPlus(14)),
    emptySegment(todayPlus(21)),
  ]);
  const [cabin, setCabin] = useState<CabinClass>('ECONOMY');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [currency, setCurrency] = useState('USD');
  const [nationality, setNationality] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setTrip(next: TripType) {
    setTripType(next);
    if (next === 'ONE_WAY') setSegments([segments[0] ?? emptySegment(todayPlus(14))]);
    else if (next === 'ROUND_TRIP') {
      setSegments([segments[0] ?? emptySegment(todayPlus(14)), segments[1] ?? emptySegment(todayPlus(21))]);
    } else if (segments.length < 2) {
      setSegments([...segments, emptySegment(todayPlus(21))]);
    }
  }

  function updateSegment(index: number, patch: Partial<FlightSearchSegmentInput>) {
    setSegments((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSegment() {
    const last = segments[segments.length - 1];
    setSegments([...segments, emptySegment(last?.departureDate ?? todayPlus(14))]);
  }

  function removeSegment(index: number) {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!accessToken) {
      setError('Your session has expired. Please sign in again.');
      return;
    }

    for (const s of segments) {
      if (s.origin.length !== 3 || s.destination.length !== 3) {
        setError('Enter both a from and a to airport for every flight.');
        return;
      }
      if (s.origin === s.destination) {
        setError('Origin and destination cannot be the same airport.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await apiClient.searchFlights(
        {
          tripType,
          cabin,
          segments,
          adults,
          children: children || undefined,
          infants: infants || undefined,
          currency,
          nationality: nationality || undefined,
        },
        accessToken,
      );
      router.push(`/search/${result.searchId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-line shadow-sm p-5">
      <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
        {TRIP_TYPES.map((t) => (
          <label key={t.value} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="tripType"
              checked={tripType === t.value}
              onChange={() => setTrip(t.value)}
              className="accent-indigo"
            />
            <span className={tripType === t.value ? 'text-graphite-900 font-medium' : 'text-graphite-500'}>{t.label}</span>
          </label>
        ))}
        <select value={cabin} onChange={(e) => setCabin(e.target.value as CabinClass)} className="ml-auto rounded-md border border-line px-2 py-1.5 text-graphite-900">
          {CABINS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {segments.map((segment, i) => (
          <div key={i} className="flex flex-wrap gap-3 text-sm">
            <div className="flex-1 min-w-[140px] rounded-lg border border-line px-4 py-2.5">
              <AirportInput label="From" value={segment.origin} onChange={(v) => updateSegment(i, { origin: v })} placeholder="City or airport" />
            </div>
            <div className="flex-1 min-w-[140px] rounded-lg border border-line px-4 py-2.5">
              <AirportInput label="To" value={segment.destination} onChange={(v) => updateSegment(i, { destination: v })} placeholder="City or airport" />
            </div>
            <div className="flex-1 min-w-[140px] rounded-lg border border-line px-4 py-2.5">
              <label className="block text-xs text-graphite-500 mb-1">{tripType === 'MULTI_CITY' ? `Flight ${i + 1} date` : i === 0 ? 'Depart' : 'Return'}</label>
              <input
                type="date"
                required
                min={todayPlus(0)}
                value={segment.departureDate}
                onChange={(e) => updateSegment(i, { departureDate: e.target.value })}
                className="w-full bg-transparent text-graphite-900 font-medium focus:outline-none"
              />
            </div>
            {tripType === 'MULTI_CITY' && segments.length > 2 && (
              <button type="button" onClick={() => removeSegment(i)} className="text-graphite-500 hover:text-graphite-900 text-xs self-center" aria-label={`Remove flight ${i + 1}`}>
                Remove
              </button>
            )}
          </div>
        ))}

        {tripType === 'MULTI_CITY' && segments.length < 6 && (
          <button type="button" onClick={addSegment} className="text-sm text-indigo-dim">
            + Add another flight
          </button>
        )}

        <div className="flex flex-wrap gap-3 text-sm items-end">
          <div className="flex-1 min-w-[140px] rounded-lg border border-line px-4 py-2.5">
            <label className="block text-xs text-graphite-500 mb-1">Travelers</label>
            <div className="flex items-center gap-3">
              <PaxStepper
                label="Adult"
                value={adults}
                min={1}
                max={9}
                onChange={(next) => {
                  setAdults(next);
                  setInfants((prev) => Math.min(prev, next));
                }}
              />
              <PaxStepper label="Child" value={children} min={0} max={8} onChange={setChildren} />
              <PaxStepper label="Infant" value={infants} min={0} max={adults} onChange={setInfants} />
            </div>
          </div>
          <div className="flex-1 min-w-[100px] rounded-lg border border-line px-4 py-2.5">
            <label className="block text-xs text-graphite-500 mb-1">Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full bg-transparent text-graphite-900 font-medium focus:outline-none">
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px] rounded-lg border border-line px-4 py-2.5">
            <label className="block text-xs text-graphite-500 mb-1">Nationality (optional)</label>
            <input
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              placeholder="For transit-visa notes"
              className="w-full bg-transparent text-graphite-900 font-medium placeholder:font-normal placeholder:text-graphite-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo text-white font-medium px-6 py-3 hover:bg-indigo-dim disabled:opacity-60"
          >
            {submitting ? 'Searching…' : 'Search flights'}
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </form>
  );
}

function PaxStepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="w-5 h-5 rounded-full border border-line text-graphite-700 leading-none" aria-label={`Fewer ${label.toLowerCase()}s`}>
        −
      </button>
      <span className="text-graphite-900 font-medium w-4 text-center">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="w-5 h-5 rounded-full border border-line text-graphite-700 leading-none" aria-label={`More ${label.toLowerCase()}s`}>
        +
      </button>
      <span className="text-xs text-graphite-500">{label}{value === 1 ? '' : 's'}</span>
    </div>
  );
}
