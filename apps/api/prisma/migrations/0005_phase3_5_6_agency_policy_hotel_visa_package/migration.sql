-- Mohammad Travels — Phase 3/5/6 migration
-- Corporate cost centers + travel policy (Phase 5), hotels + visas +
-- packages (Phase 6). Additive only — no existing column is dropped,
-- retyped, or made non-nullable; every new FK column on an existing
-- table (employees, bookings) is nullable, so no backfill is required.
-- Hand-written, matching 0002's style (no working `prisma migrate dev`
-- in this sandbox).

-- ═══════════════════════════════════════════════════════════════════
-- PART 1 — Corporate cost centers & travel policy
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "cost_centers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "corporate_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cost_centers_corporate_id_code_key" ON "cost_centers"("corporate_id", "code");
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_corporate_id_fkey" FOREIGN KEY ("corporate_id") REFERENCES "corporates"("id") ON DELETE CASCADE;

ALTER TABLE "employees" ADD COLUMN "cost_center_id" UUID;
ALTER TABLE "employees" ADD CONSTRAINT "employees_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL;

CREATE TABLE "travel_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "corporate_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Standard policy',
    "max_cabin" "CabinClass" NOT NULL DEFAULT 'BUSINESS',
    "block_over_max_cabin" BOOLEAN NOT NULL DEFAULT true,
    "soft_fare_cap_amount" DECIMAL(12,2),
    "hard_fare_cap_amount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "travel_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "travel_policies_corporate_id_key" ON "travel_policies"("corporate_id");
ALTER TABLE "travel_policies" ADD CONSTRAINT "travel_policies_corporate_id_fkey" FOREIGN KEY ("corporate_id") REFERENCES "corporates"("id") ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- PART 2 — Hotels
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "hotel_properties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "star_rating" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hotel_properties_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hotel_properties_city_idx" ON "hotel_properties"("city");

CREATE TABLE "hotel_searches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel" "SearchChannel" NOT NULL,
    "requested_by_user_id" UUID,
    "city" TEXT NOT NULL,
    "check_in_date" DATE NOT NULL,
    "check_out_date" DATE NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL DEFAULT 0,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hotel_searches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hotel_searches_requested_by_user_id_idx" ON "hotel_searches"("requested_by_user_id");
ALTER TABLE "hotel_searches" ADD CONSTRAINT "hotel_searches_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;

CREATE TABLE "hotel_search_supplier_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "search_id" UUID NOT NULL,
    "supplier_code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latency_ms" INTEGER,
    "offer_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hotel_search_supplier_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hotel_search_supplier_runs_search_id_idx" ON "hotel_search_supplier_runs"("search_id");
ALTER TABLE "hotel_search_supplier_runs" ADD CONSTRAINT "hotel_search_supplier_runs_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "hotel_searches"("id") ON DELETE CASCADE;

CREATE TYPE "HotelBoardType" AS ENUM ('ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD');

CREATE TABLE "hotel_offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "search_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "supplier_code" TEXT NOT NULL,
    "supplier_offer_id" TEXT NOT NULL,
    "is_mock" BOOLEAN NOT NULL DEFAULT true,
    "room_type" TEXT NOT NULL,
    "board" "HotelBoardType" NOT NULL DEFAULT 'ROOM_ONLY',
    "refundable" BOOLEAN NOT NULL DEFAULT false,
    "nights" INTEGER NOT NULL,
    "base_fare" DECIMAL(12,2) NOT NULL,
    "taxes" DECIMAL(12,2) NOT NULL,
    "fees" DECIMAL(12,2) NOT NULL,
    "markup_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_fare" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hotel_offers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hotel_offers_search_id_idx" ON "hotel_offers"("search_id");
ALTER TABLE "hotel_offers" ADD CONSTRAINT "hotel_offers_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "hotel_searches"("id") ON DELETE CASCADE;
ALTER TABLE "hotel_offers" ADD CONSTRAINT "hotel_offers_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "hotel_properties"("id") ON DELETE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════
-- PART 3 — Travel packages (created before hotel_bookings/bookings
-- reference it)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "travel_packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "package_reference" TEXT NOT NULL,
    "customer_id" UUID,
    "agent_id" UUID,
    "employee_id" UUID,
    "currency" TEXT NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "travel_packages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "travel_packages_package_reference_key" ON "travel_packages"("package_reference");
CREATE INDEX "travel_packages_customer_id_idx" ON "travel_packages"("customer_id");
ALTER TABLE "travel_packages" ADD CONSTRAINT "travel_packages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL;
ALTER TABLE "travel_packages" ADD CONSTRAINT "travel_packages_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL;
ALTER TABLE "travel_packages" ADD CONSTRAINT "travel_packages_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL;

CREATE TYPE "HotelBookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED');

CREATE TABLE "hotel_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_reference" TEXT NOT NULL,
    "offer_id" UUID NOT NULL,
    "channel" "SearchChannel" NOT NULL,
    "customer_id" UUID,
    "agent_id" UUID,
    "employee_id" UUID,
    "guest_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "status" "HotelBookingStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "supplier_booking_reference" TEXT,
    "idempotency_key" TEXT,
    "package_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hotel_bookings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hotel_bookings_booking_reference_key" ON "hotel_bookings"("booking_reference");
CREATE UNIQUE INDEX "hotel_bookings_idempotency_key_key" ON "hotel_bookings"("idempotency_key");
CREATE UNIQUE INDEX "hotel_bookings_package_id_key" ON "hotel_bookings"("package_id");
CREATE INDEX "hotel_bookings_customer_id_idx" ON "hotel_bookings"("customer_id");
CREATE INDEX "hotel_bookings_agent_id_idx" ON "hotel_bookings"("agent_id");
CREATE INDEX "hotel_bookings_employee_id_idx" ON "hotel_bookings"("employee_id");

ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "hotel_offers"("id") ON DELETE RESTRICT;
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL;
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL;
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL;
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "travel_packages"("id") ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════
-- PART 4 — Visas
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE "VisaApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'APPROVED', 'REJECTED');

CREATE TABLE "visa_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_reference" TEXT NOT NULL,
    "destination_country" TEXT NOT NULL,
    "visa_type" TEXT NOT NULL,
    "travel_date" DATE,
    "applicant_full_name" TEXT NOT NULL,
    "applicant_passport_number" TEXT NOT NULL,
    "applicant_nationality" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "status" "VisaApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewer_note" TEXT,
    "customer_id" UUID,
    "agent_id" UUID,
    "employee_id" UUID,
    "submitted_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "visa_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "visa_applications_application_reference_key" ON "visa_applications"("application_reference");
CREATE INDEX "visa_applications_customer_id_idx" ON "visa_applications"("customer_id");
CREATE INDEX "visa_applications_agent_id_idx" ON "visa_applications"("agent_id");
CREATE INDEX "visa_applications_employee_id_idx" ON "visa_applications"("employee_id");

ALTER TABLE "visa_applications" ADD CONSTRAINT "visa_applications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL;
ALTER TABLE "visa_applications" ADD CONSTRAINT "visa_applications_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL;
ALTER TABLE "visa_applications" ADD CONSTRAINT "visa_applications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL;
ALTER TABLE "visa_applications" ADD CONSTRAINT "visa_applications_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;

CREATE TABLE "visa_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "from_status" "VisaApplicationStatus",
    "to_status" "VisaApplicationStatus" NOT NULL,
    "actor_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "visa_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "visa_status_history_application_id_idx" ON "visa_status_history"("application_id");
ALTER TABLE "visa_status_history" ADD CONSTRAINT "visa_status_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "visa_applications"("id") ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- PART 5 — Bookings: cost center, policy note, package link
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "bookings" ADD COLUMN "cost_center_id" UUID;
ALTER TABLE "bookings" ADD COLUMN "policy_violation_note" TEXT;
ALTER TABLE "bookings" ADD COLUMN "package_id" UUID;

CREATE INDEX "bookings_cost_center_id_idx" ON "bookings"("cost_center_id");
CREATE UNIQUE INDEX "bookings_package_id_key" ON "bookings"("package_id");

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "travel_packages"("id") ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════
-- PART 6 — Payment/Refund/WalletTransaction become polymorphic across
-- Booking (flights) and HotelBooking, so hotels settle through the same
-- PaymentsService/WalletService ledger as flights instead of a second,
-- parallel settlement path (see docs/ROADMAP.md Phase 6: "each product
-- follows the same adapter/audit pattern as flights"). booking_id is
-- relaxed to nullable rather than dropped — every existing flight
-- Payment/Refund row still has it set; only the new hotel-settled rows
-- will have hotel_booking_id set instead.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "payments" ALTER COLUMN "booking_id" DROP NOT NULL;
ALTER TABLE "payments" ADD COLUMN "hotel_booking_id" UUID;
CREATE INDEX "payments_hotel_booking_id_idx" ON "payments"("hotel_booking_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_hotel_booking_id_fkey" FOREIGN KEY ("hotel_booking_id") REFERENCES "hotel_bookings"("id") ON DELETE CASCADE;

ALTER TABLE "refunds" ALTER COLUMN "booking_id" DROP NOT NULL;
ALTER TABLE "refunds" ADD COLUMN "hotel_booking_id" UUID;
CREATE INDEX "refunds_hotel_booking_id_idx" ON "refunds"("hotel_booking_id");
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_hotel_booking_id_fkey" FOREIGN KEY ("hotel_booking_id") REFERENCES "hotel_bookings"("id") ON DELETE CASCADE;

ALTER TABLE "wallet_transactions" ADD COLUMN "hotel_booking_id" UUID;
CREATE INDEX "wallet_transactions_hotel_booking_id_idx" ON "wallet_transactions"("hotel_booking_id");
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_hotel_booking_id_fkey" FOREIGN KEY ("hotel_booking_id") REFERENCES "hotel_bookings"("id") ON DELETE SET NULL;
