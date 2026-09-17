// Frontend-side mirror of VisasController's serialize() shape (see
// apps/api/src/modules/visas/visas.controller.ts). This is a document/status
// tracker, not a supplier search+booking flow like flights/hotels — a visa
// is granted or refused by the destination country, never by this platform.

export interface ApplyVisaInput {
  destinationCountry: string;
  visaType: string;
  travelDate?: string; // YYYY-MM-DD
  applicantFullName: string;
  applicantPassportNumber: string;
  applicantNationality: string;
  contactEmail: string;
  contactPhone: string;
}

export type VisaApplicationStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'ADDITIONAL_INFO_REQUIRED' | 'APPROVED' | 'REJECTED';

export interface VisaStatusHistoryEntry {
  fromStatus: VisaApplicationStatus | null;
  toStatus: VisaApplicationStatus;
  note?: string;
  createdAt: string;
}

export interface VisaApplication {
  id: string;
  applicationReference: string;
  destinationCountry: string;
  visaType: string;
  travelDate: string | null;
  applicantFullName: string;
  applicantPassportNumber: string;
  applicantNationality: string;
  contactEmail: string;
  contactPhone: string;
  status: VisaApplicationStatus;
  reviewerNote: string | null;
  createdAt: string;
  statusHistory: VisaStatusHistoryEntry[];
}

export const VISA_STATUS_LABEL: Record<VisaApplicationStatus, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  ADDITIONAL_INFO_REQUIRED: 'Additional info required',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};
