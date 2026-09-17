'use client';

import Link from 'next/link';
import { HotelOffer } from '@/lib/hotel-types';
import { formatMoney } from '@/lib/format';

export function HotelOfferCard({ offer }: { offer: HotelOffer }) {
  return (
    <Link
      href={`/hotels/offers/${offer.id}`}
      className="block rounded-2xl bg-white border border-sand shadow-sm p-5 hover:border-tangerine transition-colors"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-dusk-500">{offer.isMock ? 'DEMO rate' : offer.property?.country ?? 'Hotel'}</p>
          <p className="text-lg font-medium text-dusk-900">{offer.property?.name ?? 'Property'}</p>
          <p className="text-xs text-dusk-500">
            {offer.property?.city}
            {offer.property?.starRating ? ` · ${offer.property.starRating}★` : ''} · {offer.roomType} · {offer.board.replace('_', ' ')}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end text-xs text-dusk-500">
            <span>{offer.nights} night{offer.nights === 1 ? '' : 's'}</span>
            <span>{offer.refundable ? 'Refundable' : 'Non-refundable'}</span>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl text-dusk-900">{formatMoney(offer.totalFare, offer.currency)}</p>
            <p className="text-xs text-dusk-500">total, per room</p>
          </div>
        </div>
      </div>

      {offer.isMock && (
        <p className="mt-3 text-xs text-tangerine-dim">DEMO / MOCK — not a real rate</p>
      )}
    </Link>
  );
}
