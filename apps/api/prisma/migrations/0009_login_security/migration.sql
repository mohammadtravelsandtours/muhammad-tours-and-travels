-- Phase 14: admin login security hardening
-- Adds mandatory-for-new-registrations phone number + optional address,
-- last-login tracking, opt-in TOTP 2FA, and self-service password reset.

ALTER TABLE "users"
  ADD COLUMN "phone_number" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "last_login_at" TIMESTAMP(3),
  ADD COLUMN "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "two_factor_secret" TEXT,
  ADD COLUMN "two_factor_backup_codes" TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),

  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
