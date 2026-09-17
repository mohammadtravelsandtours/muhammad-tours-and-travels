// Frontend-side mirror of ManpowerController's serialize() shapes (see
// apps/api/src/modules/manpower/manpower.controller.ts). Jobs are a public
// browsable catalog like Hajj & Umrah packages; applications are a
// document/workflow tracker like visas — nothing here charges the
// candidate a fee (this platform deliberately does not model one).

export interface ManpowerJob {
  id: string;
  title: string;
  country: string;
  employer: string | null;
  category: string | null;
  positionsAvailable: number;
  positionsFilled: number;
  positionsRemaining: number;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  contractDurationMonths: number | null;
  requirements: string[];
  benefits: string[];
  applicationDeadline: string | null;
  active: boolean;
  createdAt: string;
}

export interface ApplyManpowerJobInput {
  applicantFullName: string;
  applicantPassportNumber?: string;
  applicantNationality: string;
  dateOfBirth?: string; // YYYY-MM-DD
  yearsOfExperience?: number;
  currentOccupation?: string;
  coverNote?: string;
  contactEmail: string;
  contactPhone: string;
}

export type ManpowerApplicationStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'SHORTLISTED'
  | 'INTERVIEW_SCHEDULED'
  | 'SELECTED'
  | 'VISA_PROCESSING'
  | 'DEPLOYED'
  | 'REJECTED'
  | 'WITHDRAWN';

export interface ManpowerStatusHistoryEntry {
  fromStatus: ManpowerApplicationStatus | null;
  toStatus: ManpowerApplicationStatus;
  note?: string;
  createdAt: string;
}

export interface ManpowerApplication {
  id: string;
  applicationReference: string;
  jobId: string;
  job: ManpowerJob | null;
  applicantFullName: string;
  applicantPassportNumber: string | null;
  applicantNationality: string;
  dateOfBirth: string | null;
  yearsOfExperience: number | null;
  currentOccupation: string | null;
  coverNote: string | null;
  contactEmail: string;
  contactPhone: string;
  status: ManpowerApplicationStatus;
  reviewerNote: string | null;
  createdAt: string;
  statusHistory: ManpowerStatusHistoryEntry[];
}

export const MANPOWER_STATUS_LABEL: Record<ManpowerApplicationStatus, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW_SCHEDULED: 'Interview scheduled',
  SELECTED: 'Selected',
  VISA_PROCESSING: 'Visa processing',
  DEPLOYED: 'Deployed',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

/** Applicant can still withdraw up to and including INTERVIEW_SCHEDULED — see ManpowerService.assertValidTransition's doc comment. */
export const MANPOWER_WITHDRAWABLE_STATUSES: ManpowerApplicationStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'INTERVIEW_SCHEDULED',
];
