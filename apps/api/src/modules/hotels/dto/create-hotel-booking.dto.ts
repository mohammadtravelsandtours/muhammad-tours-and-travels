import { IsEmail, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

const PHONE_RE = /^\+?[0-9]{7,15}$/;

export class CreateHotelBookingDto {
  @IsString()
  offerId!: string;

  @IsInt()
  @Min(1)
  @Max(9)
  rooms!: number;

  @IsString()
  @Length(1, 150)
  guestName!: string;

  @IsEmail()
  contactEmail!: string;

  @Matches(PHONE_RE, { message: 'contactPhone must be a valid phone number, e.g. +8801XXXXXXXXX' })
  contactPhone!: string;

  /** Same explicit price-change-confirmation contract as CreateBookingDto.acceptedTotalFare — required only when the mandatory server-side reprice finds the price has changed. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  acceptedTotalAmount?: number;

  /** Same gateway PaymentMethod token contract as CreateBookingDto.paymentMethodToken — see its doc comment. Ignored for B2B (wallet-settled) hotel bookings. */
  @IsOptional()
  @IsString()
  @Length(1, 255)
  paymentMethodToken?: string;
}
