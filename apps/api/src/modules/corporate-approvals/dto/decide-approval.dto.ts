import { IsIn, IsOptional, IsString, Length } from 'class-validator';

const DECISIONS = ['APPROVED', 'REJECTED'] as const;

export class DecideApprovalDto {
  @IsIn(DECISIONS)
  decision!: (typeof DECISIONS)[number];

  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}
