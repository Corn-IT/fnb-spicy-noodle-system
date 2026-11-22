-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" SERIAL NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "bank_code" VARCHAR(16) NOT NULL,
    "account_no" VARCHAR(32) NOT NULL,
    "account_name" VARCHAR(128) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "daily_limit" DECIMAL(12,2),
    "monthly_limit" DECIMAL(12,2),
    "yearly_limit" DECIMAL(12,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_payment_accounts_limits_positive" CHECK (
        ("daily_limit" IS NULL OR "daily_limit" > 0) AND
        ("monthly_limit" IS NULL OR "monthly_limit" > 0) AND
        ("yearly_limit" IS NULL OR "yearly_limit" > 0)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_payment_accounts_bank_account" ON "payment_accounts"("bank_code", "account_no");

-- CreateIndex
CREATE INDEX "idx_payment_accounts_active_priority" ON "payment_accounts"("is_active", "priority");

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "payment_account_id" INTEGER;

-- CreateIndex
CREATE INDEX "idx_orders_payment_account_paid" ON "orders"("payment_account_id", "paid_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "payment_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed default VietQR account & backfill existing TRANSFER / SPLIT orders (Decision D15)
INSERT INTO "payment_accounts" ("label", "bank_code", "account_no", "account_name", "priority", "is_active", "daily_limit", "monthly_limit", "yearly_limit")
VALUES ('TK Chính (VPBank)', 'VPB', '186877721', 'THAN THI LOAN', 1, true, NULL, NULL, NULL)
ON CONFLICT ("bank_code", "account_no") DO NOTHING;

UPDATE "orders"
SET "payment_account_id" = (
    SELECT "id" FROM "payment_accounts"
    WHERE "bank_code" = 'VPB' AND "account_no" = '186877721'
    LIMIT 1
)
WHERE "payment_method" IN ('TRANSFER', 'SPLIT')
  AND "payment_account_id" IS NULL;
