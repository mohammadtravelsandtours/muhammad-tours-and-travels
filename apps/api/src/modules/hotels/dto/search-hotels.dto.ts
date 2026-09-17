import { IsInt, IsISO8601, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class SearchHotelsDto {
  @IsString()
  @Length(2, 100)
  city!: string;

  @IsISO8601({ strict: true }, { message: 'checkInDate must be an ISO date (YYYY-MM-DD)' })
  checkInDate!: string;

  @IsISO8601({ strict: true }, { message: 'checkOutDate must be an ISO date (YYYY-MM-DD)' })
  checkOutDate!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  adults!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  children?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9)
  rooms?: number;

  @IsString()
  @Length(3, 3, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency!: string;
}
