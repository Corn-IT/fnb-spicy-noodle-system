-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "takeaway_label_format" VARCHAR(16);

ALTER TABLE "orders"
  ADD CONSTRAINT "chk_order_takeaway_label_format"
  CHECK (
    ("takeaway_label_format" IS NULL OR "takeaway_label_format" IN ('NUMBER', 'LETTER'))
    AND ("order_type" <> 'DINE_IN' OR "takeaway_label_format" IS NULL)
  );
