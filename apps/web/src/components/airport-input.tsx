'use client';

import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';

export interface AirportOption {
  iataCode: string;
  name: string;
  city: string;
  country: string;
}

interface AirportInputProps {
  label: string;
  value: string;
  onChange: (iataCode: string) => void;
  placeholder?: string;
}

/**
 * Production UX for airport selection. The API is the source of truth for
 * airport codes; the user selects a returned airport rather than submitting
 * arbitrary free text. This is still client-side UX only — the API validates
 * the code again before searching.
 */
export function AirportInput({ label, value, onChange, placeholder = 'Search city, airport or IATA' }: AirportInputProps) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<AirportOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AirportOption | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
    if (!value) setSelected(null);
  }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleInput(next: string) {
    setQuery(next);
    setSelected(null);
    onChange('');
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = next.trim();
    if (trimmed.length < 2) {
      setOptions([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { results } = await apiClient.searchAirports(trimmed);
        setOptions(results);
        setOpen(results.length > 0);
      } catch {
        setOptions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  function selectAirport(option: AirportOption) {
    setSelected(option);
    setQuery(`${option.city} (${option.iataCode})`);
    onChange(option.iataCode);
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-dusk-500 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sand text-[11px] font-bold text-dusk-700">
          {value || '—'}
        </span>
        <input
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => options.length > 0 && setOpen(true)}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${label.replace(/\W+/g, '-').toLowerCase()}-airports`}
          placeholder={placeholder}
          maxLength={60}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm sm:text-base text-dusk-900 font-semibold placeholder:font-normal placeholder:text-dusk-400 focus:outline-none"
        />
        {loading && <span className="text-xs text-dusk-400" aria-label="Searching airports">…</span>}
      </div>

      {open && options.length > 0 && (
        <ul
          id={`${label.replace(/\W+/g, '-').toLowerCase()}-airports`}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-3 max-h-80 overflow-auto rounded-2xl border border-sand bg-white p-1.5 shadow-2xl"
        >
          {options.map((option) => (
            <li key={option.iataCode} role="option" aria-selected={selected?.iataCode === option.iataCode}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectAirport(option)}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-sand/60 focus:bg-sand/60 focus:outline-none"
              >
                <span className="mt-0.5 rounded-md bg-dusk-900 px-2 py-1 text-[11px] font-bold text-white">{option.iataCode}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-dusk-900">{option.city}</span>
                  <span className="block truncate text-xs text-dusk-500">{option.name} · {option.country}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
