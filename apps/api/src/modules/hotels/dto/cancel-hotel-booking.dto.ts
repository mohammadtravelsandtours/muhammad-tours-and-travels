import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelHotelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
