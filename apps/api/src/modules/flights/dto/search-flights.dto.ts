import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CabinClass, TripType } from '@mohammad-travels/types';

const TRIP_TYPES: TripType[] = ['ONE_WAY', 'ROUND_TRIP', 'MULTI_CITY'];
const CABIN_CLASSES: CabinClass[] = ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'];

export class FlightSearchSegmentDto {
  @IsString()
  @Length(3, 3, { message: 'origin must be a 3-letter IATA code' })
  origin!: string;

  @IsString()
  @Length(3, 3, { message: 'destination must be a 3-letter IATA code' })
  destination!: string;

  @IsISO8601({ strict: true }, { message: 'departureDate must be an ISO date (YYYY-MM-DD)' })
  departureDate!: string;
}

export class SearchFlightsDto {
  @IsIn(TRIP_TYPES)
  tripType!: TripType;

  @IsIn(CABIN_CLASSES)
  cabin!: CabinClass;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => FlightSearchSegmentDto)
  segments!: FlightSearchSegmentDto[];

  @IsInt()
  @Min(1)
  @Max(9)
  adults!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  children?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  infants?: number;

  @IsString()
  @Length(3, 3, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency!: string;

  /** Traveler nationality — used only for the transit-visa advisory, never to gate the search. */
  @IsOptional()
  @IsString()
  @Length(2, 60)
  nationality?: string;
}
