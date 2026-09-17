import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AuthenticatedUser, FlightSearchRequest, SearchChannel } from '@mohammad-travels/types';
import { ChatDto } from './dto/chat.dto';
import { AirportsService } from '../airports/airports.service';
import { FlightSearchOrchestratorService } from '../flights/flight-search-orchestrator.service';
import { HotelsService } from '../hotels/hotels.service';
import { BookingsService } from '../bookings/bookings.service';
import { HajjUmrahService } from '../hajj-umrah/hajj-umrah.service';

// Verified against docs.claude.com's models overview at the time this
// was written (Sep 2026) — re-check that page before deploying if this
// has aged, since model IDs are occasionally retired.
const DEFAULT_MODEL = 'claude-sonnet-5';
const DEFAULT_MAX_TOKENS = 800;
const DEFAULT_MAX_TOOL_ITERATIONS = 4; // a hard ceiling on the agentic loop below — never lets one chat turn spin forever on repeated tool calls

// Real company details (see site-footer.tsx/site-header.tsx — reproduced
// from the company's own visiting card), reused here as the ONE source
// of truth so the assistant never invents contact/company facts. If
// these ever change, update them here AND in the two frontend
// components above — there's no shared config file for this yet.
const COMPANY_INFO = `Company facts you may state directly (never invent anything beyond this list):
- Name: Muhammad Tours and Travels. Director: MD Mahadi Hasan.
- Head Office: Canyon Tower, 7th Floor, Plot 24 & 26, Sonargaon Janapath Road, Sector 12, Uttara Model Town, Dhaka 1230.
- Branch Office: Khatiar Bazar, Mirzapur, Tangail.
- Phone / WhatsApp: +880 1713-420363. Singapore: +65 9344 7481. Email: mohammadtravelsandtours@gmail.com. Website: muhammadtravels.com.
- Services: flight booking, hotel booking, visa applications, general travel packages, and Hajj/Umrah packages.
- Payment: bookings can be paid in full, or (Hajj/Umrah only) with a deposit now and the remaining balance in later installments.`;

function buildSystemPrompt(authenticated: boolean): string {
  return `You are the Muhammad Tours and Travels help assistant, embedded in Muhammad Tours and Travels' booking website.
You help travelers find flights, hotels, and Hajj/Umrah packages, check their own booking status, understand fares/baggage/deposit rules, answer general questions about Muhammad Tours and Travels itself, and point people to a human when needed.

${COMPANY_INFO}

Hard rules:
- You have tools for live data: find_airport, search_flights, search_hotels, search_hajj_umrah_packages, get_hajj_umrah_package_details${authenticated ? ', get_my_flight_booking_status' : ''}. For ANY question about a specific price, flight, hotel rate, Hajj/Umrah package, availability, deposit amount, or booking status, you MUST call the relevant tool and answer only from its result — never state a specific price, flight number, room rate, package detail, or booking status from memory or a guess.
- If a tool returns no results (e.g. an unseeded city, an unknown airport, no upcoming packages of the requested type, a booking reference that doesn't match), say plainly that you couldn't find that — never fill the gap with a plausible-sounding invented answer.
- You cannot create, change, or cancel a booking or package reservation yourself — direct the traveler to the Search, Hajj & Umrah, Booking, or My Bookings pages for that, even after finding something with a search tool.
${authenticated ? '' : '- get_my_flight_booking_status is unavailable to a signed-out visitor — tell them to sign in and check My Bookings, or provide their booking reference and contact email for support to look up manually.\n'}- For visa/transit-visa questions, give general, clearly-caveated guidance and say you are not a substitute for checking with the relevant embassy/airline — never state a visa requirement as guaranteed fact.
- When a traveler wants to talk to a person, or asks something you can't answer, give them the phone/WhatsApp number and email from the company facts above rather than guessing or refusing outright.
- Keep replies short (a few sentences, or a brief list) and friendly.`;
}

const FLIGHT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'find_airport',
    description: 'Look up real airports by city, airport name, country, or IATA code. Use this to resolve a place name to a real 3-letter IATA code before calling search_flights — never guess a code yourself.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'City, airport name, country, or IATA code, e.g. "Dhaka" or "DAC" or "London"' } },
      required: ['query'],
    },
  },
  {
    name: 'search_flights',
    description: 'Search real (mock-supplier) flight fares between two airports on a given date. origin/destination MUST be real 3-letter IATA codes — resolve them with find_airport first if you only have a city name.',
    input_schema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: '3-letter IATA code, e.g. DAC' },
        destination: { type: 'string', description: '3-letter IATA code, e.g. DXB' },
        departureDate: { type: 'string', description: 'YYYY-MM-DD' },
        returnDate: { type: 'string', description: 'YYYY-MM-DD, omit for a one-way search' },
        cabin: { type: 'string', enum: ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'] },
        adults: { type: 'integer', minimum: 1, maximum: 9 },
      },
      required: ['origin', 'destination', 'departureDate'],
    },
  },
  {
    name: 'search_hotels',
    description: 'Search real (mock-supplier) hotel rates for a city. Only returns rates for hotels actually in this platform\'s database — an unfamiliar or unseeded city legitimately returns zero results, which you should report honestly rather than inventing a property.',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string' },
        checkInDate: { type: 'string', description: 'YYYY-MM-DD' },
        checkOutDate: { type: 'string', description: 'YYYY-MM-DD' },
        adults: { type: 'integer', minimum: 1, maximum: 20 },
      },
      required: ['city', 'checkInDate', 'checkOutDate'],
    },
  },
];

const HAJJ_UMRAH_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_hajj_umrah_packages',
    description: 'List real, currently-bookable upcoming Hajj/Umrah departures from this platform\'s catalog, optionally filtered by type. Only returns active packages with a future departure date and at least one open seat check via get_hajj_umrah_package_details — an unfamiliar request (e.g. a specific date with no matching departure) legitimately returns zero results.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['HAJJ', 'UMRAH'], description: 'Omit to list both Hajj and Umrah packages.' },
      },
    },
  },
  {
    name: 'get_hajj_umrah_package_details',
    description: 'Get full details (price per pilgrim, deposit rule, dates, capacity, seats remaining, inclusions, hotels) for one Hajj/Umrah package by its id — call search_hajj_umrah_packages first to find the id.',
    input_schema: {
      type: 'object',
      properties: { packageId: { type: 'string', description: 'The package id returned by search_hajj_umrah_packages' } },
      required: ['packageId'],
    },
  },
];

const BOOKING_STATUS_TOOL: Anthropic.Tool = {
  name: 'get_my_flight_booking_status',
  description: "Look up the status of the signed-in traveler's OWN flight booking by its reference code. Never returns another traveler's booking.",
  input_schema: {
    type: 'object',
    properties: { bookingReference: { type: 'string', description: 'e.g. MT7K2P9Q' } },
    required: ['bookingReference'],
  },
};

export interface ChatResult {
  configured: boolean;
  reply: string;
}

/**
 * REQUIRES A REAL ANTHROPIC_API_KEY to actually answer anything — this
 * sandbox has no network access to verify a live call, so the tool-use
 * loop below has been reviewed for correctness but NOT executed against
 * the real API. With no key configured, `configured: false` is returned
 * instead of an error.
 *
 * Tool-using by design (Phase 8: "AI assistant (tool-using, no invented
 * prices/PNR/visa data)") — every live-data claim goes through a real
 * call into the same orchestrators/services the website itself uses
 * (FlightSearchOrchestratorService, HotelsService, BookingsService),
 * never a value the model produces on its own. The assistant still
 * cannot create, change, or cancel anything — every tool here is
 * read-only, so it can't take an action on a traveler's behalf even if
 * asked to.
 */
@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);
  private client: Anthropic | null = null;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly maxToolIterations: number;

  constructor(
    private readonly config: ConfigService,
    private readonly airports: AirportsService,
    private readonly flightSearch: FlightSearchOrchestratorService,
    private readonly hotels: HotelsService,
    private readonly bookings: BookingsService,
    private readonly hajjUmrah: HajjUmrahService,
  ) {
    const apiKey = this.config.get<string>('integrations.anthropicApiKey');
    this.model = this.config.get<string>('integrations.anthropicModel') || DEFAULT_MODEL;
    this.maxTokens = this.config.get<number>('integrations.aiMaxTokens') || DEFAULT_MAX_TOKENS;
    this.maxToolIterations = this.config.get<number>('integrations.aiMaxToolIterations') || DEFAULT_MAX_TOOL_ITERATIONS;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async chat(dto: ChatDto, user?: AuthenticatedUser): Promise<ChatResult> {
    if (!this.client) {
      return {
        configured: false,
        reply: "AI help isn't set up on this server yet. Try the Search or My Bookings pages, or contact support directly.",
      };
    }

    const tools = user ? [...FLIGHT_TOOLS, ...HAJJ_UMRAH_TOOLS, BOOKING_STATUS_TOOL] : [...FLIGHT_TOOLS, ...HAJJ_UMRAH_TOOLS];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let messages: any[] = [...(dto.history ?? []).map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: dto.message }];

    try {
      for (let iteration = 0; iteration < this.maxToolIterations; iteration++) {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          system: buildSystemPrompt(!!user),
          tools,
          messages,
        });

        if (response.stop_reason !== 'tool_use') {
          const reply = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map((block) => block.text)
            .join('\n')
            .trim();
          return { configured: true, reply: reply || "Sorry, I didn't catch that — could you rephrase?" };
        }

        messages = [...messages, { role: 'assistant', content: response.content }];
        const toolResults = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;
          const result = await this.executeTool(block.name, block.input as Record<string, unknown>, user);
          toolResults.push({ type: 'tool_result' as const, tool_use_id: block.id, content: JSON.stringify(result) });
        }
        messages = [...messages, { role: 'user', content: toolResults }];
      }

      this.logger.warn('AI assistant hit MAX_TOOL_ITERATIONS without a final text reply');
      return { configured: true, reply: "I wasn't able to finish looking that up — please check the Search or My Bookings pages directly." };
    } catch (err) {
      this.logger.error(`Anthropic API call failed: ${(err as Error).message}`);
      return { configured: true, reply: "I'm having trouble answering right now — please try again in a moment." };
    }
  }

  private async executeTool(name: string, input: Record<string, unknown>, user?: AuthenticatedUser): Promise<unknown> {
    try {
      switch (name) {
        case 'find_airport':
          return { results: await this.airports.search(String(input.query ?? '')) };

        case 'search_flights':
          return this.runFlightSearch(input);

        case 'search_hotels':
          return this.runHotelSearch(input);

        case 'search_hajj_umrah_packages':
          return this.runHajjUmrahSearch(input);

        case 'get_hajj_umrah_package_details':
          return this.getHajjUmrahPackageDetails(String(input.packageId ?? ''));

        case 'get_my_flight_booking_status':
          if (!user) return { error: 'Not signed in — this tool is unavailable to a signed-out visitor.' };
          return this.getBookingStatus(user, String(input.bookingReference ?? ''));

        default:
          return { error: `Unknown tool ${name}` };
      }
    } catch (err) {
      // A tool failure becomes a tool RESULT the model can react to
      // honestly ("I couldn't verify that fare") — never an unhandled
      // rejection that would abort the whole chat turn.
      this.logger.warn(`Tool ${name} failed: ${(err as Error).message}`);
      return { error: (err as Error).message || 'This lookup failed — please try the website directly.' };
    }
  }

  private async runFlightSearch(input: Record<string, unknown>) {
    const origin = String(input.origin ?? '').toUpperCase();
    const destination = String(input.destination ?? '').toUpperCase();
    const departureDate = String(input.departureDate ?? '');
    const returnDate = input.returnDate ? String(input.returnDate) : undefined;
    const cabin = (input.cabin as FlightSearchRequest['cabin']) ?? 'ECONOMY';
    const adults = typeof input.adults === 'number' ? input.adults : 1;

    const request: FlightSearchRequest = {
      tripType: returnDate ? 'ROUND_TRIP' : 'ONE_WAY',
      cabin,
      segments: returnDate
        ? [
            { origin, destination, departureDate },
            { origin: destination, destination: origin, departureDate: returnDate },
          ]
        : [{ origin, destination, departureDate }],
      adults,
      currency: 'USD',
    };

    const result = await this.flightSearch.search({ request, channel: 'B2C' as SearchChannel });
    const top = result.offers.slice(0, 5).map((o) => ({
      validatingCarrier: o.validatingCarrier,
      cabin: o.cabin,
      stops: o.stops,
      totalDurationMinutes: o.totalDurationMinutes,
      totalFare: Number(o.totalFare),
      currency: o.currency,
      refundable: o.refundable,
    }));
    return { searchId: result.searchId, offerCount: result.offers.length, topOffers: top };
  }

  private async runHotelSearch(input: Record<string, unknown>) {
    const city = String(input.city ?? '');
    const checkInDate = String(input.checkInDate ?? '');
    const checkOutDate = String(input.checkOutDate ?? '');
    const adults = typeof input.adults === 'number' ? input.adults : 1;

    const result = await this.hotels.search({ city, checkInDate, checkOutDate, adults, currency: 'USD', channel: 'B2C' as SearchChannel });
    const top = result.offers.slice(0, 5).map((o) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      propertyName: (o as any).property?.name,
      roomType: o.roomType,
      board: o.board,
      nights: o.nights,
      totalFare: Number(o.totalFare),
      currency: o.currency,
      refundable: o.refundable,
    }));
    return { searchId: result.searchId, offerCount: result.offers.length, topOffers: top };
  }

  private async runHajjUmrahSearch(input: Record<string, unknown>) {
    const type = input.type === 'HAJJ' || input.type === 'UMRAH' ? input.type : undefined;
    const packages = await this.hajjUmrah.listPackages({ type });
    return {
      packageCount: packages.length,
      packages: packages.slice(0, 10).map((p) => ({
        id: p.id,
        title: p.title,
        type: p.type,
        departureDate: p.departureDate,
        returnDate: p.returnDate,
        durationNights: p.durationNights,
        pricePerPilgrim: Number(p.totalAmount),
        currency: p.currency,
        seatsRemaining: p.capacity - p.seatsBooked,
      })),
    };
  }

  private async getHajjUmrahPackageDetails(packageId: string) {
    if (!packageId.trim()) return { error: 'No package id given — call search_hajj_umrah_packages first.' };
    try {
      const p = await this.hajjUmrah.getPackage(packageId);
      return {
        id: p.id,
        title: p.title,
        type: p.type,
        description: p.description,
        departureDate: p.departureDate,
        returnDate: p.returnDate,
        durationNights: p.durationNights,
        pricePerPilgrim: Number(p.totalAmount),
        currency: p.currency,
        depositType: p.depositType,
        depositValue: Number(p.depositValue),
        seatsRemaining: p.capacity - p.seatsBooked,
        inclusions: p.inclusions ?? [],
        makkahHotel: p.makkahHotel,
        madinahHotel: p.madinahHotel,
      };
    } catch {
      return { found: false, message: 'No package with that id was found.' };
    }
  }

  private async getBookingStatus(user: AuthenticatedUser, bookingReference: string) {
    if (!bookingReference.trim()) return { error: 'No booking reference given.' };
    const booking = await this.bookings.findMyBookingByReference(user, bookingReference);
    if (!booking) return { found: false, message: 'No booking with that reference was found on this account.' };
    return {
      found: true,
      bookingReference: booking.bookingReference,
      status: booking.status,
      totalAmount: Number(booking.totalAmount),
      currency: booking.currency,
      route: booking.offer?.segments?.length ? `${booking.offer.segments[0].origin}-${booking.offer.segments[booking.offer.segments.length - 1].destination}` : undefined,
    };
  }
}
