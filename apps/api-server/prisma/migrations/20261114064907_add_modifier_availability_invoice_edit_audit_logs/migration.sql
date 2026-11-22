-- AlterTable
ALTER TABLE "modifiers" ADD COLUMN     "is_available" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "pending_payment_edit" JSONB;

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "module" VARCHAR(32) NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "actor_id" INTEGER,
    "actor_full_name" VARCHAR(128) NOT NULL,
    "actor_username" VARCHAR(64) NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_audit_logs_module_created" ON "audit_logs"("module", "created_at" DESC);
