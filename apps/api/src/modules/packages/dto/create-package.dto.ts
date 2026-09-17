import { IsString } from 'class-validator';

export class CreatePackageDto {
  /** An already-CONFIRMED/TICKETED flight Booking id, owned by the caller. */
  @IsString()
  bookingId!: string;

  /** An already-CONFIRMED HotelBooking id, owned by the same caller. */
  @IsString()
  hotelBookingId!: string;
}
