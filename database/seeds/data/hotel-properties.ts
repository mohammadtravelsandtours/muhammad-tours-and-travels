/**
 * Reference hotel property data — a small, honestly-scoped seed (unlike
 * airports.ts/airlines.ts this is entirely illustrative content for the
 * mock hotel adapters, not a claim about real properties) so hotel
 * search has something real to return in demo/mock mode. City names
 * match the seeded airport cities so a flight+hotel package search
 * has overlapping options.
 */
export interface HotelPropertySeed {
  name: string;
  city: string;
  country: string;
  starRating: number;
}

export const HOTEL_PROPERTIES: HotelPropertySeed[] = [
  { name: 'Dhaka Regency Hotel & Resort', city: 'Dhaka', country: 'Bangladesh', starRating: 5 },
  { name: 'Pan Pacific Sonargaon Dhaka', city: 'Dhaka', country: 'Bangladesh', starRating: 5 },
  { name: 'Green Delta Inn', city: 'Dhaka', country: 'Bangladesh', starRating: 3 },
  { name: "Cox's Bazar Seaside Resort", city: "Cox's Bazar", country: 'Bangladesh', starRating: 4 },
  { name: 'Jumeirah Beach Hotel', city: 'Dubai', country: 'United Arab Emirates', starRating: 5 },
  { name: 'Dubai Marina Suites', city: 'Dubai', country: 'United Arab Emirates', starRating: 4 },
  { name: 'Al Barsha Budget Inn', city: 'Dubai', country: 'United Arab Emirates', starRating: 3 },
  { name: 'Makkah Clock Royal Tower', city: 'Mecca', country: 'Saudi Arabia', starRating: 5 },
  { name: 'Jeddah Corniche Hotel', city: 'Jeddah', country: 'Saudi Arabia', starRating: 4 },
  { name: 'Doha West Bay Tower', city: 'Doha', country: 'Qatar', starRating: 5 },
  { name: 'Marina Bay Sands', city: 'Singapore', country: 'Singapore', starRating: 5 },
  { name: 'Orchard Road Boutique Hotel', city: 'Singapore', country: 'Singapore', starRating: 4 },
  { name: 'Bukit Bintang Suites', city: 'Kuala Lumpur', country: 'Malaysia', starRating: 4 },
  { name: 'Sukhumvit Riverside Hotel', city: 'Bangkok', country: 'Thailand', starRating: 4 },
  { name: 'Thamel Heritage Lodge', city: 'Kathmandu', country: 'Nepal', starRating: 3 },
];
