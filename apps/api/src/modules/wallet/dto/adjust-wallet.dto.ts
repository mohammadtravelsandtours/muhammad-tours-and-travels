import { IsIn, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

const ADJUST_TYPES = ['DEPOSIT', 'ADJUSTMENT_CREDIT', 'ADJUSTMENT_DEBIT'] as const;
export type AdjustWalletType = (typeof ADJUST_TYPES)[number];

export class AdjustWalletDto {
  @IsIn(ADJUST_TYPES)
  type!: AdjustWalletType;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  description?: string;
}
