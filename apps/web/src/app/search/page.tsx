import { SiteHeader } from '@/components/site-header';
import { FlightSearchForm } from '@/components/flight-search-form';

export default function SearchPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-4xl mx-auto px-6 pt-10 pb-24">
        <h1 className="font-display text-3xl text-dusk-900">Search flights</h1>
        <p className="mt-2 text-sm text-dusk-500">
          One search fans out to every connected supplier at once — a slow or unavailable supplier
          never blocks the rest.
        </p>
        <div className="mt-8">
          <FlightSearchForm />
        </div>
      </section>
    </main>
  );
}
