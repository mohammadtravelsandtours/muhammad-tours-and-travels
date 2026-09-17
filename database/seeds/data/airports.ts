/**
 * Reference airport data, weighted toward Mohammad Travels' core markets
 * (Bangladesh, South Asia, the Gulf, and Southeast Asia) plus the major
 * global hubs those markets connect through.
 *
 * Deliberately conservative: only fields I have high confidence in are
 * populated. `latitude`/`longitude` are left out entirely rather than
 * filled with approximate/remembered coordinates presented as exact —
 * the same principle the flight-offer baggage field follows (see
 * schema.prisma's `baggageNote` doc comment: never invent precise-looking
 * data). Add coordinates from a verified source (e.g. OurAirports' public
 * dataset) when they're actually needed for a map view.
 *
 * IATA codes, city/country names and IANA timezones below are standard,
 * stable reference facts, not something that changes day to day — but
 * this list has not been cross-checked against IATA's official registry,
 * so treat it as a reasonable seed for a demo/mock environment, not a
 * production source of truth. Verify before relying on it commercially.
 */
export interface AirportSeed {
  iataCode: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
}

export const AIRPORTS: AirportSeed[] = [
  // ── Bangladesh ──────────────────────────────────────────────────
  { iataCode: 'DAC', name: 'Hazrat Shahjalal International Airport', city: 'Dhaka', country: 'Bangladesh', timezone: 'Asia/Dhaka' },
  { iataCode: 'CGP', name: 'Shah Amanat International Airport', city: 'Chittagong', country: 'Bangladesh', timezone: 'Asia/Dhaka' },
  { iataCode: 'ZYL', name: 'Osmani International Airport', city: 'Sylhet', country: 'Bangladesh', timezone: 'Asia/Dhaka' },
  { iataCode: 'CXB', name: "Cox's Bazar Airport", city: "Cox's Bazar", country: 'Bangladesh', timezone: 'Asia/Dhaka' },
  { iataCode: 'JSR', name: 'Jashore Airport', city: 'Jessore', country: 'Bangladesh', timezone: 'Asia/Dhaka' },
  { iataCode: 'RJH', name: 'Shah Makhdum Airport', city: 'Rajshahi', country: 'Bangladesh', timezone: 'Asia/Dhaka' },
  { iataCode: 'BZL', name: 'Barisal Airport', city: 'Barisal', country: 'Bangladesh', timezone: 'Asia/Dhaka' },
  { iataCode: 'SPD', name: 'Saidpur Airport', city: 'Saidpur', country: 'Bangladesh', timezone: 'Asia/Dhaka' },

  // ── South Asia ──────────────────────────────────────────────────
  { iataCode: 'DEL', name: 'Indira Gandhi International Airport', city: 'Delhi', country: 'India', timezone: 'Asia/Kolkata' },
  { iataCode: 'BOM', name: 'Chhatrapati Shivaji Maharaj International Airport', city: 'Mumbai', country: 'India', timezone: 'Asia/Kolkata' },
  { iataCode: 'BLR', name: 'Kempegowda International Airport', city: 'Bengaluru', country: 'India', timezone: 'Asia/Kolkata' },
  { iataCode: 'MAA', name: 'Chennai International Airport', city: 'Chennai', country: 'India', timezone: 'Asia/Kolkata' },
  { iataCode: 'CCU', name: 'Netaji Subhas Chandra Bose International Airport', city: 'Kolkata', country: 'India', timezone: 'Asia/Kolkata' },
  { iataCode: 'HYD', name: 'Rajiv Gandhi International Airport', city: 'Hyderabad', country: 'India', timezone: 'Asia/Kolkata' },
  { iataCode: 'COK', name: 'Cochin International Airport', city: 'Kochi', country: 'India', timezone: 'Asia/Kolkata' },
  { iataCode: 'AMD', name: 'Sardar Vallabhbhai Patel International Airport', city: 'Ahmedabad', country: 'India', timezone: 'Asia/Kolkata' },
  { iataCode: 'KHI', name: 'Jinnah International Airport', city: 'Karachi', country: 'Pakistan', timezone: 'Asia/Karachi' },
  { iataCode: 'LHE', name: 'Allama Iqbal International Airport', city: 'Lahore', country: 'Pakistan', timezone: 'Asia/Karachi' },
  { iataCode: 'ISB', name: 'Islamabad International Airport', city: 'Islamabad', country: 'Pakistan', timezone: 'Asia/Karachi' },
  { iataCode: 'CMB', name: 'Bandaranaike International Airport', city: 'Colombo', country: 'Sri Lanka', timezone: 'Asia/Colombo' },
  { iataCode: 'KTM', name: 'Tribhuvan International Airport', city: 'Kathmandu', country: 'Nepal', timezone: 'Asia/Kathmandu' },

  // ── Gulf / Middle East ──────────────────────────────────────────
  { iataCode: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'United Arab Emirates', timezone: 'Asia/Dubai' },
  { iataCode: 'AUH', name: 'Zayed International Airport', city: 'Abu Dhabi', country: 'United Arab Emirates', timezone: 'Asia/Dubai' },
  { iataCode: 'SHJ', name: 'Sharjah International Airport', city: 'Sharjah', country: 'United Arab Emirates', timezone: 'Asia/Dubai' },
  { iataCode: 'DOH', name: 'Hamad International Airport', city: 'Doha', country: 'Qatar', timezone: 'Asia/Qatar' },
  { iataCode: 'JED', name: 'King Abdulaziz International Airport', city: 'Jeddah', country: 'Saudi Arabia', timezone: 'Asia/Riyadh' },
  { iataCode: 'RUH', name: 'King Khalid International Airport', city: 'Riyadh', country: 'Saudi Arabia', timezone: 'Asia/Riyadh' },
  { iataCode: 'DMM', name: 'King Fahd International Airport', city: 'Dammam', country: 'Saudi Arabia', timezone: 'Asia/Riyadh' },
  { iataCode: 'MED', name: 'Prince Mohammad Bin Abdulaziz International Airport', city: 'Medina', country: 'Saudi Arabia', timezone: 'Asia/Riyadh' },
  { iataCode: 'KWI', name: 'Kuwait International Airport', city: 'Kuwait City', country: 'Kuwait', timezone: 'Asia/Kuwait' },
  { iataCode: 'MCT', name: 'Muscat International Airport', city: 'Muscat', country: 'Oman', timezone: 'Asia/Muscat' },
  { iataCode: 'BAH', name: 'Bahrain International Airport', city: 'Manama', country: 'Bahrain', timezone: 'Asia/Bahrain' },
  { iataCode: 'AMM', name: 'Queen Alia International Airport', city: 'Amman', country: 'Jordan', timezone: 'Asia/Amman' },

  // ── Southeast Asia ──────────────────────────────────────────────
  { iataCode: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', country: 'Singapore', timezone: 'Asia/Singapore' },
  { iataCode: 'KUL', name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', country: 'Malaysia', timezone: 'Asia/Kuala_Lumpur' },
  { iataCode: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'Thailand', timezone: 'Asia/Bangkok' },
  { iataCode: 'DMK', name: 'Don Mueang International Airport', city: 'Bangkok', country: 'Thailand', timezone: 'Asia/Bangkok' },
  { iataCode: 'CGK', name: 'Soekarno-Hatta International Airport', city: 'Jakarta', country: 'Indonesia', timezone: 'Asia/Jakarta' },
  { iataCode: 'DPS', name: 'Ngurah Rai International Airport', city: 'Denpasar (Bali)', country: 'Indonesia', timezone: 'Asia/Makassar' },
  { iataCode: 'MNL', name: 'Ninoy Aquino International Airport', city: 'Manila', country: 'Philippines', timezone: 'Asia/Manila' },
  { iataCode: 'SGN', name: 'Tan Son Nhat International Airport', city: 'Ho Chi Minh City', country: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh' },
  { iataCode: 'HAN', name: 'Noi Bai International Airport', city: 'Hanoi', country: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh' },
  { iataCode: 'RGN', name: 'Yangon International Airport', city: 'Yangon', country: 'Myanmar', timezone: 'Asia/Yangon' },

  // ── East Asia ───────────────────────────────────────────────────
  { iataCode: 'HKG', name: 'Hong Kong International Airport', city: 'Hong Kong', country: 'Hong Kong', timezone: 'Asia/Hong_Kong' },
  { iataCode: 'NRT', name: 'Narita International Airport', city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo' },
  { iataCode: 'HND', name: 'Haneda Airport', city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo' },
  { iataCode: 'ICN', name: 'Incheon International Airport', city: 'Seoul', country: 'South Korea', timezone: 'Asia/Seoul' },
  { iataCode: 'PVG', name: 'Shanghai Pudong International Airport', city: 'Shanghai', country: 'China', timezone: 'Asia/Shanghai' },
  { iataCode: 'PEK', name: 'Beijing Capital International Airport', city: 'Beijing', country: 'China', timezone: 'Asia/Shanghai' },
  { iataCode: 'CAN', name: 'Guangzhou Baiyun International Airport', city: 'Guangzhou', country: 'China', timezone: 'Asia/Shanghai' },

  // ── Europe ──────────────────────────────────────────────────────
  { iataCode: 'LHR', name: 'Heathrow Airport', city: 'London', country: 'United Kingdom', timezone: 'Europe/London' },
  { iataCode: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'France', timezone: 'Europe/Paris' },
  { iataCode: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany', timezone: 'Europe/Berlin' },
  { iataCode: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Turkey', timezone: 'Europe/Istanbul' },
  { iataCode: 'AMS', name: 'Amsterdam Airport Schiphol', city: 'Amsterdam', country: 'Netherlands', timezone: 'Europe/Amsterdam' },

  // ── North America ───────────────────────────────────────────────
  { iataCode: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'United States', timezone: 'America/New_York' },
  { iataCode: 'YYZ', name: 'Toronto Pearson International Airport', city: 'Toronto', country: 'Canada', timezone: 'America/Toronto' },

  // ── Oceania ─────────────────────────────────────────────────────
  { iataCode: 'SYD', name: 'Sydney Kingsford Smith Airport', city: 'Sydney', country: 'Australia', timezone: 'Australia/Sydney' },
  { iataCode: 'MEL', name: 'Melbourne Airport', city: 'Melbourne', country: 'Australia', timezone: 'Australia/Melbourne' },

  // ── Africa ──────────────────────────────────────────────────────
  { iataCode: 'CAI', name: 'Cairo International Airport', city: 'Cairo', country: 'Egypt', timezone: 'Africa/Cairo' },
  { iataCode: 'ADD', name: 'Addis Ababa Bole International Airport', city: 'Addis Ababa', country: 'Ethiopia', timezone: 'Africa/Addis_Ababa' },
  { iataCode: 'NBO', name: 'Jomo Kenyatta International Airport', city: 'Nairobi', country: 'Kenya', timezone: 'Africa/Nairobi' },
];
