ALTER TABLE "inventory_imports"
  ADD COLUMN "supplier_mdm_id" INTEGER,
  ADD COLUMN "supplier_name_snapshot" VARCHAR(255);

ALTER TABLE "inventory_imports"
  ADD CONSTRAINT "inventory_imports_supplier_mdm_id_fkey"
  FOREIGN KEY ("supplier_mdm_id") REFERENCES "master_data"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_imports_supplier_mdm"
  ON "inventory_imports"("supplier_mdm_id")
  WHERE "supplier_mdm_id" IS NOT NULL;
