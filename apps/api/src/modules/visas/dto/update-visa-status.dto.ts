import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { VisaApplicationStatus } from '@mohammad-travels/types';

const STATUSES: VisaApplicationStatus[] = ['UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED'];

export class UpdateVisaStatusDto {
  /** SUBMITTED is deliberately excluded — that's the initial status an application is created with, never a target a reviewer transitions it back to. */
  @IsIn(STATUSES)
  toStatus!: Exclude<VisaApplicationStatus, 'SUBMITTED'>;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
