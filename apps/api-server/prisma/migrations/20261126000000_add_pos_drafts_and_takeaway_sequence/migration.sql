CREATE TABLE "pos_drafts" (
  "id" VARCHAR(30) NOT NULL,
  "order_type" VARCHAR(16),
  "table_id" INTEGER,
  "items" JSONB NOT NULL DEFAULT '[]',
  "note" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_by" INTEGER NOT NULL,
  "updated_by" INTEGER NOT NULL,
  "submitted_order_id" INTEGER,
  "submit_idempotency_key" VARCHAR(128),
  "submitted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "pos_drafts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_drafts_revision_positive" CHECK ("revision" > 0),
  CONSTRAINT "pos_drafts_target_matches_type" CHECK (
    ("order_type" IS NULL AND "table_id" IS NULL)
    OR ("order_type" = 'TAKEAWAY' AND "table_id" IS NULL)
    OR ("order_type" = 'DINE_IN')
  )
);

CREATE UNIQUE INDEX "uq_pos_drafts_submitted_order" ON "pos_drafts"("submitted_order_id");
CREATE INDEX "idx_pos_drafts_active_updated" ON "pos_drafts"("submitted_at", "updated_at" DESC);

ALTER TABLE "pos_drafts"
  ADD CONSTRAINT "pos_drafts_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "dining_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "pos_drafts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pos_drafts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pos_drafts_submitted_order_id_fkey" FOREIGN KEY ("submitted_order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "takeaway_sequences" (
  "business_date" CHAR(8) NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "takeaway_sequences_pkey" PRIMARY KEY ("business_date"),
  CONSTRAINT "takeaway_sequences_last_number_nonnegative" CHECK ("last_number" >= 0)
);

-- Older TAKEAWAY -> DINE_IN MOVE paths left item flags set. Clear only flags
-- created before the logged conversion; later dine-in items may intentionally
-- carry their own takeaway flag and must remain untouched.
UPDATE "order_items" AS item
SET "is_takeaway" = FALSE
FROM "orders" AS order_row
JOIN "dining_tables" AS table_row ON table_row."id" = order_row."table_id"
WHERE item."order_id" = order_row."id"
  AND order_row."order_type" = 'DINE_IN'
  AND order_row."status" IN ('PENDING', 'SERVING')
  AND item."is_takeaway" = TRUE
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(order_row."table_transfer_logs") = 'array'
        THEN order_row."table_transfer_logs" ELSE '[]'::jsonb END
    ) AS transfer_log
    WHERE transfer_log->>'action' = 'MOVE'
      AND transfer_log->>'fromTable' ~ '^Mang về #[0-9]+$'
      AND transfer_log->>'toTable' = table_row."name"
      AND CASE
        WHEN pg_input_is_valid(transfer_log->>'timestamp', 'timestamptz')
          THEN item."created_at" <= (transfer_log->>'timestamp')::timestamptz
        ELSE FALSE
      END
  );
