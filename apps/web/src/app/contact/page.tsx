import Link from 'next/link';
import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'Contact Us — Muhammad Tours and Travels',
  description: 'Phone, WhatsApp, email, and office addresses for Muhammad Tours and Travels.',
};

export default function ContactPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-4xl mx-auto px-6 pt-10 pb-24">
        <h1 className="font-display text-3xl text-dusk-900">Contact Us</h1>
        <p className="mt-2 text-dusk-500 max-w-xl">
          Reach us by phone, WhatsApp, or email — or visit one of our offices below. For an existing booking, use{' '}
          <Link href="/manage-booking" className="text-tangerine-dim hover:underline">
            Manage Booking
          </Link>{' '}
          to look it up directly.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="rounded-lg border border-sand p-5 space-y-3">
            <h2 className="text-xs uppercase tracking-wide text-dusk-500 font-medium">Get in touch</h2>
            <p>
              <a href="tel:+8801713420363" className="text-dusk-900 hover:text-tangerine-dim">
                +880 1713-420363
              </a>
              <span className="text-dusk-500 text-sm"> (Bangladesh / WhatsApp)</span>
            </p>
            <p>
              <a href="tel:+6593447481" className="text-dusk-900 hover:text-tangerine-dim">
                +65 9344 7481
              </a>
              <span className="text-dusk-500 text-sm"> (Singapore)</span>
            </p>
            <p>
              <a href="mailto:mohammadtravelsandtours@gmail.com" className="text-dusk-900 hover:text-tangerine-dim">
                mohammadtravelsandtours@gmail.com
              </a>
            </p>
            <p>
              <a
                href="https://muhammadtravels.com"
                target="_blank"
                rel="noreferrer"
                className="text-dusk-900 hover:text-tangerine-dim"
              >
                muhammadtravels.com
              </a>
            </p>
          </div>

          <div className="rounded-lg border border-sand p-5 space-y-4">
            <h2 className="text-xs uppercase tracking-wide text-dusk-500 font-medium">Our offices</h2>
            <div>
              <p className="text-sm text-dusk-900">Head Office</p>
              <p className="text-sm text-dusk-500">
                Canyon Tower, 7th Floor, Plot 24 & 26, Sonargaon Janapath Road, Sector 12, Uttara Model Town, Dhaka 1230
              </p>
            </div>
            <div>
              <p className="text-sm text-dusk-900">Branch Office</p>
              <p className="text-sm text-dusk-500">Khatiar Bazar, Mirzapur, Tangail</p>
            </div>
          </div>
        </div>

        <p className="mt-10 text-xs text-dusk-500">
          Prefer chat? Use the assistant in the corner of any page for quick questions about flights, hotels, or your
          booking status.
        </p>
      </section>
    </main>
  );
}
