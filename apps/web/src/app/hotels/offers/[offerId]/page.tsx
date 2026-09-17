'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { apiClient, ApiError } from '@/lib/api-client';
import { HotelOffer } from '@/lib/hotel-types';
import { formatDate, formatMoney } from '@/lib/format';

export default function HotelOfferDetailsPage() {
  const params = useParams<{ offerId: string }>();
  const router = useRouter();
  const [offer, setOffer] = useState<HotelOffer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getHotelOffer(params.offerId)
      .then((o) => !cancelled && setOffer(o))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Could not load this rate.'));
    return () => {
      cancelled = true;
    };
  }, [params.offerId]);

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        {error && (
          <p role="alert" className="text-sm text-red-600 bg-white border border-sand rounded-lg p-4">
            {error} — this rate may have expired. Please search again.
          </p>
        )}

        {!error && !offer && <p className="text-sm text-dusk-500">Loading rate details…</p>}

        {offer && (
          <>
            <div className="flex items-center justify-between">
              <h1 className="font-display text-2xl text-dusk-900">{offer.property?.name ?? 'Property'}</h1>
              {offer.isMock && (
                <span className="text-xs rounded-full bg-tangerine/10 text-tangerine-dim px-3 py-1 font-medium">
                  DEMO / MOCK rate
                </span>
              )}
            </div>
            <p className="text-sm text-dusk-500 mt-1">
              {offer.property?.city}, {offer.property?.country}
              {offer.property?.starRating ? ` · ${offer.property.starRating}★` : ''}
            </p>

            <div className="mt-6 rounded-2xl bg-white border border-sand shadow-sm p-5 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-dusk-500">Room type</span>
                <span className="text-dusk-900 font-medium">{offer.roomType}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dusk-500">Board</span>
                <span className="text-dusk-900 font-medium">{offer.board.replace('_', ' ')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dusk-500">Nights</span>
                <span className="text-dusk-900 font-medium">{offer.nights}</span>
              </div>
              {offer.checkInDate && (
                <div className="flex items-center justify-between">
                  <span className="text-dusk-500">Check-in</span>
                  <span className="text-dusk-900 font-medium">{formatDate(offer.checkInDate)}</span>
                </div>
              )}
              {offer.checkOutDate && (
                <div className="flex items-center justify-between">
                  <span className="text-dusk-500">Check-out</span>
                  <span className="text-dusk-900 font-medium">{formatDate(offer.checkOutDate)}</span>
                </div>
              )}
              {offer.adults !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-dusk-500">Guests</span>
                  <span className="text-dusk-900 font-medium">
                    {offer.adults} adult{offer.adults === 1 ? '' : 's'}
                    {offer.children ? `, ${offer.children} child${offer.children === 1 ? '' : 'ren'}` : ''}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-6 grid sm:grid-cols-2 gap-4">
              <InfoCard title="Cancellation">{offer.refundable ? 'Refundable' : 'Non-refundable'}</InfoCard>
              <InfoCard title="Price breakdown">
                Base {formatMoney(offer.baseFare, offer.currency)} + taxes {formatMoney(offer.taxes, offer.currency)} + fees{' '}
                {formatMoney(offer.fees, offer.currency)}
              </InfoCard>
            </div>

            <div className="mt-8 flex items-center justify-between rounded-2xl bg-white border border-sand shadow-sm p-5">
              <div>
                <p className="text-xs text-dusk-500">Total price, per room</p>
                <p className="font-display text-3xl text-dusk-900">{formatMoney(offer.totalFare, offer.currency)}</p>
              </div>
              <button
                onClick={() => router.push(`/hotels/offers/${offer.id}/book`)}
                className="rounded-lg bg-tangerine text-white font-medium px-6 py-3 hover:bg-tangerine-dim"
              >
                Continue to booking
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-white border border-sand p-4">
      <p className="text-xs font-medium text-dusk-700">{title}</p>
      <p className="mt-1 text-sm text-dusk-500">{children}</p>
    </div>
  );
}
