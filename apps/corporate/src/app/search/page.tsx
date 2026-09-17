'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CorporateHeader } from '@/components/corporate-header';
import { FlightSearchForm } from '@/components/flight-search-form';
import { useAuth } from '@/lib/auth-context';

export default function SearchPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <main className="min-h-screen">
      <CorporateHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        <h1 className="text-2xl font-semibold text-graphite-900">Search flights</h1>
        <p className="mt-2 text-sm text-graphite-500">
          Bookings made here follow your company's travel policy — a booking is confirmed with the
          airline but held until your approver signs off, then ticketed automatically.
        </p>
        <div className="mt-8">
          <FlightSearchForm />
        </div>
      </section>
    </main>
  );
}
