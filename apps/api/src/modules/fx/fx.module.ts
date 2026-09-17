import { Module } from '@nestjs/common';
import { FxRatesService } from './fx-rates.service';

/** See FxRatesService's own doc comment — opt-in, inert by default. Exported for TravelPolicyModule/AnalyticsModule to consume without either owning the config-reading logic itself. */
@Module({
  providers: [FxRatesService],
  exports: [FxRatesService],
})
export class FxModule {}
