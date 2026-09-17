-- Hajj & Umrah package catalog — extends the packages domain. See
-- schema.prisma's HajjUmrahPackage/HajjUmrahBooking doc comments for why
-- this is new tables rather than overloading travel_packages (which has
-- no concept of a future dated departure, capacity, or a deposit).

CREATE TYPE "HajjUmrahPackageType" AS ENUM ('HAJJ', 'UMRAH');
CREATE TYPE "DepositType" AS ENUM ('PERCENTAGE', 'FIXED');
CREATE TYPE "HajjUmrahBookingStatus" AS ENUM ('PENDING_DEPOSIT', 'DEPOSIT_PAID', 'PARTIALLY_PAID', 'FULLY_PAID', 'CANCELLED');

CREATE TABLE "hajj_umrah_packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "type" "HajjUmrahPackageType" NOT NULL,
    "description" TEXT,
    "departure_date" TIMESTAMP(3) NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL,
    "duration_nights" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "deposit_type" "DepositType" NOT NULL,
    "deposit_value" DECIMAL(12,2) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "seats_booked" INTEGER NOT NULL DEFAULT 0,
    "inclusions" JSONB,
    "makkah_hotel" TEXT,
    "madinah_hotel" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hajj_umrah_packages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hajj_umrah_packages_type_active_departure_date_idx" ON "hajj_umrah_packages"("type", "active", "departure_date");

CREATE TABLE "hajj_umrah_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_reference" TEXT NOT NULL,
    "package_id" UUID NOT NULL,
    "customer_id" UUID,
    "agent_id" UUID,
    "employee_id" UUID,
    "pilgrims" INTEGER NOT NULL,
    "lead_pilgrim_name" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "minimum_deposit_amount" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "HajjUmrahBookingStatus" NOT NULL DEFAULT 'PENDING_DEPOSIT',
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hajj_umrah_bookings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hajj_umrah_bookings_booking_reference_key" ON "hajj_umrah_bookings"("booking_reference");
CREATE UNIQUE INDEX "hajj_umrah_bookings_idempotency_key_key" ON "hajj_umrah_bookings"("idempotency_key");
CREATE INDEX "hajj_umrah_bookings_package_id_idx" ON "hajj_umrah_bookings"("package_id");
CREATE INDEX "hajj_umrah_bookings_customer_id_idx" ON "hajj_umrah_bookings"("customer_id");

ALTER TABLE "hajj_umrah_bookings" ADD CONSTRAINT "hajj_umrah_bookings_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "hajj_umrah_packages"("id") ON DELETE RESTRICT;
ALTER TABLE "hajj_umrah_bookings" ADD CONSTRAINT "hajj_umrah_bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL;
ALTER TABLE "hajj_umrah_bookings" ADD CONSTRAINT "hajj_umrah_bookings_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL;
ALTER TABLE "hajj_umrah_bookings" ADD CONSTRAINT "hajj_umrah_bookings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL;

-- Extend the existing polymorphic payments table with a third product
-- line (see schema.prisma's Payment doc comment).
ALTER TABLE "payments" ADD COLUMN "hajj_umrah_booking_id" UUID;
ALTER TABLE "payments" ADD CONSTRAINT "payments_hajj_umrah_booking_id_fkey" FOREIGN KEY ("hajj_umrah_booking_id") REFERENCES "hajj_umrah_bookings"("id") ON DELETE CASCADE;
