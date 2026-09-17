import { IsEmail, IsISO8601, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

const PHONE_RE = /^\+?[0-9]{7,15}$/;

export class ApplyManpowerJobDto {
  @IsString()
  @Length(1, 150)
  applicantFullName!: string;

  @IsOptional()
  @IsString()
  @Length(4, 20)
  applicantPassportNumber?: string;

  @IsString()
  @Length(2, 60)
  applicantNationality!: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'dateOfBirth must be an ISO date (YYYY-MM-DD)' })
  dateOfBirth?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  yearsOfExperience?: number;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  currentOccupation?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  coverNote?: string;

  @IsEmail()
  contactEmail!: string;

  @Matches(PHONE_RE, { message: 'contactPhone must be a valid phone number, e.g. +8801XXXXXXXXX' })
  contactPhone!: string;
}
