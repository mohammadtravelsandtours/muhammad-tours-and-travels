import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'About Us — Muhammad Tours and Travels',
  description: 'Who we are, what we book, and where to find us.',
};

const SERVICES = [
  { title: 'Flights', body: 'One search across our connected suppliers for domestic and international fares.' },
  { title: 'Hotels', body: 'Stays across South & Southeast Asia and the Gulf, booked and confirmed in the same flow as your flight.' },
  { title: 'Hajj & Umrah', body: 'Guided departures with transparent inclusions — pay a deposit, settle the rest in installments before travel.' },
  { title: 'Visas', body: 'Application tracking for the destinations we support, from submission to decision.' },
  { title: 'Manpower', body: 'Overseas job placement and recruitment processing for candidates and employers.' },
  { title: 'Packages', body: 'Bundled trip packages for travelers who want flight, stay, and activities arranged together.' },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-4xl mx-auto px-6 pt-10 pb-24">
        <h1 className="font-display text-3xl text-dusk-900">About Muhammad Tours and Travels</h1>
        <p className="mt-3 text-dusk-500 max-w-2xl">
          Your journey, our priority. We are a travel services company handling flights, hotels, Hajj &amp; Umrah
          packages, visa processing, manpower/overseas job placement, and holiday packages — all from one booking
          platform.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="rounded-lg border border-sand p-5">
            <h2 className="text-xs uppercase tracking-wide text-dusk-500 font-medium">Leadership</h2>
            <p className="mt-2 text-dusk-900">Director: MD Mahadi Hasan</p>
          </div>
          <div className="rounded-lg border border-sand p-5">
            <h2 className="text-xs uppercase tracking-wide text-dusk-500 font-medium">Offices</h2>
            <p className="mt-2 text-sm text-dusk-900">Head Office</p>
            <p className="text-sm text-dusk-500">Canyon Tower, 7th Floor, Sonargone Janapath Road, Uttora Sector 12, Dhaka 1230</p>
            <p className="mt-2 text-sm text-dusk-900">Branch Office</p>
            <p className="text-sm text-dusk-500">Khatiar Bazar, Mirzapur, Tangail</p>
          </div>
        </div>

        <h2 className="mt-12 font-display text-xl text-dusk-900">What we do</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => (
            <div key={s.title} className="rounded-lg border border-sand p-4">
              <h3 className="text-sm font-medium text-dusk-900">{s.title}</h3>
              <p className="mt-1 text-sm text-dusk-500">{s.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-xs text-dusk-500">
          Have a question first? Visit our{' '}
          <Link href="/contact" className="text-tangerine-dim hover:underline">
            Contact Us
          </Link>{' '}
          page, or use the chat assistant in the corner of any page.
        </p>
      </section>
    </main>
  );
}
