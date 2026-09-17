'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

const CURRENCIES = ['USD', 'BDT', 'AED', 'SGD', 'GBP'];

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function HotelSearchForm() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [city, setCity] = useState('');
  const [checkInDate, setCheckInDate] = useState(todayPlus(14));
  const [checkOutDate, setCheckOutDate] = useState(todayPlus(17));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState(1);
  const [currency, setCurrency] = useState('USD');
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const guestsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (guestsRef.current && !guestsRef.current.contains(event.target as Node)) setGuestsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (city.trim().length < 2) {
      setError('Enter a destination city.');
      return;
    }
    if (checkOutDate <= checkInDate) {
      setError('Check-out must be after check-in.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiClient.searchHotels({
        city: city.trim(),
        checkInDate,
        checkOutDate,
        adults,
        children: children || undefined,
        rooms,
        currency,
      }, accessToken ?? undefined);
      router.push(`/hotels/search/${result.searchId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Hotel search failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,0.12)] sm:p-5">
      <div className="grid overflow-visible rounded-2xl border border-slate-200 md:grid-cols-[1.25fr_.75fr_.75fr]">
        <label className="border-b border-slate-200 p-4 md:border-b-0 md:border-r">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-dusk-500">Destination</span>
          <input
            required
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City or destination"
            maxLength={100}
            className="mt-1 w-full bg-transparent text-sm font-semibold text-dusk-900 outline-none placeholder:font-normal"
          />
        </label>
        <label className="border-b border-slate-200 p-4 md:border-b-0 md:border-r">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-dusk-500">Check-in</span>
          <input type="date" required min={todayPlus(0)} value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} className="mt-1 w-full bg-transparent text-sm font-semibold text-dusk-900 outline-none" />
        </label>
        <label className="p-4">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-dusk-500">Check-out</span>
          <input type="date" required min={checkInDate} value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} className="mt-1 w-full bg-transparent text-sm font-semibold text-dusk-900 outline-none" />
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <div ref={guestsRef} className="relative">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-dusk-500">Guests & rooms</label>
          <button type="button" onClick={() => setGuestsOpen((v) => !v)} className="mt-1 flex min-h-12 w-full items-center justify-between rounded-xl border border-slate-200 px-4 text-left text-sm font-semibold text-dusk-900">
            <span>{adults + children} guests · {rooms} room{rooms === 1 ? '' : 's'}</span><span className="text-dusk-400">⌄</span>
          </button>
          {guestsOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 w-full min-w-[300px] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
              <NumberRow label="Adults" hint="18+ years" value={adults} min={1} max={20} onChange={setAdults} />
              <NumberRow label="Children" hint="0–17 years" value={children} min={0} max={10} onChange={setChildren} />
              <NumberRow label="Rooms" hint="Number of rooms" value={rooms} min={1} max={9} onChange={setRooms} />
              <button type="button" onClick={() => setGuestsOpen(false)} className="mt-4 w-full rounded-xl bg-dusk-900 py-2.5 text-sm font-semibold text-white">Done</button>
            </div>
          )}
        </div>

        <label>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-dusk-500">Currency</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-dusk-900 outline-none">
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>

        <button type="submit" disabled={submitting} className="min-h-12 rounded-xl bg-tangerine px-7 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-tangerine-dim disabled:cursor-not-allowed disabled:opacity-60">
          {submitting ? 'Searching…' : 'Search hotels'}
        </button>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <p className="mt-3 text-xs text-dusk-400">Hotel availability and rates are returned by connected suppliers. Final rate is revalidated before booking.</p>
    </form>
  );
}

function NumberRow({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
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
