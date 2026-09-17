import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { CabinClass } from '@mohammad-travels/types';

const CABINS: CabinClass[] = ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'];

export class UpsertTravelPolicyDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @IsIn(CABINS)
  maxCabin!: CabinClass;

  @IsBoolean()
  blockOverMaxCabin!: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  softFareCapAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hardFareCapAmount?: number;

  @IsString()
  @Length(3, 3)
  currency!: string;
}

export class CreateCostCenterDto {
  @IsString()
  @Length(1, 40)
  code!: string;

  @IsString()
  @Length(1, 150)
  name!: string;
}

export class UpdateCostCenterDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
