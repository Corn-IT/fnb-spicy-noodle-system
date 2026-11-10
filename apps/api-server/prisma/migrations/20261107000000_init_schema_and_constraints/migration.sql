-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "master_data" (
    "id" SERIAL NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "normalized_name" VARCHAR(255) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" SERIAL NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "short_name" VARCHAR(64) NOT NULL,
    "dob" DATE,
    "phone" VARCHAR(32),
    "address" TEXT,
    "citizen_id" VARCHAR(32),
    "citizen_id_issued_place" VARCHAR(255),
    "position_id" INTEGER,
    "specialty_id" INTEGER,
    "start_date" DATE,
    "bank_name" VARCHAR(255),
    "bank_account_no" VARCHAR(64),
    "bank_account_name" VARCHAR(255),
    "avatar_url" VARCHAR(2048),
    "attachment_urls" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "ui_preferences" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dining_tables" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "qr_token" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE',
    "active_order_id" INTEGER,

    CONSTRAINT "dining_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "station" VARCHAR(16) NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "image_url" VARCHAR(2048),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_items" (
    "parent_product_id" INTEGER NOT NULL,
    "child_product_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "combo_items_pkey" PRIMARY KEY ("parent_product_id","child_product_id")
);

-- CreateTable
CREATE TABLE "modifier_groups" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "max_select" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifiers" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "extra_price" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "order_code" VARCHAR(32) NOT NULL,
    "order_type" VARCHAR(16) NOT NULL,
    "order_source" VARCHAR(16) NOT NULL,
    "table_id" INTEGER,
    "takeaway_number" INTEGER,
    "status" VARCHAR(16) NOT NULL,
    "payment_method" VARCHAR(16),
    "cash_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transfer_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "merged_into_order_id" INTEGER,
    "table_transfer_logs" JSONB NOT NULL DEFAULT '[]',
    "cashier_id" INTEGER,
    "note" TEXT,
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(6),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "modifiers_snapshot" JSONB NOT NULL DEFAULT '[]',
    "item_note" TEXT,
    "batch_no" INTEGER NOT NULL DEFAULT 1,
    "kitchen_status" VARCHAR(16) NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_imports" (
    "id" SERIAL NOT NULL,
    "ingredient_mdm_id" INTEGER NOT NULL,
    "item_name_snapshot" VARCHAR(255) NOT NULL,
    "unit_name" VARCHAR(64) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "total_cost" DECIMAL(12,2) NOT NULL,
    "payment_source" VARCHAR(16) NOT NULL DEFAULT 'CASH_DRAWER',
    "import_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "note" TEXT,
    "created_by" INTEGER NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_drawer_settlements" (
    "id" SERIAL NOT NULL,
    "settlement_date" DATE NOT NULL,
    "shift_name" VARCHAR(64) NOT NULL,
    "opening_budget" DECIMAL(12,2) NOT NULL,
    "total_cash_sales" DECIMAL(12,2) NOT NULL,
    "total_transfer_sales" DECIMAL(12,2) NOT NULL,
    "total_cash_imports" DECIMAL(12,2) NOT NULL,
    "expected_cash_in_drawer" DECIMAL(12,2) NOT NULL,
    "actual_counted_cash" DECIMAL(12,2) NOT NULL,
    "discrepancy_amount" DECIMAL(12,2) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "denominations_detail" JSONB NOT NULL DEFAULT '{}',
    "note" TEXT,
    "closed_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_drawer_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedules" (
    "id" SERIAL NOT NULL,
    "week_start_date" DATE NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "time_slot" VARCHAR(128) NOT NULL,
    "employee_ids" JSONB NOT NULL DEFAULT '[]',
    "created_by" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_mdm_category_normalized" ON "master_data"("category", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_citizen_id_key" ON "employees"("citizen_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "dining_tables_name_key" ON "dining_tables"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dining_tables_qr_token_key" ON "dining_tables"("qr_token");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_code_key" ON "orders"("order_code");

-- CreateIndex
CREATE INDEX "idx_orders_created_status" ON "orders"("created_at" DESC, "status", "payment_method");

-- CreateIndex
CREATE INDEX "idx_order_items_order_kitchen" ON "order_items"("order_id", "kitchen_status");

-- CreateIndex
CREATE INDEX "idx_settlements_date" ON "cash_drawer_settlements"("settlement_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_schedule_cell" ON "work_schedules"("week_start_date", "day_of_week", "time_slot");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "master_data"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "master_data"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_active_order_id_fkey" FOREIGN KEY ("active_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_child_product_id_fkey" FOREIGN KEY ("child_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "dining_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_merged_into_order_id_fkey" FOREIGN KEY ("merged_into_order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_imports" ADD CONSTRAINT "inventory_imports_ingredient_mdm_id_fkey" FOREIGN KEY ("ingredient_mdm_id") REFERENCES "master_data"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_imports" ADD CONSTRAINT "inventory_imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawer_settlements" ADD CONSTRAINT "cash_drawer_settlements_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints not expressible in the Prisma schema.
ALTER TABLE "orders" ADD CONSTRAINT "chk_order_type_target" CHECK (
  ("order_type" = 'DINE_IN' AND "table_id" IS NOT NULL AND "takeaway_number" IS NULL) OR
  ("order_type" = 'TAKEAWAY' AND "table_id" IS NULL AND "takeaway_number" IS NOT NULL)
);

ALTER TABLE "orders" ADD CONSTRAINT "chk_order_payment_amounts" CHECK (
  "status" <> 'PAID' OR (
    "payment_method" IS NOT NULL AND (
      ("payment_method" = 'CASH' AND "cash_amount" = "total_amount" AND "transfer_amount" = 0) OR
      ("payment_method" = 'TRANSFER' AND "transfer_amount" = "total_amount" AND "cash_amount" = 0) OR
      ("payment_method" = 'SPLIT' AND "cash_amount" > 0 AND "transfer_amount" > 0 AND ("cash_amount" + "transfer_amount") = "total_amount")
    )
  )
);

ALTER TABLE "orders" ADD CONSTRAINT "chk_order_amounts_nonnegative" CHECK (
  "cash_amount" >= 0 AND "transfer_amount" >= 0 AND "total_amount" >= 0
);

ALTER TABLE "combo_items" ADD CONSTRAINT "chk_combo_no_self_ref"
  CHECK ("parent_product_id" <> "child_product_id");

ALTER TABLE "combo_items" ADD CONSTRAINT "chk_combo_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "products" ADD CONSTRAINT "chk_product_price_nonnegative" CHECK ("price" >= 0);
ALTER TABLE "modifiers" ADD CONSTRAINT "chk_modifier_extra_price_nonnegative" CHECK ("extra_price" >= 0);
ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_item_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "inventory_imports" ADD CONSTRAINT "chk_import_amounts_valid" CHECK (
  "unit_price" >= 0 AND "quantity" > 0 AND "total_cost" >= 0
);
ALTER TABLE "inventory_imports" ADD CONSTRAINT "chk_import_total_cost_matches" CHECK (
  "total_cost" = ROUND("unit_price" * "quantity", 2)
);
ALTER TABLE "work_schedules" ADD CONSTRAINT "chk_schedule_day_of_week" CHECK ("day_of_week" BETWEEN 0 AND 6);
ALTER TABLE "orders" ADD CONSTRAINT "chk_void_reason_required" CHECK (
  "status" <> 'VOIDED' OR ("void_reason" IS NOT NULL AND length(trim("void_reason")) >= 10)
);
ALTER TABLE "cash_drawer_settlements" ADD CONSTRAINT "chk_settlement_amounts_nonnegative" CHECK (
  "opening_budget" >= 0 AND "total_cash_sales" >= 0 AND "total_transfer_sales" >= 0 AND
  "total_cash_imports" >= 0 AND "expected_cash_in_drawer" >= 0 AND "actual_counted_cash" >= 0
);
ALTER TABLE "cash_drawer_settlements" ADD CONSTRAINT "chk_settlement_status_amounts" CHECK (
  ("status" = 'MATCHED' AND "discrepancy_amount" = 0) OR
  ("status" = 'SURPLUS' AND "discrepancy_amount" > 0) OR
  ("status" = 'SHORTAGE' AND "discrepancy_amount" < 0)
);
ALTER TABLE "cash_drawer_settlements" ADD CONSTRAINT "chk_settlement_note_required" CHECK (
  "discrepancy_amount" = 0 OR length(trim(coalesce("note", ''))) > 0
);

CREATE UNIQUE INDEX "idx_one_active_order_per_table"
  ON "orders" ("table_id")
  WHERE "status" IN ('PENDING', 'SERVING') AND "table_id" IS NOT NULL;

CREATE INDEX "idx_imports_date_mdm"
  ON "inventory_imports" ("import_date" DESC, "ingredient_mdm_id")
  WHERE "is_deleted" = false;

