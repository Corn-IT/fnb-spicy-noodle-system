-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "inventory_imports" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6);
