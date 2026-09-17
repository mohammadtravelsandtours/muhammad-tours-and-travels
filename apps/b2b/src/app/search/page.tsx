import { B2bHeader } from '@/components/b2b-header';
import { FlightSearchForm } from '@/components/flight-search-form';

export default function SearchPage() {
  return (
    <main className="min-h-screen">
      <B2bHeader />
      <section className="max-w-4xl mx-auto px-6 pt-10 pb-24">
        <h1 className="text-2xl font-semibold text-slate-900">Search flights</h1>
        <p className="mt-2 text-sm text-slate-500">
          One search fans out to every connected supplier at once — a slow or unavailable supplier
          never blocks the rest. Any booking you make settles against your agency's wallet.
        </p>
        <div className="mt-8">
          <FlightSearchForm />
        </div>
      </section>
    </main>
  );
}
