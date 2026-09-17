/**
 * Visa domain: a document/workflow process, not a supplier-adapter search
 * (see VisaApplication's schema.prisma doc comment) — no adapter
 * interface here, just the status enum shared between the API and any
 * frontend that needs to render/validate it.
 */
export type VisaApplicationStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'ADDITIONAL_INFO_REQUIRED' | 'APPROVED' | 'REJECTED';
