-- Mohammad Travels — Phase 2 migration
-- Flight search, multi-supplier aggregation, booking, wallet/ledger,
-- pricing, and the Agent -> B2BAgency reshape.
--
-- This migration is written by hand (no working `prisma migrate dev` in
-- this sandbox — see README "Known limitation"). It is intentionally
-- ordered as: (1) reshape existing Phase 1 data losslessly, (2) create
-- every new Phase 2 type/table, (3) attach foreign keys last, matching
-- the style of 0001_init.

-- ═══════════════════════════════════════════════════════════════════
-- PART 1 — Agent -> B2BAgency reshape (data-preserving)
-- ═══════════════════════════════════════════════════════════════════
-- Phase 1's `agents` table carried `agency_name`/`status`/`approved_at`
-- directly, i.e. one agency per agent. Phase 2 allows an agency to have
-- multiple members (a B2B_AGENCY_ADMIN plus sub-agents), so agency-level
-- fields move to a new `b2b_agencies` table and `agents` becomes a
-- membership row. Every existing agent gets its own new agency row
-- carrying its old agency_name/status/approved_at, so no data is lost —
-- this only changes the shape, not the meaning, of what already exists.

CREATE TYPE "AgencyStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED');

CREATE TABLE "b2b_agencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "status" "AgencyStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "country" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "credit_limit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit_enabled" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "b2b_agencies_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agents" ADD COLUMN "agency_id" UUID;
ALTER TABLE "agents" ADD COLUMN "title" TEXT;

-- Backfill: one new agency per existing agent, carrying over its old
-- agency_name/status/approved_at. `_seed_agent_id` is a temporary marker
-- (dropped below) that links each freshly-created agency 1:1 back to the
-- agent row it was created for, so the id assignment below is exact even
-- if two agents happen to share a name and created_at.
ALTER TABLE "b2b_agencies" ADD COLUMN "_seed_agent_id" UUID;

INSERT INTO "b2b_agencies" ("id", "name", "status", "approved_at", "created_at", "updated_at", "_seed_agent_id")
SELECT gen_random_uuid(), a."agency_name", a."status"::text::"AgencyStatus", a."approved_at", a."created_at", a."updated_at", a."id"
FROM "agents" a;

UPDATE "agents" a
SET "agency_id" = b."id"
FROM "b2b_agencies" b
WHERE b."_seed_agent_id" = a."id";

ALTER TABLE "b2b_agencies" DROP COLUMN "_seed_agent_id";

ALTER TABLE "agents" ALTER COLUMN "agency_id" SET NOT NULL;
ALTER TABLE "agents" DROP CONSTRAINT IF EXISTS "agents_status_check";
ALTER TABLE "agents" DROP COLUMN "agency_name";
ALTER TABLE "agents" DROP COLUMN "status";
ALTER TABLE "agents" DROP COLUMN "approved_at";

CREATE INDEX "agents_agency_id_idx" ON "agents"("agency_id");
ALTER TABLE "agents" ADD CONSTRAINT "agents_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "b2b_agencies"("id") ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- PART 2 — Reference data (airports, airlines)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "airports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "iata_code" VARCHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "airports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "airports_iata_code_key" ON "airports"("iata_code");
CREATE INDEX "airports_city_idx" ON "airports"("city");
CREATE INDEX "airports_country_idx" ON "airports"("country");

CREATE TABLE "airlines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "iata_code" VARCHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "logo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "airlines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "airlines_iata_code_key" ON "airlines"("iata_code");

-- ═══════════════════════════════════════════════════════════════════
-- PART 3 — Suppliers & health
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE "SupplierType" AS ENUM ('B2B_API', 'B2B_WEB', 'GDS', 'NDC', 'MANUAL', 'MOCK');
CREATE TYPE "SupplierCredentialStatus" AS ENUM ('NOT_CONFIGURED', 'CONFIGURED', 'INVALID');
CREATE TYPE "SupplierHealthStatus" AS ENUM ('ONLINE', 'DEGRADED', 'OFFLINE', 'AUTH_ERROR', 'TIMEOUT', 'UNKNOWN');
CREATE TYPE "MarkupType" AS ENUM ('FIXED', 'PERCENTAGE');

CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SupplierType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "base_url" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timeout_ms" INTEGER NOT NULL DEFAULT 8000,
    "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 60,
    "default_markup_type" "MarkupType",
    "default_markup_value" DECIMAL(10,4),
    "default_commission_pct" DECIMAL(6,4),
    "credential_login_id_masked" TEXT,
    "credential_env_prefix" TEXT,
    "credential_status" "SupplierCredentialStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

CREATE TABLE "supplier_health" (
    "supplier_id" UUID NOT NULL,
    "status" "SupplierHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "last_success_at" TIMESTAMP(3),
    "last_error_at" TIMESTAMP(3),
    "last_error_message" TEXT,
    "avg_response_ms" INTEGER,
    "consecutive_errors" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supplier_health_pkey" PRIMARY KEY ("supplier_id")
);

-- ═══════════════════════════════════════════════════════════════════
-- PART 4 — Flight search & offers
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE "SearchChannel" AS ENUM ('B2C', 'B2B', 'CORPORATE');
CREATE TYPE "TripType" AS ENUM ('ONE_WAY', 'ROUND_TRIP', 'MULTI_CITY');
CREATE TYPE "CabinClass" AS ENUM ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST');

CREATE TABLE "flight_searches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel" "SearchChannel" NOT NULL,
    "requested_by_user_id" UUID,
    "trip_type" "TripType" NOT NULL,
    "cabin" "CabinClass" NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "nationality" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "flight_searches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "flight_searches_requested_by_user_id_idx" ON "flight_searches"("requested_by_user_id");

CREATE TABLE "flight_search_segments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "search_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "origin" VARCHAR(3) NOT NULL,
    "destination" VARCHAR(3) NOT NULL,
    "departure_date" DATE NOT NULL,
    CONSTRAINT "flight_search_segments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "search_supplier_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "search_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "latency_ms" INTEGER,
    "offer_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "search_supplier_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "search_supplier_runs_supplier_id_created_at_idx" ON "search_supplier_runs"("supplier_id", "created_at");

CREATE TABLE "flight_offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "search_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "supplier_offer_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "is_mock" BOOLEAN NOT NULL DEFAULT false,
    "validating_carrier" VARCHAR(2) NOT NULL,
    "cabin" "CabinClass" NOT NULL,
    "fare_family" TEXT NOT NULL,
    "stops" INTEGER NOT NULL,
    "total_duration_minutes" INTEGER NOT NULL,
    "base_fare" DECIMAL(12,2) NOT NULL,
    "taxes" DECIMAL(12,2) NOT NULL,
    "fees" DECIMAL(12,2) NOT NULL,
    "markup_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_fare" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "refundable" BOOLEAN NOT NULL,
    "changeable" BOOLEAN NOT NULL,
    "baggage_checked_kg" INTEGER,
    "baggage_carry_on_kg" INTEGER,
    "baggage_note" TEXT,
    "seats_available" INTEGER NOT NULL,
    "ticketing_deadline" TIMESTAMP(3),
    "fare_rules" JSONB,
    "transit_visa_warning" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "flight_offers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "flight_offers_search_id_idx" ON "flight_offers"("search_id");
CREATE INDEX "flight_offers_fingerprint_idx" ON "flight_offers"("fingerprint");

CREATE TABLE "flight_segments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "offer_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "marketing_carrier" VARCHAR(2) NOT NULL,
    "operating_carrier" VARCHAR(2) NOT NULL,
    "flight_number" TEXT NOT NULL,
    "origin" VARCHAR(3) NOT NULL,
    "destination" VARCHAR(3) NOT NULL,
    "departure_at" TIMESTAMP(3) NOT NULL,
    "arrival_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "aircraft" TEXT,
    "booking_class" TEXT NOT NULL,
    CONSTRAINT "flight_segments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "flight_segments_offer_id_sequence_idx" ON "flight_segments"("offer_id", "sequence");

-- ═══════════════════════════════════════════════════════════════════
-- PART 5 — Booking, passengers, tickets
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE "BookingStatus" AS ENUM ('SEARCHED', 'PRICE_PENDING', 'PRICE_CONFIRMED', 'BOOKING_PENDING', 'CONFIRMED', 'TICKETED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUND_PENDING', 'REFUNDED');
CREATE TYPE "PassengerType" AS ENUM ('ADULT', 'CHILD', 'INFANT');

CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_reference" TEXT NOT NULL,
    "offer_id" UUID NOT NULL,
    "channel" "SearchChannel" NOT NULL,
    "customer_id" UUID,
    "agent_id" UUID,
    "employee_id" UUID,
    "contact_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "whatsapp_number" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'SEARCHED',
    "currency" TEXT NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bookings_booking_reference_key" ON "bookings"("booking_reference");
CREATE UNIQUE INDEX "bookings_idempotency_key_key" ON "bookings"("idempotency_key");
CREATE INDEX "bookings_customer_id_idx" ON "bookings"("customer_id");
CREATE INDEX "bookings_agent_id_idx" ON "bookings"("agent_id");
CREATE INDEX "bookings_employee_id_idx" ON "bookings"("employee_id");

CREATE TABLE "booking_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "from_status" "BookingStatus",
    "to_status" "BookingStatus" NOT NULL,
    "actor_user_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "booking_status_history_booking_id_idx" ON "booking_status_history"("booking_id");

CREATE TABLE "passengers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "type" "PassengerType" NOT NULL,
    "title" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "gender" TEXT,
    "nationality" TEXT,
    "passport_number" TEXT,
    "passport_expiry" DATE,
    "passport_issuing_country" TEXT,
    CONSTRAINT "passengers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "passengers_booking_id_idx" ON "passengers"("booking_id");

CREATE TABLE "tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "passenger_id" UUID NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "issued_at" TIMESTAMP(3),
    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tickets_ticket_number_key" ON "tickets"("ticket_number");

-- ═══════════════════════════════════════════════════════════════════
-- PART 6 — Payments & refunds
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_reference" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

CREATE TABLE "refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "ticket_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- ═══════════════════════════════════════════════════════════════════
-- PART 7 — Wallet / ledger
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE "LedgerTransactionType" AS ENUM ('DEPOSIT', 'BOOKING_DEBIT', 'REFUND_CREDIT', 'ADJUSTMENT_CREDIT', 'ADJUSTMENT_DEBIT', 'COMMISSION', 'SERVICE_FEE');

CREATE TABLE "wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wallets_agency_id_key" ON "wallets"("agency_id");

CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wallet_id" UUID NOT NULL,
    "booking_id" UUID,
    "type" "LedgerTransactionType" NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "previous_balance" DECIMAL(14,2) NOT NULL,
    "new_balance" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");

-- ═══════════════════════════════════════════════════════════════════
-- PART 8 — Pricing (markup rules, commissions)
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE "MarkupScope" AS ENUM ('GLOBAL', 'SUPPLIER', 'AIRLINE', 'ROUTE', 'CABIN', 'FARE_FAMILY', 'AGENCY');

CREATE TABLE "markup_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" "MarkupScope" NOT NULL,
    "supplier_id" UUID,
    "airline_code" VARCHAR(2),
    "route" TEXT,
    "cabin" "CabinClass",
    "fare_family" TEXT,
    "agency_id" UUID,
    "type" "MarkupType" NOT NULL,
    "value" DECIMAL(10,4) NOT NULL,
    "min_amount" DECIMAL(12,2),
    "max_amount" DECIMAL(12,2),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "markup_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "rate" DECIMAL(6,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "commissions_booking_id_key" ON "commissions"("booking_id");

-- ═══════════════════════════════════════════════════════════════════
-- PART 9 — Corporate approval workflow (schema-only; NOT IMPLEMENTED
-- in the service layer this pass — see schema.prisma doc comment)
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE "CorporateApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "corporate_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "requested_by_employee_id" UUID NOT NULL,
    "approver_user_id" UUID,
    "status" "CorporateApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "corporate_approvals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "corporate_approvals_booking_id_key" ON "corporate_approvals"("booking_id");

-- ═══════════════════════════════════════════════════════════════════
-- PART 10 — Foreign keys
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "flight_searches" ADD CONSTRAINT "flight_searches_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "flight_search_segments" ADD CONSTRAINT "flight_search_segments_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "flight_searches"("id") ON DELETE CASCADE;

ALTER TABLE "search_supplier_runs" ADD CONSTRAINT "search_supplier_runs_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "flight_searches"("id") ON DELETE CASCADE;
ALTER TABLE "search_supplier_runs" ADD CONSTRAINT "search_supplier_runs_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT;

ALTER TABLE "supplier_health" ADD CONSTRAINT "supplier_health_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE;

ALTER TABLE "flight_offers" ADD CONSTRAINT "flight_offers_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "flight_searches"("id") ON DELETE CASCADE;
ALTER TABLE "flight_offers" ADD CONSTRAINT "flight_offers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT;

ALTER TABLE "flight_segments" ADD CONSTRAINT "flight_segments_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "flight_offers"("id") ON DELETE CASCADE;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "flight_offers"("id") ON DELETE RESTRICT;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL;

ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;

ALTER TABLE "passengers" ADD CONSTRAINT "passengers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "passengers"("id") ON DELETE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL;

ALTER TABLE "wallets" ADD CONSTRAINT "wallets_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "b2b_agencies"("id") ON DELETE CASCADE;

ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL;

ALTER TABLE "markup_rules" ADD CONSTRAINT "markup_rules_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE;
ALTER TABLE "markup_rules" ADD CONSTRAINT "markup_rules_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "b2b_agencies"("id") ON DELETE CASCADE;

ALTER TABLE "commissions" ADD CONSTRAINT "commissions_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "b2b_agencies"("id") ON DELETE CASCADE;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;

ALTER TABLE "corporate_approvals" ADD CONSTRAINT "corporate_approvals_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;
ALTER TABLE "corporate_approvals" ADD CONSTRAINT "corporate_approvals_requested_by_employee_id_fkey" FOREIGN KEY ("requested_by_employee_id") REFERENCES "employees"("id") ON DELETE CASCADE;
