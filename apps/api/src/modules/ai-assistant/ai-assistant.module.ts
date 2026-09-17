import { Module } from '@nestjs/common';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { AirportsModule } from '../airports/airports.module';
import { FlightsModule } from '../flights/flights.module';
import { HotelsModule } from '../hotels/hotels.module';
import { BookingsModule } from '../bookings/bookings.module';
import { HajjUmrahModule } from '../hajj-umrah/hajj-umrah.module';

/**
 * Imports the modules whose exported services back the assistant's
 * read-only tools (AirportsService, FlightSearchOrchestratorService,
 * HotelsService, BookingsService, HajjUmrahService) — see
 * AiAssistantService's doc comment for why every tool call must go
 * through a real platform service.
 */
@Module({
  imports: [AirportsModule, FlightsModule, HotelsModule, BookingsModule, HajjUmrahModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService],
})
export class AiAssistantModule {}
