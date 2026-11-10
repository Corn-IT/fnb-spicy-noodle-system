CREATE UNIQUE INDEX "uq_settlement_date_shift"
ON "cash_drawer_settlements"("settlement_date", "shift_name");

CREATE INDEX "idx_imports_created_payment"
ON "inventory_imports"("created_at", "payment_source", "is_deleted");
