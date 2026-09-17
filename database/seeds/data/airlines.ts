/**
 * Reference airline data — IATA 2-letter codes for carriers relevant to
 * Mohammad Travels' markets. Only carriers whose code I'm confident about
 * are included; several Bangladesh-based regional carriers (e.g. NovoAir,
 * Air Astra) are deliberately omitted rather than guessed at — add them
 * once their codes are confirmed against IATA's official registry. Same
 * caveat as airports.ts: treat this as a reasonable demo/mock seed, not
 * a verified production source of truth.
 */
export interface AirlineSeed {
  iataCode: string;
  name: string;
}

export const AIRLINES: AirlineSeed[] = [
  // Bangladesh
  { iataCode: 'BG', name: 'Biman Bangladesh Airlines' },
  { iataCode: 'BS', name: 'US-Bangla Airlines' },

  // Gulf / Middle East
  { iataCode: 'EK', name: 'Emirates' },
  { iataCode: 'QR', name: 'Qatar Airways' },
  { iataCode: 'EY', name: 'Etihad Airways' },
  { iataCode: 'SV', name: 'Saudia' },
  { iataCode: 'KU', name: 'Kuwait Airways' },
  { iataCode: 'WY', name: 'Oman Air' },
  { iataCode: 'GF', name: 'Gulf Air' },
  { iataCode: 'FZ', name: 'flydubai' },
  { iataCode: 'G9', name: 'Air Arabia' },
  { iataCode: 'J9', name: 'Jazeera Airways' },
  { iataCode: 'TK', name: 'Turkish Airlines' },
  { iataCode: 'MS', name: 'EgyptAir' },

  // South Asia
  { iataCode: 'AI', name: 'Air India' },
  { iataCode: '6E', name: 'IndiGo' },
  { iataCode: 'UK', name: 'Vistara' },
  { iataCode: 'UL', name: 'SriLankan Airlines' },
  { iataCode: 'RA', name: 'Nepal Airlines' },

  // Southeast Asia
  { iataCode: 'SQ', name: 'Singapore Airlines' },
  { iataCode: 'MH', name: 'Malaysia Airlines' },
  { iataCode: 'AK', name: 'AirAsia' },
  { iataCode: 'TG', name: 'Thai Airways' },
  { iataCode: 'GA', name: 'Garuda Indonesia' },
  { iataCode: 'PR', name: 'Philippine Airlines' },
  { iataCode: 'VN', name: 'Vietnam Airlines' },
  { iataCode: '3K', name: 'Jetstar Asia' },

  // East Asia
  { iataCode: 'CX', name: 'Cathay Pacific' },
  { iataCode: 'NH', name: 'All Nippon Airways' },
  { iataCode: 'JL', name: 'Japan Airlines' },
  { iataCode: 'KE', name: 'Korean Air' },
  { iataCode: 'CZ', name: 'China Southern Airlines' },
  { iataCode: 'MU', name: 'China Eastern Airlines' },

  // Europe / Global
  { iataCode: 'BA', name: 'British Airways' },
  { iataCode: 'LH', name: 'Lufthansa' },
  { iataCode: 'AF', name: 'Air France' },
  { iataCode: 'KL', name: 'KLM Royal Dutch Airlines' },

  // Africa
  { iataCode: 'ET', name: 'Ethiopian Airlines' },
  { iataCode: 'KQ', name: 'Kenya Airways' },
];
