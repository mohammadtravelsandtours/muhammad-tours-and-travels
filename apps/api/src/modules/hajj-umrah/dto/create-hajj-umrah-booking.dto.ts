import { IsEmail, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Min } from 'class-validator';

const PHONE_RE = /^\+?[0-9]{7,15}$/;

export class CreateHajjUmrahBookingDto {
  @IsUUID()
  packageId!: string;

  @IsInt()
  @Min(1)
  pilgrims!: number;

  @IsString()
  @Length(1, 150)
  leadPilgrimName!: string;

  @Matches(PHONE_RE, { message: 'contactPhone must be a valid phone number, e.g. +8801XXXXXXXXX' })
  contactPhone!: string;

  @IsEmail()
  contactEmail!: string;

  /**
   * The amount the customer wants to pay now, in the package's currency.
   * Optional — omitting it charges exactly the computed minimum deposit.
   * When provided it must be at least the minimum deposit (see
   * HajjUmrahService.createBooking) — a customer may always choose to
   * pay more than the minimum upfront, never less.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  paymentAmount?: number;

  @IsOptional()
  @IsString()
  paymentMethodToken?: string;
}
