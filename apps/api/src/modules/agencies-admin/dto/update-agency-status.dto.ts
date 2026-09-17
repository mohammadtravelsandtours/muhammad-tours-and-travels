import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const AGENCY_STATUSES = ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED'] as const;

export class UpdateAgencyStatusDto {
  @IsIn(AGENCY_STATUSES)
  status!: (typeof AGENCY_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
