import { ArrayMaxSize, IsArray, IsBoolean, IsISO8601, IsInt, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

/** Admin-only (see Permission.MANPOWER_MANAGE) — creates a new browsable job/manpower request. */
export class CreateManpowerJobDto {
  @IsString()
  @Length(2, 150)
  title!: string;

  @IsString()
  @Length(2, 60)
  country!: string;

  @IsOptional()
  @IsString()
  @Length(0, 150)
  employer?: string;

  /** Free text, not an enum — e.g. Construction, Domestic, Driver, Nursing — the real category list varies by demand letter, same rationale as VisaApplication.visaType. */
  @IsOptional()
  @IsString()
  @Length(0, 60)
  category?: string;

  @IsInt()
  @Min(1)
  positionsAvailable!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryMax?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  contractDurationMonths?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  requirements?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  benefits?: string[];

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'applicationDeadline must be an ISO date (YYYY-MM-DD)' })
  applicationDeadline?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateManpowerJobDto {
  @IsOptional()
  @IsString()
  @Length(2, 150)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(2, 60)
  country?: string;

  @IsOptional()
  @IsString()
  @Length(0, 150)
  employer?: string;

  @IsOptional()
  @IsString()
  @Length(0, 60)
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  positionsAvailable?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryMax?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  contractDurationMonths?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  requirements?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  benefits?: string[];

  @IsOptional()
  @IsISO8601({ strict: true })
  applicationDeadline?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
