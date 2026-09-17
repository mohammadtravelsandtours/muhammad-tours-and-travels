import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** A later installment against an already-created HajjUmrahBooking (deposit-then-installments — see HajjUmrahBooking's doc comment in schema.prisma). */
export class AddHajjUmrahPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  paymentMethodToken?: string;
}
