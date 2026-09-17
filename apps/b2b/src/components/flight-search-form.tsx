'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
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

export interface FlightSearchFormProps {
  compact?: boolean;
  /** Prefills the main From/To pair. */
  initialOrigin?: string;
  initialDestination?: string;
}

/**
 * One form drives the /search page — `compact` hides the less-common
 * controls (currency, nationality) so a future compact usage doesn't
 * drift into a second implementation of the same POST /flights/search
 * call.
 *
 * For ONE_WAY/ROUND_TRIP the two legs of a round trip are still two entries
 * in `segments` (the API requires exactly 2 for ROUND_TRIP — see
 * flight-search-orchestrator.service.ts), but the UI shows a single
 * From/To pair and mirrors it into the return leg automatically, matching
 * how every airline search widget presents it. MULTI_CITY keeps one full
 * row per leg since each one is a genuinely distinct origin/destination.
 */
export function FlightSearchForm({ compact = false, initialOrigin, initialDestination }: FlightSearchFormProps) {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [tripType, setTripType] = useState<TripType>('ROUND_TRIP');
  const [segments, setSegments] = useState<FlightSearchSegmentInput[]>([
    { origin: initialOrigin ?? '', destination: initialDestination ?? '', departureDate: todayPlus(14) },
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

  // ── Main From/To pair (ONE_WAY / ROUND_TRIP) ────────────────────────
  const mainOrigin = segments[0]?.origin ?? '';
  const mainDestination = segments[0]?.destination ?? '';

  function setMainOrigin(v: string) {
    setSegments((prev) =>
      prev.map((s, i) => (i === 0 ? { ...s, origin: v } : tripType === 'ROUND_TRIP' && i === 1 ? { ...s, destination: v } : s)),
    );
  }

  function setMainDestination(v: string) {
    setSegments((prev) =>
      prev.map((s, i) => (i === 0 ? { ...s, destination: v } : tripType === 'ROUND_TRIP' && i === 1 ? { ...s, origin: v } : s)),
    );
  }

  function swapMain() {
    setSegments((prev) =>
      prev.map((s, i) => {
        if (i === 0) return { ...s, origin: mainDestination, destination: mainOrigin };
        if (tripType === 'ROUND_TRIP' && i === 1) return { ...s, origin: mainOrigin, destination: mainDestination };
        return s;
      }),
    );
  }

  // ── Per-leg editing (MULTI_CITY only) ───────────────────────────────
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

    for (const s of segments) {
      if (s.origin.length !== 3 || s.destination.length !== 3) {
        setError('Choose both a from and a to airport for every flight — pick one from the dropdown or type its 3-letter IATA code.');
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
        accessToken ?? undefined,
      );
      router.push(`/search/${result.searchId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const paxTotal = adults + children + infants;
  const cabinLabel = CABINS.find((c) => c.value === cabin)?.label ?? 'Economy';

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-line shadow-sm p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
        {TRIP_TYPES.map((t) => (
          <label key={t.value} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="tripType"
              checked={tripType === t.value}
              onChange={() => setTrip(t.value)}
              className="accent-teal"
            />
            <span className={tripType === t.value ? 'text-slate-900 font-medium' : 'text-slate-500'}>{t.label}</span>
          </label>
        ))}
      </div>

      <div className="space-y-3">
        {tripType !== 'MULTI_CITY' ? (
          <div className="flex flex-col sm:flex-row sm:items-stretch rounded-xl border border-line overflow-visible">
            <div className="flex-1 relative px-4 py-2.5 border-b sm:border-b-0 sm:border-r border-line">
              <AirportInput label="From (IATA code)" value={mainOrigin} onChange={setMainOrigin} placeholder="City or airport" />
            </div>

            <div className="relative flex justify-center sm:justify-start sm:w-0">
              <button
                type="button"
                onClick={swapMain}
                aria-label="Swap origin and destination"
                title="Swap"
                className="z-10 -mt-3 sm:mt-0 sm:-ml-4 sm:mt-[1.15rem] w-8 h-8 rounded-full border border-line bg-white shadow-sm flex items-center justify-center text-slate-700 hover:text-teal hover:border-teal transition-colors"
              >
                <span aria-hidden className="text-sm leading-none">⇄</span>
              </button>
            </div>

            <div className="flex-1 px-4 py-2.5 border-b sm:border-b-0 sm:border-r border-line">
              <AirportInput label="To (IATA code)" value={mainDestination} onChange={setMainDestination} placeholder="City or airport" />
            </div>

            <div className="flex-1 px-4 py-2.5 border-b sm:border-b-0 sm:border-r border-line">
              <label className="block text-xs text-slate-500 mb-1">Depart</label>
              <input
                type="date"
                required
                min={todayPlus(0)}
                value={segments[0]?.departureDate ?? ''}
                onChange={(e) => updateSegment(0, { departureDate: e.target.value })}
                className="w-full bg-transparent text-slate-900 font-medium focus:outline-none"
              />
            </div>

            {tripType === 'ROUND_TRIP' && (
              <div className="flex-1 px-4 py-2.5">
                <label className="block text-xs text-slate-500 mb-1">Return</label>
                <input
                  type="date"
                  required
                  min={segments[0]?.departureDate ?? todayPlus(0)}
                  value={segments[1]?.departureDate ?? ''}
                  onChange={(e) => updateSegment(1, { departureDate: e.target.value })}
                  className="w-full bg-transparent text-slate-900 font-medium focus:outline-none"
                />
              </div>
            )}
          </div>
        ) : (
          <>
            {segments.map((segment, i) => (
              <div key={i} className="flex flex-wrap gap-3 text-sm">
                <div className="flex-1 min-w-[140px] rounded-lg border border-line px-4 py-2.5">
                  <AirportInput label="From" value={segment.origin} onChange={(v) => updateSegment(i, { origin: v })} placeholder="City or airport" />
                </div>
                <div className="flex-1 min-w-[140px] rounded-lg border border-line px-4 py-2.5">
                  <AirportInput label="To" value={segment.destination} onChange={(v) => updateSegment(i, { destination: v })} placeholder="City or airport" />
                </div>
                <div className="flex-1 min-w-[140px] rounded-lg border border-line px-4 py-2.5">
                  <label className="block text-xs text-slate-500 mb-1">Flight {i + 1} date</label>
                  <input
                    type="date"
                    required
                    min={todayPlus(0)}
                    value={segment.departureDate}
                    onChange={(e) => updateSegment(i, { departureDate: e.target.value })}
                    className="w-full bg-transparent text-slate-900 font-medium focus:outline-none"
                  />
                </div>
                {segments.length > 2 && (
                  <button type="button" onClick={() => removeSegment(i)} className="text-slate-500 hover:text-slate-900 text-xs self-center" aria-label={`Remove flight ${i + 1}`}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            {segments.length < 6 && (
              <button type="button" onClick={addSegment} className="text-sm text-teal-dim">
                + Add another flight
              </button>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-3 text-sm items-end">
          <PassengerClassPicker
            adults={adults}
            children={children}
            infants={infants}
            cabin={cabin}
            compact={compact}
            paxTotal={paxTotal}
            cabinLabel={cabinLabel}
            onAdultsChange={(next) => {
              setAdults(next);
              // Every infant needs an accompanying adult (enforced
              // server-side too) — clamp immediately so lowering the
              // adult count can't silently leave an invalid combination
              // sitting in the form until submit.
              setInfants((prev) => Math.min(prev, next));
            }}
            onChildrenChange={setChildren}
            onInfantsChange={setInfants}
            onCabinChange={setCabin}
          />
          {!compact && (
            <div className="flex-1 min-w-[100px] rounded-lg border border-line px-4 py-2.5">
              <label className="block text-xs text-slate-500 mb-1">Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full bg-transparent text-slate-900 font-medium focus:outline-none">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
          {!compact && (
            <div className="flex-1 min-w-[160px] rounded-lg border border-line px-4 py-2.5">
              <label className="block text-xs text-slate-500 mb-1">Nationality (optional)</label>
              <input
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                placeholder="For transit-visa notes"
                className="w-full bg-transparent text-slate-900 font-medium placeholder:font-normal placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-teal text-white font-medium px-8 py-3 hover:bg-teal-dim disabled:opacity-60"
          >
            {submitting ? 'Searching…' : 'Search flights'}
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </form>
  );
}

function PassengerClassPicker({
  adults,
  children,
  infants,
  cabin,
  compact,
  paxTotal,
  cabinLabel,
  onAdultsChange,
  onChildrenChange,
  onInfantsChange,
  onCabinChange,
}: {
  adults: number;
  children: number;
  infants: number;
  cabin: CabinClass;
  compact: boolean;
  paxTotal: number;
  cabinLabel: string;
  onAdultsChange: (v: number) => void;
  onChildrenChange: (v: number) => void;
  onInfantsChange: (v: number) => void;
  onCabinChange: (v: CabinClass) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="relative flex-1 min-w-[190px]" ref={containerRef}>
      <label className="block text-xs text-slate-500 mb-1" id="pax-class-label">Travelers & class</label>
      <button
        type="button"
        aria-labelledby="pax-class-label"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left rounded-lg border border-line px-4 py-2.5 text-slate-900 font-medium hover:border-slate-500 transition-colors"
      >
        {paxTotal} traveler{paxTotal === 1 ? '' : 's'} · {cabinLabel}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-72 rounded-xl border border-line bg-white shadow-lg p-4 space-y-4">
          <div className="space-y-3">
            <PaxRow label="Adults" sublabel="12+ years" value={adults} min={1} max={9} onChange={onAdultsChange} />
            {!compact && <PaxRow label="Children" sublabel="2–11 years" value={children} min={0} max={8} onChange={onChildrenChange} />}
            {!compact && <PaxRow label="Infants" sublabel="Under 2 years" value={infants} min={0} max={adults} onChange={onInfantsChange} />}
          </div>

          <div className="pt-3 border-t border-line">
            <p className="text-xs text-slate-500 mb-2">Cabin class</p>
            <div className="grid grid-cols-2 gap-1.5">
              {CABINS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => onCabinChange(c.value)}
                  className={`rounded-md px-2.5 py-1.5 text-xs text-left ${
                    cabin === c.value ? 'bg-slate-900 text-base' : 'bg-base text-slate-700 hover:bg-line/60'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full rounded-md bg-teal text-white text-sm font-medium py-2 hover:bg-teal-dim"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function PaxRow({ label, sublabel, value, min, max, onChange }: { label: string; sublabel: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{sublabel}</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="w-6 h-6 rounded-full border border-line text-slate-700 leading-none disabled:opacity-40" disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>
          −
        </button>
        <span className="text-slate-900 font-medium w-4 text-center">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="w-6 h-6 rounded-full border border-line text-slate-700 leading-none disabled:opacity-40" disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
          +
        </button>
      </div>
    </div>
  );
}
