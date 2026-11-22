-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "item_source" VARCHAR(16) NOT NULL DEFAULT 'POS_COUNTER';

-- CreateIndex
CREATE INDEX "idx_order_items_qr_pending" ON "order_items"("kitchen_status", "item_source", "created_at");

-- CreateIndex
CREATE INDEX "idx_orders_qr_pending" ON "orders"("status", "order_source", "created_at");

-- Backfill round-1 items of existing QR orders and enforce allowed item_source values
UPDATE "order_items" oi
SET "item_source" = 'QR_CODE'
FROM "orders" o
WHERE oi."order_id" = o."id"
  AND o."order_source" = 'QR_CODE'
  AND oi."batch_no" = 1;

ALTER TABLE "order_items"
  ADD CONSTRAINT "chk_order_item_source"
  CHECK ("item_source" IN ('POS_COUNTER', 'QR_CODE'));
