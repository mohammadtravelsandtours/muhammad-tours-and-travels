import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { PassengerType } from '@mohammad-travels/types';

const PASSENGER_TYPES: PassengerType[] = ['ADULT', 'CHILD', 'INFANT'];
// Loose E.164-ish check (optional leading +, 7-15 digits) — deliberately
// not using class-validator's @IsPhoneNumber, which needs the
// libphonenumber-js package at runtime and isn't worth adding as a
// dependency just for this one field in a mock booking flow.
const PHONE_RE = /^\+?[0-9]{7,15}$/;

export class PassengerDto {
  @IsIn(PASSENGER_TYPES)
  type!: PassengerType;

  @IsString()
  @Length(1, 10)
  title!: string;

  @IsString()
  @Length(1, 100)
  firstName!: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  middleName?: string;

  @IsString()
  @Length(1, 100)
  lastName!: string;

  @IsISO8601({ strict: true }, { message: 'dateOfBirth must be an ISO date (YYYY-MM-DD)' })
  dateOfBirth!: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  @Length(2, 60)
  nationality?: string;

  @IsOptional()
  @IsString()
  @Length(4, 20)
  passportNumber?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  passportExpiry?: string;

  @IsOptional()
  @IsString()
  @Length(2, 60)
  passportIssuingCountry?: string;
}

export class CreateBookingDto {
  @IsString()
  offerId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  passengers!: PassengerDto[];

  @IsString()
  @Length(1, 150)
  contactName!: string;

  @IsEmail()
  contactEmail!: string;

  @Matches(PHONE_RE, { message: 'contactPhone must be a valid phone number, e.g. +8801XXXXXXXXX' })
  contactPhone!: string;

  @IsOptional()
  @Matches(PHONE_RE, { message: 'whatsappNumber must be a valid phone number, e.g. +8801XXXXXXXXX' })
  whatsappNumber?: string;

  /**
   * Required only when the mandatory server-side reprice (always
   * performed again inside BookingsService, regardless of what a
   * client-side reprice call earlier showed) finds the price has
   * changed. Its value must equal the NEW total exactly — this is the
   * explicit price-change confirmation the booking flow requires; a
   * mismatched or missing value on a changed price is rejected rather
   * than silently booking at whatever price came back.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  acceptedTotalFare?: number;

  /**
   * CORPORATE-channel only — which cost center to charge. Optional even
   * there: falls back to the employee's own default cost center (see
   * TravelPolicyService.resolveCostCenter) when omitted, so this only
   * needs to be sent when the traveler is charging a different one.
   * Ignored entirely for B2C/B2B bookings.
   */
  @IsOptional()
  @IsString()
  costCenterId?: string;

  /**
   * A gateway-issued, single-use token (e.g. a Stripe PaymentMethod id)
   * produced client-side by the gateway's own hosted card fields —
   * never a raw card number, and this DTO never accepts one. Only
   * meaningful for B2C/CORPORATE bookings settled through PaymentsService
   * (see ChargeRequest.paymentMethodToken); ignored for B2B bookings,
   * which always settle from the agency's own wallet instead. Optional
   * because it's only required when PAYMENT_PROVIDER_STRATEGY=STRIPE is
   * actually selected — the default MANUAL provider never looks at it.
   */
  @IsOptional()
  @IsString()
  @Length(1, 255)
  paymentMethodToken?: string;
}
