import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';
import { CabinClass } from '@mohammad-travels/types';

const SCOPES = ['GLOBAL', 'SUPPLIER', 'AIRLINE', 'ROUTE', 'CABIN', 'FARE_FAMILY', 'AGENCY'] as const;
const TYPES = ['FIXED', 'PERCENTAGE'] as const;
const CABINS: CabinClass[] = ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'];

/**
 * Exactly one scope-matching field is required, chosen by `scope` —
 * validated in the service (not here) against the SAME scope semantics
 * PricingService.whereForScope already encodes, so the two can never
 * silently drift apart into "a rule the admin UI thinks it created but
 * search will never match."
 */
export class CreateMarkupRuleDto {
  @IsIn(SCOPES)
  scope!: (typeof SCOPES)[number];

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  airlineCode?: string;

  @IsOptional()
  @IsString()
  @Length(7, 7, { message: 'route must be "ORG-DST", e.g. "DAC-SIN"' })
  route?: string;

  @IsOptional()
  @IsIn(CABINS)
  cabin?: CabinClass;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  fareFamily?: string;

  @IsOptional()
  @IsUUID()
  agencyId?: string;

  @IsIn(TYPES)
  type!: (typeof TYPES)[number];

  @IsNumber()
  value!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
