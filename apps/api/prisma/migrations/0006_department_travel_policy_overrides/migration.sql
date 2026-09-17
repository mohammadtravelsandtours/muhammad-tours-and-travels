-- Phase "next" (post-Phase 10) — department-level corporate travel
-- policy overrides. See schema.prisma's DepartmentTravelPolicy doc
-- comment for why this is a separate table from travel_policies rather
-- than a nullable department_id column on it.

CREATE TABLE "department_travel_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "department_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Department policy',
    "max_cabin" "CabinClass" NOT NULL DEFAULT 'BUSINESS',
    "block_over_max_cabin" BOOLEAN NOT NULL DEFAULT true,
    "soft_fare_cap_amount" DECIMAL(12,2),
    "hard_fare_cap_amount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "department_travel_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "department_travel_policies_department_id_key" ON "department_travel_policies"("department_id");
ALTER TABLE "department_travel_policies" ADD CONSTRAINT "department_travel_policies_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE;
