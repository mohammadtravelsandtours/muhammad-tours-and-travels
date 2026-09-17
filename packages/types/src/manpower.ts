/**
 * Manpower (overseas job placement/recruitment) domain: a document/workflow
 * process like visas.ts's VisaApplicationStatus, plus a job/manpower-request
 * catalog like hajj-umrah's package catalog — see ManpowerJob/
 * ManpowerApplication's schema.prisma doc comments. No fee/payment status
 * here: this platform does not charge candidates a recruitment fee.
 */
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
