-- Adds the supplier's own booking reference to `bookings` — additive,
-- nullable, no backfill needed (no bookings exist yet at this migration
-- since the booking engine ships in this same pass).

ALTER TABLE "bookings" ADD COLUMN "supplier_booking_reference" TEXT;
