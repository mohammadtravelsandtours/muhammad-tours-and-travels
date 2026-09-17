'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError, HajjUmrahBookingRow, HajjUmrahPackageRow } from '@/lib/api-client';

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
}

const EMPTY_FORM = {
  title: '',
  type: 'UMRAH' as 'HAJJ' | 'UMRAH',
  description: '',
  departureDate: '',
  returnDate: '',
  durationNights: '10',
  currency: 'USD',
  totalAmount: '',
  depositType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED',
  depositValue: '',
  capacity: '',
  makkahHotel: '',
  madinahHotel: '',
  inclusions: '',
};

export default function HajjUmrahAdminPage() {
  const { accessToken } = useAuth();
  const [packages, setPackages] = useState<HajjUmrahPackageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<HajjUmrahBookingRow[] | null>(null);
  const [bookingsError, setBookingsError] = useState<string | null>(null);

  function load() {
    if (!accessToken) return;
    apiClient
      .listHajjUmrahPackagesAdmin(accessToken)
      .then((r) => setPackages(r.packages))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load packages.'));
  }

  useEffect(load, [accessToken]);

  function loadBookings(packageId: string | null) {
    if (!accessToken) return;
    setSelectedPackageId(packageId);
    setBookingsError(null);
    apiClient
      .listHajjUmrahBookingsAdmin(accessToken, packageId ?? undefined)
      .then((r) => setBookings(r.bookings))
      .catch((err) => setBookingsError(err instanceof ApiError ? err.message : 'Could not load bookings.'));
  }

  async function createPackage() {
    if (!accessToken) return;
    const totalAmount = Number(form.totalAmount);
    const depositValue = Number(form.depositValue);
    const capacity = Number(form.capacity);
    const durationNights = Number(form.durationNights);
    if (!form.title.trim() || !form.departureDate || !form.returnDate) {
      setFormError('Title, departure date, and return date are required.');
      return;
    }
    if (![totalAmount, depositValue, capacity, durationNights].every(Number.isFinite)) {
      setFormError('Total amount, deposit value, capacity, and duration must be numbers.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await apiClient.createHajjUmrahPackage(accessToken, {
        title: form.title,
        type: form.type,
        description: form.description || undefined,
        departureDate: form.departureDate,
        returnDate: form.returnDate,
        durationNights,
        currency: form.currency.toUpperCase(),
        totalAmount,
        depositType: form.depositType,
        depositValue,
        capacity,
        makkahHotel: form.makkahHotel || undefined,
        madinahHotel: form.madinahHotel || undefined,
        inclusions: form.inclusions
          ? form.inclusions.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
      });
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create this package.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(pkg: HajjUmrahPackageRow) {
    if (!accessToken) return;
    await apiClient.updateHajjUmrahPackage(accessToken, pkg.id, { active: !pkg.active });
    load();
  }

  return (
    <AdminShell>
      <h2 className="text-lg font-semibold text-paper-100 mb-1">Hajj &amp; Umrah packages</h2>
      <p className="text-sm text-paper-500 mb-6">
        Manage bookable departures — dates, price per pilgrim, the deposit rule, capacity, and inclusions. Deactivate a
        package instead of deleting it once it has bookings.
      </p>

      <div className="border border-ink-700 rounded-lg p-5 bg-ink-900 mb-8">
        <p className="text-xs text-paper-500 mb-3">New package</p>
        <div className="grid sm:grid-cols-3 gap-2 text-sm">
          <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100 sm:col-span-2" />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'HAJJ' | 'UMRAH' })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100">
            <option value="UMRAH">Umrah</option>
            <option value="HAJJ">Hajj</option>
          </select>

          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100 sm:col-span-3"
            rows={2}
          />

          <label className="text-xs text-paper-500 flex flex-col gap-1">
            Departure date
            <input type="date" value={form.departureDate} onChange={(e) => setForm({ ...form, departureDate: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>
          <label className="text-xs text-paper-500 flex flex-col gap-1">
            Return date
            <input type="date" value={form.returnDate} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>
          <label className="text-xs text-paper-500 flex flex-col gap-1">
            Duration (nights)
            <input type="number" min="1" value={form.durationNights} onChange={(e) => setForm({ ...form, durationNights: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>

          <label className="text-xs text-paper-500 flex flex-col gap-1">
            Currency
            <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={3} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>
          <label className="text-xs text-paper-500 flex flex-col gap-1">
            Price per pilgrim
            <input type="number" min="0" step="0.01" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>
          <label className="text-xs text-paper-500 flex flex-col gap-1">
            Capacity (seats)
            <input type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>

          <label className="text-xs text-paper-500 flex flex-col gap-1">
            Deposit type
            <select value={form.depositType} onChange={(e) => setForm({ ...form, depositType: e.target.value as 'PERCENTAGE' | 'FIXED' })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100">
              <option value="PERCENTAGE">Percentage of total</option>
              <option value="FIXED">Fixed amount per pilgrim</option>
            </select>
          </label>
          <label className="text-xs text-paper-500 flex flex-col gap-1">
            {form.depositType === 'PERCENTAGE' ? 'Deposit %' : 'Deposit per pilgrim'}
            <input type="number" min="0" step="0.01" value={form.depositValue} onChange={(e) => setForm({ ...form, depositValue: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>

          <label className="text-xs text-paper-500 flex flex-col gap-1">
            Makkah hotel (optional)
            <input value={form.makkahHotel} onChange={(e) => setForm({ ...form, makkahHotel: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>
          <label className="text-xs text-paper-500 flex flex-col gap-1">
            Madinah hotel (optional)
            <input value={form.madinahHotel} onChange={(e) => setForm({ ...form, madinahHotel: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>
          <label className="text-xs text-paper-500 flex flex-col gap-1 sm:col-span-3">
            Inclusions (comma-separated)
            <input placeholder="Flights, 5-star hotel, Ziyarat tours, Guide" value={form.inclusions} onChange={(e) => setForm({ ...form, inclusions: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-md px-2 py-2 text-paper-100" />
          </label>
        </div>

        {formError && <p role="alert" className="text-sm text-danger mt-3">{formError}</p>}

        <button onClick={createPackage} disabled={submitting} className="mt-4 rounded-md bg-signal text-ink-950 font-medium px-4 py-2 text-sm hover:bg-signal-dim disabled:opacity-60">
          {submitting ? 'Creating…' : 'Create package'}
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-danger mb-4">{error}</p>}
      {!error && packages === null && <p className="text-sm text-paper-500">Loading…</p>}

      <div className="space-y-3 mb-10">
        {packages?.map((p) => (
          <div key={p.id} className="border border-ink-700 rounded-lg p-4 bg-ink-900">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-paper-100 font-medium">
                  {p.title} <span className="text-paper-500 text-xs">({p.type})</span>
                  {!p.active && <span className="ml-2 text-xs rounded-full bg-danger/20 text-danger px-2 py-0.5">inactive</span>}
                </p>
                <p className="text-xs text-paper-500 mt-1">
                  {formatDate(p.departureDate)} — {formatDate(p.returnDate)} · {p.seatsBooked}/{p.capacity} seats booked ·{' '}
                  {formatMoney(p.totalAmount, p.currency)}/pilgrim · deposit {p.depositType === 'PERCENTAGE' ? `${p.depositValue}%` : `${formatMoney(p.depositValue, p.currency)}/pilgrim`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => loadBookings(p.id)} className="text-xs text-signal hover:text-signal-dim">
                  View bookings
                </button>
                <button onClick={() => toggleActive(p)} className="text-xs text-paper-300 hover:text-paper-100 border border-ink-700 rounded-md px-2 py-1">
                  {p.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold text-paper-100 mb-1">Bookings{selectedPackageId ? ' (filtered)' : ''}</h2>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => loadBookings(null)} className="text-xs text-signal hover:text-signal-dim">
          Show all bookings
        </button>
      </div>

      {bookingsError && <p role="alert" className="text-sm text-danger mb-4">{bookingsError}</p>}
      {bookings === null && !bookingsError && <p className="text-sm text-paper-500">Select &quot;View bookings&quot; on a package, or &quot;Show all bookings&quot;.</p>}

      <div className="space-y-2">
        {bookings?.length === 0 && <p className="text-sm text-paper-500">No bookings.</p>}
        {bookings?.map((b) => (
          <div key={b.id} className="border border-ink-700 rounded-lg p-4 bg-ink-900 text-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-paper-100 font-medium">
                  {b.bookingReference} — {b.leadPilgrimName} ({b.pilgrims} pilgrim{b.pilgrims === 1 ? '' : 's'})
                </p>
                <p className="text-xs text-paper-500 mt-1">
                  {b.package?.title ?? 'Package'} · {b.contactPhone} · {b.contactEmail}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs rounded-full bg-ink-800 text-paper-300 px-2 py-1 inline-block mb-1">{b.status}</p>
                <p className="text-paper-100 font-medium">
                  {formatMoney(b.amountPaid, b.currency)} / {formatMoney(b.totalAmount, b.currency)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
