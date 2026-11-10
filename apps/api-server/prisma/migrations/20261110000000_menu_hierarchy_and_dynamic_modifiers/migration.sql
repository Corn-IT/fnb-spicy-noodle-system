ALTER TABLE "products"
  ADD COLUMN "subtitle" VARCHAR(255),
  ADD COLUMN "category_id" INTEGER;

ALTER TABLE "products"
  ADD CONSTRAINT "products_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "master_data"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_products_category_id"
  ON "products"("category_id")
  WHERE "category_id" IS NOT NULL;

ALTER TABLE "modifier_groups"
  ADD COLUMN "is_auto_select" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allow_substitution" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "modifiers"
  ADD COLUMN "is_default_checked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "default_substitute_name" VARCHAR(128);
