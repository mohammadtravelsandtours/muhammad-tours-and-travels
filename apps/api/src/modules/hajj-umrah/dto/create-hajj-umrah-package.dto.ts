import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsISO8601, IsInt, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

const PACKAGE_TYPES = ['HAJJ', 'UMRAH'] as const;
const DEPOSIT_TYPES = ['PERCENTAGE', 'FIXED'] as const;

/** Admin-only (see Permission.HAJJ_UMRAH_MANAGE) — creates a new browsable, bookable departure. */
export class CreateHajjUmrahPackageDto {
  @IsString()
  @Length(2, 150)
  title!: string;

  @IsIn(PACKAGE_TYPES)
  type!: (typeof PACKAGE_TYPES)[number];

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string;

  @IsISO8601({ strict: true }, { message: 'departureDate must be an ISO date (YYYY-MM-DD)' })
  departureDate!: string;

  @IsISO8601({ strict: true }, { message: 'returnDate must be an ISO date (YYYY-MM-DD)' })
  returnDate!: string;

  @IsInt()
  @Min(1)
  durationNights!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;

  /** Price PER PILGRIM in `currency` — see HajjUmrahPackage.totalAmount's doc comment in schema.prisma. */
  @IsNumber()
  @Min(0)
  totalAmount!: number;

  @IsIn(DEPOSIT_TYPES)
  depositType!: (typeof DEPOSIT_TYPES)[number];

  /** A percentage (0-100) when depositType is PERCENTAGE, or a fixed per-pilgrim amount in `currency` when depositType is FIXED. */
  @IsNumber()
  @Min(0)
  depositValue!: number;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  inclusions?: string[];

  @IsOptional()
  @IsString()
  @Length(0, 150)
  makkahHotel?: string;

  @IsOptional()
  @IsString()
  @Length(0, 150)
  madinahHotel?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateHajjUmrahPackageDto {
  @IsOptional()
  @IsString()
  @Length(2, 150)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  departureDate?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  returnDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationNights?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsIn(DEPOSIT_TYPES)
  depositType?: (typeof DEPOSIT_TYPES)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  depositValue?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  inclusions?: string[];

  @IsOptional()
  @IsString()
  @Length(0, 150)
  makkahHotel?: string;

  @IsOptional()
  @IsString()
  @Length(0, 150)
  madinahHotel?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
