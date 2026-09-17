// Click-to-contact links — WhatsApp (wa.me), phone (tel:), email
// (mailto:). No backend call: these are plain links that hand off to
// the customer's own WhatsApp/phone/mail app. Real automated WhatsApp
// MESSAGING (a booking-confirmed notification) is separate and lives in
// the API's NotificationsService/WhatsAppProvider — this widget is the
// always-available fallback a visitor can use themselves at any time,
// regardless of whether that backend integration is configured.
//
// Automated outbound PHONE CALLS were deliberately not built — there is
// no legitimate way to auto-dial a customer without a voice/IVR product,
// which is disproportionate to this feature; "phone" here is always a
// tel: link the visitor taps themselves.
const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '8801713420363';
const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || '+8801713420363';
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'mohammadtravelsandtours@gmail.com';

export function ContactWidget({ prefillMessage, className }: { prefillMessage?: string; className?: string }) {
  const waHref = `https://wa.me/${WHATSAPP_NUMBER}${prefillMessage ? `?text=${encodeURIComponent(prefillMessage)}` : ''}`;

  return (
    <div className={`rounded-lg border border-sand bg-ground p-4 sm:p-5 ${className ?? ''}`}>
      <h3 className="text-sm font-medium text-dusk-900 mb-3">Need help? Contact Muhammad Tours and Travels</h3>
      <div className="flex flex-wrap gap-2.5">
        <a
          href={waHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-[#25D366] text-white px-3.5 py-2 text-sm hover:opacity-90"
        >
          WhatsApp
        </a>
        <a href={`tel:${SUPPORT_PHONE}`} className="inline-flex items-center gap-2 rounded-md border border-sand text-dusk-900 px-3.5 py-2 text-sm hover:bg-sand/40">
          Call {SUPPORT_PHONE}
        </a>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-2 rounded-md border border-sand text-dusk-900 px-3.5 py-2 text-sm hover:bg-sand/40">
          Email us
        </a>
      </div>
    </div>
  );
}
