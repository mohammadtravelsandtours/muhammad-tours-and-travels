import { Module } from '@nestjs/common';
import { FlightsController } from './flights.controller';
import { FlightSearchOrchestratorService } from './flight-search-orchestrator.service';
import { FlightNormalizationService } from './flight-normalization.service';
import { PricingService } from './pricing.service';
import { SuppliersModule } from '../suppliers/suppliers.module';

@Module({
  imports: [SuppliersModule],
  controllers: [FlightsController],
  providers: [FlightSearchOrchestratorService, FlightNormalizationService, PricingService],
  exports: [FlightSearchOrchestratorService, PricingService],
})
export class FlightsModule {}
