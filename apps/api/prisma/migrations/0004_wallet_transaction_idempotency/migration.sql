-- Additive only: nullable column + unique index, existing rows unaffected.
ALTER TABLE "wallet_transactions" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");
