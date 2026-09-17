'use client';

import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface AirportOption {
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
 * A free-text field backed by GET /airports/search — typing "dac" or
 * "dhaka" resolves to a real IATA code via the dropdown, but the field
 * still accepts a bare 3-letter code typed directly (validated on the
 * backend either way, so this is a UX convenience, not a trust boundary).
 */
export function AirportInput({ label, value, onChange, placeholder }: AirportInputProps) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<AirportOption[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleInput(next: string) {
    setQuery(next);
    onChange(next.toUpperCase());
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next.trim().length < 2) {
      setOptions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const { results } = await apiClient.searchAirports(next);
        setOptions(results);
        setOpen(true);
      } catch {
        // Autocomplete is a convenience — a failed lookup just means no
        // suggestions this keystroke, not a form error worth surfacing.
        setOptions([]);
      }
    }, 200);
  }

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => options.length > 0 && setOpen(true)}
        placeholder={placeholder}
        maxLength={60}
        className="w-full bg-transparent text-slate-900 font-medium placeholder:font-normal placeholder:text-slate-500 focus:outline-none"
      />
      {open && options.length > 0 && (
        <ul className="absolute z-20 mt-1 w-72 max-w-[80vw] rounded-lg border border-line bg-white shadow-lg overflow-hidden">
          {options.map((o) => (
            <li key={o.iataCode}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.iataCode);
                  setQuery(`${o.city} (${o.iataCode})`);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-base"
              >
                <span className="font-medium text-slate-900">{o.city}</span>{' '}
                <span className="text-slate-500">({o.iataCode})</span>
                <span className="block text-xs text-slate-500">{o.name}, {o.country}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
