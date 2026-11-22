-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount_id" INTEGER,
ADD COLUMN     "discount_snapshot" JSONB,
ADD COLUMN     "subtotal_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "discounts" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "value_type" VARCHAR(16) NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "max_discount_amount" DECIMAL(12,2),
    "scope" VARCHAR(16) NOT NULL,
    "min_order_amount" DECIMAL(12,2),
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "active_weekdays" JSONB NOT NULL DEFAULT '[]',
    "time_window_start" VARCHAR(5),
    "time_window_end" VARCHAR(5),
    "usage_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_targets" (
    "id" SERIAL NOT NULL,
    "discount_id" INTEGER NOT NULL,
    "category_id" INTEGER,
    "product_id" INTEGER,

    CONSTRAINT "discount_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discounts_code_key" ON "discounts"("code");

-- CreateIndex
CREATE INDEX "idx_discounts_active_window" ON "discounts"("is_archived", "is_active", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_discount_target_category" ON "discount_targets"("discount_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_discount_target_product" ON "discount_targets"("discount_id", "product_id");

-- CreateIndex
CREATE INDEX "idx_orders_discount_id" ON "orders"("discount_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_targets" ADD CONSTRAINT "discount_targets_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_targets" ADD CONSTRAINT "discount_targets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "master_data"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_targets" ADD CONSTRAINT "discount_targets_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing orders before adding CHECK constraint (Decision 12)
UPDATE "orders"
SET "subtotal_amount" = "total_amount",
    "discount_amount" = 0;

-- CHECK constraints (Hard Invariant 10 + Story 18)
ALTER TABLE "orders" ADD CONSTRAINT "chk_order_discount_amounts" CHECK (
    "discount_amount" >= 0 AND
    "discount_amount" <= "subtotal_amount" AND
    "total_amount" = ("subtotal_amount" - "discount_amount")
);

ALTER TABLE "discounts" ADD CONSTRAINT "chk_discount_value" CHECK (
    "value" > 0 AND
    ("value_type" <> 'PERCENT' OR "value" <= 100) AND
    ("max_discount_amount" IS NULL OR ("value_type" = 'PERCENT' AND "max_discount_amount" > 0)) AND
    ("min_order_amount" IS NULL OR "min_order_amount" > 0)
);

ALTER TABLE "discounts" ADD CONSTRAINT "chk_discount_usage" CHECK (
    "used_count" >= 0 AND
    ("usage_limit" IS NULL OR ("usage_limit" > 0 AND "used_count" <= "usage_limit"))
);

ALTER TABLE "discount_targets" ADD CONSTRAINT "chk_discount_target_one" CHECK (
    ("category_id" IS NOT NULL AND "product_id" IS NULL) OR
    ("category_id" IS NULL AND "product_id" IS NOT NULL)
);
