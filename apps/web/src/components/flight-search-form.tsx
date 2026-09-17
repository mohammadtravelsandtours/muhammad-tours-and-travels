'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AirportInput } from './airport-input';
import { apiClient, ApiError } from '@/lib/api-client';
import { CabinClass, FlightSearchSegmentInput, TripType } from '@/lib/flight-types';
import { useAuth } from '@/lib/auth-context';

const TRIP_TYPES: { value: TripType; label: string }[] = [
  { value: 'ROUND_TRIP', label: 'Round trip' },
  { value: 'ONE_WAY', label: 'One way' },
  { value: 'MULTI_CITY', label: 'Multi-city' },
];

const CABINS: { value: CabinClass; label: string }[] = [
  { value: 'ECONOMY', label: 'Economy' },
  { value: 'PREMIUM_ECONOMY', label: 'Premium Economy' },
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
  initialOrigin?: string;
  initialDestination?: string;
}

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
    setError(null);
    setTripType(next);
    setSegments((prev) => {
      const first = prev[0] ?? emptySegment(todayPlus(14));
      if (next === 'ONE_WAY') return [first];
      if (next === 'ROUND_TRIP') return [first, prev[1] ?? emptySegment(first.departureDate || todayPlus(21))];
      return prev.length >= 2 ? prev : [first, emptySegment(todayPlus(21))];
    });
  }

  const mainOrigin = segments[0]?.origin ?? '';
  const mainDestination = segments[0]?.destination ?? '';

  function setMainOrigin(v: string) {
    setSegments((prev) => prev.map((s, i) => (
      i === 0
        ? { ...s, origin: v }
        : tripType === 'ROUND_TRIP' && i === 1
          ? { ...s, destination: v }
          : s
    )));
  }

  function setMainDestination(v: string) {
    setSegments((prev) => prev.map((s, i) => (
      i === 0
        ? { ...s, destination: v }
        : tripType === 'ROUND_TRIP' && i === 1
          ? { ...s, origin: v }
          : s
    )));
  }

  function swapMain() {
    setSegments((prev) => prev.map((s, i) => {
      if (i === 0) return { ...s, origin: mainDestination, destination: mainOrigin };
      if (tripType === 'ROUND_TRIP' && i === 1) return { ...s, origin: mainOrigin, destination: mainDestination };
      return s;
    }));
  }

  function updateSegment(index: number, patch: Partial<FlightSearchSegmentInput>) {
    setSegments((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSegment() {
    const last = segments[segments.length - 1];
    setSegments([...segments, emptySegment(last?.departureDate ?? todayPlus(14))]);
  }

  function removeSegment(index: number) {
    setSegments((prev) => prev.length <= 2 ? prev : prev.filter((_, i) => i !== index));
  }

  function validateDates() {
    for (let i = 0; i < segments.length; i += 1) {
      if (!segments[i].departureDate) return 'Select a departure date for every flight.';
      if (i > 0 && segments[i].departureDate < segments[i - 1].departureDate) {
        return `Flight ${i + 1} cannot depart before flight ${i}.`;
      }
    }
    if (tripType === 'ROUND_TRIP' && segments[1].departureDate < segments[0].departureDate) {
      return 'Return date must be on or after the departure date.';
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    for (const s of segments) {
      if (!/^[A-Z]{3}$/.test(s.origin) || !/^[A-Z]{3}$/.test(s.destination)) {
        setError('Select both airports from the airport dropdown before searching.');
        return;
      }
      if (s.origin === s.destination) {
        setError('Origin and destination cannot be the same airport.');
        return;
      }
    }

    const dateError = validateDates();
    if (dateError) {
      setError(dateError);
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiClient.searchFlights({
        tripType,
        cabin,
        segments,
        adults,
        children: children || undefined,
        infants: infants || undefined,
        currency,
        nationality: nationality || undefined,
      }, accessToken ?? undefined);
      router.push(`/search/${result.searchId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const paxTotal = adults + children + infants;

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,0.12)] sm:p-5">
      <div role="tablist" aria-label="Trip type" className="mb-5 flex flex-wrap gap-1 border-b border-slate-100 pb-3">
        {TRIP_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tripType === t.value}
            onClick={() => setTrip(t.value)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              tripType === t.value ? 'bg-dusk-900 text-white shadow-sm' : 'text-dusk-600 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tripType !== 'MULTI_CITY' ? (
        <div className="grid gap-0 overflow-visible rounded-2xl border border-slate-200 md:grid-cols-[1.05fr_1.05fr_0.8fr_0.8fr]">
          <div className="relative border-b border-slate-200 p-4 md:border-b-0 md:border-r">
            <AirportInput label="From" value={mainOrigin} onChange={setMainOrigin} />
          </div>
          <div className="relative border-b border-slate-200 p-4 md:border-b-0 md:border-r">
            <AirportInput label="To" value={mainDestination} onChange={setMainDestination} />
            <button
              type="button"
              onClick={swapMain}
              aria-label="Swap origin and destination"
              className="absolute -bottom-4 left-1/2 z-10 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full border border-slate-200 bg-white text-dusk-700 shadow-sm hover:text-tangerine md:-right-4 md:bottom-auto md:top-1/2 md:left-auto md:translate-x-0 md:-translate-y-1/2"
            >
              ⇄
            </button>
          </div>
          <DateField
            label="Departure"
            value={segments[0]?.departureDate ?? ''}
            min={todayPlus(0)}
            onChange={(value) => updateSegment(0, { departureDate: value })}
          />
          {tripType === 'ROUND_TRIP' ? (
            <DateField
              label="Return"
              value={segments[1]?.departureDate ?? ''}
              min={segments[0]?.departureDate ?? todayPlus(0)}
              onChange={(value) => updateSegment(1, { departureDate: value })}
            />
          ) : (
            <div className="hidden md:block" aria-hidden="true" />
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {segments.map((segment, i) => (
            <div key={i} className="grid gap-3 rounded-2xl border border-slate-200 p-3 md:grid-cols-[1fr_1fr_0.8fr_auto]">
              <AirportInput label={`Flight ${i + 1} · From`} value={segment.origin} onChange={(v) => updateSegment(i, { origin: v })} />
              <AirportInput label={`Flight ${i + 1} · To`} value={segment.destination} onChange={(v) => updateSegment(i, { destination: v })} />
              <DateField label="Departure" value={segment.departureDate} min={todayPlus(0)} onChange={(v) => updateSegment(i, { departureDate: v })} />
              {segments.length > 2 ? (
                <button type="button" onClick={() => removeSegment(i)} className="self-end px-3 py-3 text-sm text-dusk-500 hover:text-red-600">
                  Remove
                </button>
              ) : <span />}
            </div>
          ))}
          {segments.length < 6 && (
            <button type="button" onClick={addSegment} className="text-sm font-semibold text-tangerine-dim hover:underline">
              + Add another flight
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
        <PassengerPicker
          adults={adults}
          children={children}
          infants={infants}
          total={paxTotal}
          onAdultsChange={(value) => {
            setAdults(value);
            setInfants((current) => Math.min(current, value));
          }}
          onChildrenChange={setChildren}
          onInfantsChange={setInfants}
        />
        <CabinPicker value={cabin} onChange={setCabin} />
        {!compact && (
          <>
            <SelectField label="Currency" value={currency} options={CURRENCIES} onChange={setCurrency} />
            <label className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-dusk-500">Nationality</span>
              <input
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                placeholder="Optional"
                className="mt-1 w-full bg-transparent text-sm font-semibold text-dusk-900 outline-none"
              />
            </label>
          </>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-tangerine px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:bg-tangerine-dim disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Searching…' : 'Search flights'}
        </button>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <p className="mt-3 text-xs text-dusk-400">
        Airport codes are verified against our airport database. Final fares and availability are always revalidated before booking.
      </p>
    </form>
  );
}

function DateField({ label, value, min, onChange }: { label: string; value: string; min: string; onChange: (value: string) => void }) {
  return (
    <label className="border-b border-slate-200 p-4 md:border-b-0 md:border-r">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-dusk-500">{label}</span>
      <input type="date" required min={min} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full bg-transparent text-sm sm:text-base font-semibold text-dusk-900 outline-none" />
    </label>
  );
}

function PassengerPicker({
  adults, children, infants, total, onAdultsChange, onChildrenChange, onInfantsChange,
}: {
  adults: number; children: number; infants: number; total: number;
  onAdultsChange: (v: number) => void; onChildrenChange: (v: number) => void; onInfantsChange: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={ref} className="relative">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-dusk-500">Passengers</label>
      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 flex min-h-12 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-left text-sm font-semibold text-dusk-900">
        <span>{total} traveler{total === 1 ? '' : 's'}</span><span className="text-dusk-400">⌄</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-full min-w-[290px] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
          <PaxRow label="Adults" hint="12+ years" value={adults} min={1} max={9} onChange={onAdultsChange} />
          <PaxRow label="Children" hint="2–11 years" value={children} min={0} max={8} onChange={onChildrenChange} />
          <PaxRow label="Infants" hint="Under 2 years" value={infants} min={0} max={adults} onChange={onInfantsChange} />
          <button type="button" onClick={() => setOpen(false)} className="mt-4 w-full rounded-xl bg-dusk-900 py-2.5 text-sm font-semibold text-white">Done</button>
        </div>
      )}
    </div>
  );
}

function CabinPicker({ value, onChange }: { value: CabinClass; onChange: (v: CabinClass) => void }) {
  return (
    <label>
      <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-dusk-500">Travel class</span>
      <select value={value} onChange={(e) => onChange(e.target.value as CabinClass)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-dusk-900 outline-none">
        {CABINS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    </label>
  );
}

function PaxRow({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div><p className="text-sm font-semibold text-dusk-900">{label}</p><p className="text-xs text-dusk-500">{hint}</p></div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={value <= min} onClick={() => onChange(value - 1)} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 disabled:opacity-40">−</button>
        <span className="w-5 text-center text-sm font-semibold">{value}</span>
        <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 disabled:opacity-40">+</button>
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label>
      <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-dusk-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-dusk-900 outline-none">
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}
