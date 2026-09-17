import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ManpowerApplicationStatus } from '@mohammad-travels/types';

const STATUSES: ManpowerApplicationStatus[] = [
  'UNDER_REVIEW',
  'SHORTLISTED',
  'INTERVIEW_SCHEDULED',
  'SELECTED',
  'VISA_PROCESSING',
  'DEPLOYED',
  'REJECTED',
];

export class UpdateManpowerStatusDto {
  /** SUBMITTED and WITHDRAWN are deliberately excluded — SUBMITTED is the initial status, and WITHDRAWN is applicant-initiated only (see the dedicated withdraw endpoint). */
  @IsIn(STATUSES)
  toStatus!: Exclude<ManpowerApplicationStatus, 'SUBMITTED' | 'WITHDRAWN'>;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
