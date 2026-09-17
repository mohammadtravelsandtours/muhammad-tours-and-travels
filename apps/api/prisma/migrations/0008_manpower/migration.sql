-- Manpower (overseas job placement / recruitment) — a workflow/document
-- process like visa_applications, with its own admin-managed job catalog
-- like hajj_umrah_packages. See schema.prisma's ManpowerJob/
-- ManpowerApplication doc comments for why this deliberately carries no
-- fee/payment fields.

CREATE TYPE "ManpowerApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'SELECTED', 'VISA_PROCESSING', 'DEPLOYED', 'REJECTED', 'WITHDRAWN');

CREATE TABLE "manpower_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "employer" TEXT,
    "category" TEXT,
    "positions_available" INTEGER NOT NULL,
    "positions_filled" INTEGER NOT NULL DEFAULT 0,
    "salary_min" DECIMAL(12,2),
    "salary_max" DECIMAL(12,2),
    "currency" TEXT,
    "contract_duration_months" INTEGER,
    "requirements" JSONB,
    "benefits" JSONB,
    "application_deadline" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "manpower_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "manpower_jobs_active_country_idx" ON "manpower_jobs"("active", "country");

CREATE TABLE "manpower_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_reference" TEXT NOT NULL,
    "job_id" UUID NOT NULL,
    "applicant_full_name" TEXT NOT NULL,
    "applicant_passport_number" TEXT,
    "applicant_nationality" TEXT NOT NULL,
    "date_of_birth" DATE,
    "years_of_experience" INTEGER,
    "current_occupation" TEXT,
    "cover_note" TEXT,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "status" "ManpowerApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewer_note" TEXT,
    "customer_id" UUID,
    "agent_id" UUID,
    "employee_id" UUID,
    "submitted_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "manpower_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "manpower_applications_application_reference_key" ON "manpower_applications"("application_reference");
CREATE INDEX "manpower_applications_job_id_idx" ON "manpower_applications"("job_id");
CREATE INDEX "manpower_applications_customer_id_idx" ON "manpower_applications"("customer_id");
CREATE INDEX "manpower_applications_agent_id_idx" ON "manpower_applications"("agent_id");
CREATE INDEX "manpower_applications_employee_id_idx" ON "manpower_applications"("employee_id");

ALTER TABLE "manpower_applications" ADD CONSTRAINT "manpower_applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "manpower_jobs"("id") ON DELETE RESTRICT;
ALTER TABLE "manpower_applications" ADD CONSTRAINT "manpower_applications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL;
ALTER TABLE "manpower_applications" ADD CONSTRAINT "manpower_applications_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL;
ALTER TABLE "manpower_applications" ADD CONSTRAINT "manpower_applications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL;
ALTER TABLE "manpower_applications" ADD CONSTRAINT "manpower_applications_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;

CREATE TABLE "manpower_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "from_status" "ManpowerApplicationStatus",
    "to_status" "ManpowerApplicationStatus" NOT NULL,
    "actor_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "manpower_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "manpower_status_history_application_id_idx" ON "manpower_status_history"("application_id");

ALTER TABLE "manpower_status_history" ADD CONSTRAINT "manpower_status_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "manpower_applications"("id") ON DELETE CASCADE;
