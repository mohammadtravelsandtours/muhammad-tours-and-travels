import { Controller, Get, Query } from '@nestjs/common';
import { AirportsService } from './airports.service';
import { SearchAirportsDto } from './dto/search-airports.dto';

/**
 * Unauthenticated by design, like /health — this backs the public
 * origin/destination autocomplete on the B2C search form, which has to
 * work before a visitor has an account.
 */
@Controller('airports')
export class AirportsController {
  constructor(private readonly airportsService: AirportsService) {}

  @Get('search')
  async search(@Query() query: SearchAirportsDto) {
    const results = await this.airportsService.search(query.q);
    return { results };
  }
}
