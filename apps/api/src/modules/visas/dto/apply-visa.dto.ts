import { IsEmail, IsISO8601, IsOptional, IsString, Length, Matches } from 'class-validator';

const PHONE_RE = /^\+?[0-9]{7,15}$/;

export class ApplyVisaDto {
  @IsString()
  @Length(2, 60)
  destinationCountry!: string;

  /** Free text, not an enum — e.g. TOURIST, BUSINESS, UMRAH, WORK — the real list is destination-specific (see VisaApplication's schema.prisma doc comment). */
  @IsString()
  @Length(2, 40)
  visaType!: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'travelDate must be an ISO date (YYYY-MM-DD)' })
  travelDate?: string;

  @IsString()
  @Length(1, 150)
  applicantFullName!: string;

  @IsString()
  @Length(4, 20)
  applicantPassportNumber!: string;

  @IsString()
  @Length(2, 60)
  applicantNationality!: string;

  @IsEmail()
  contactEmail!: string;

  @Matches(PHONE_RE, { message: 'contactPhone must be a valid phone number, e.g. +8801XXXXXXXXX' })
  contactPhone!: string;
}
