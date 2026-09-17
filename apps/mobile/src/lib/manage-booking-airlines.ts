// Identical dataset to apps/web/src/lib/manage-booking-airlines.ts — see
// that file's header comment for how/why these URLs were chosen and the
// deliberate omissions. Duplicated rather than shared for the same reason
// as flight-types.ts/format.ts (apps/web isn't a shared package).
export interface ManageBookingAirline {
  iataCode: string;
  name: string;
  manageBookingUrl: string;
}

export const MANAGE_BOOKING_AIRLINES: ManageBookingAirline[] = [
  { iataCode: 'BG', name: 'Biman Bangladesh Airlines', manageBookingUrl: 'https://www.biman-airlines.com/manage-booking' },
  { iataCode: 'BS', name: 'US-Bangla Airlines', manageBookingUrl: 'https://usbair.com/manage-your-booking' },
  { iataCode: 'EK', name: 'Emirates', manageBookingUrl: 'https://www.emirates.com/us/english/manage-booking/' },
  { iataCode: 'QR', name: 'Qatar Airways', manageBookingUrl: 'https://www.qatarairways.com/en/manage-booking.html' },
  { iataCode: 'EY', name: 'Etihad Airways', manageBookingUrl: 'https://www.etihad.com/en-us/manage' },
  { iataCode: 'SV', name: 'Saudia', manageBookingUrl: 'https://www.saudia.com/book-and-manage/manage/manage-booking' },
  { iataCode: 'KU', name: 'Kuwait Airways', manageBookingUrl: 'https://www.kuwaitairways.com/en/manage-booking' },
  { iataCode: 'WY', name: 'Oman Air', manageBookingUrl: 'https://www.omanair.com/en/manage-bookings' },
  { iataCode: 'GF', name: 'Gulf Air', manageBookingUrl: 'https://www.gulfair.com/flying-with-us/before-you-travel/manage' },
  { iataCode: 'FZ', name: 'flydubai', manageBookingUrl: 'https://www.flydubai.com/en/book-and-manage/view-or-change-booking' },
  { iataCode: 'G9', name: 'Air Arabia', manageBookingUrl: 'https://www.airarabia.com/en/manage-booking' },
  { iataCode: 'J9', name: 'Jazeera Airways', manageBookingUrl: 'https://www.jazeeraairways.com/en/mmb' },
  { iataCode: 'TK', name: 'Turkish Airlines', manageBookingUrl: 'https://www.turkishairlines.com/en-us/flights/manage-booking/index.html' },
  { iataCode: 'MS', name: 'EgyptAir', manageBookingUrl: 'https://www.egyptair.com/en/book/Pages/my-reservations.aspx' },
  { iataCode: 'AI', name: 'Air India', manageBookingUrl: 'https://www.airindia.com/in/en/manage/booking.html' },
  { iataCode: '6E', name: 'IndiGo', manageBookingUrl: 'https://www.goindigo.in/edit-booking.html' },
  { iataCode: 'UL', name: 'SriLankan Airlines', manageBookingUrl: 'https://www.srilankan.com/en_uk/plan-and-book/manage-your-booking' },
  { iataCode: 'RA', name: 'Nepal Airlines', manageBookingUrl: 'https://book.nepalairlines.com.np/ebooking/Booking/Retrieve-Booking.aspx' },
  { iataCode: 'SQ', name: 'Singapore Airlines', manageBookingUrl: 'https://www.singaporeair.com/en_UK/in/plan-travel/your-booking/managebooking/' },
  { iataCode: 'MH', name: 'Malaysia Airlines', manageBookingUrl: 'https://www.malaysiaairlines.com/us/en/plan-trip/booking-and-services.html' },
  { iataCode: 'TG', name: 'Thai Airways', manageBookingUrl: 'https://www.thaiairways.com/managebooking/change-flight/select-booking' },
  { iataCode: 'GA', name: 'Garuda Indonesia', manageBookingUrl: 'https://garuda-indonesia.com/static/en/garuda-indonesia-experience/on-ground/automatic-ticket-changer/index.html' },
  { iataCode: 'PR', name: 'Philippine Airlines', manageBookingUrl: 'https://www.philippineairlines.com/us/en/manage-booking.html' },
  { iataCode: 'VN', name: 'Vietnam Airlines', manageBookingUrl: 'https://www.vietnamairlines.com/us/en/buy-tickets-other-products/booking-and-manage-bookings/reservation-management' },
  { iataCode: 'CX', name: 'Cathay Pacific', manageBookingUrl: 'https://www.cathaypacific.com/mb/' },
  { iataCode: 'NH', name: 'All Nippon Airways (ANA)', manageBookingUrl: 'https://www.ana.co.jp/en/us/plan-book/how-to-manage-your-booking/' },
  { iataCode: 'JL', name: 'Japan Airlines', manageBookingUrl: 'https://www.jal.co.jp/en-jp/my-booking.html' },
  { iataCode: 'KE', name: 'Korean Air', manageBookingUrl: 'https://www.koreanair.com/reservation/search' },
  { iataCode: 'CZ', name: 'China Southern Airlines', manageBookingUrl: 'https://oversea.csair.com/tka/us/en/my/order/find' },
  { iataCode: 'MU', name: 'China Eastern Airlines', manageBookingUrl: 'https://us.ceair.com/en/manage-booking.html' },
  { iataCode: 'BA', name: 'British Airways', manageBookingUrl: 'https://www.britishairways.com/travel/managebooking/public/en_gb' },
  { iataCode: 'LH', name: 'Lufthansa', manageBookingUrl: 'https://www.lufthansa.com/us/en/book-and-manage/booking-services/manage-my-bookings' },
  { iataCode: 'AF', name: 'Air France', manageBookingUrl: 'https://wwws.airfrance.us/trip' },
  { iataCode: 'KL', name: 'KLM Royal Dutch Airlines', manageBookingUrl: 'https://www.klm.com/information/manage-booking' },
  { iataCode: 'ET', name: 'Ethiopian Airlines', manageBookingUrl: 'https://www.ethiopianairlines.com/us/book/manage/manage-booking' },
  { iataCode: 'KQ', name: 'Kenya Airways', manageBookingUrl: 'https://www.kenya-airways.com/en/book-manage/manage-booking/' },
].sort((a, b) => a.name.localeCompare(b.name));
