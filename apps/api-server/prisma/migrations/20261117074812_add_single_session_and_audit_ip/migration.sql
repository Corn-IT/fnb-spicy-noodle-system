-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "device_label" VARCHAR(128),
ADD COLUMN     "ip_address" VARCHAR(64);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "active_session_agent" VARCHAR(512),
ADD COLUMN     "active_session_at" TIMESTAMPTZ(6),
ADD COLUMN     "active_session_device" VARCHAR(128),
ADD COLUMN     "active_session_id" VARCHAR(64),
ADD COLUMN     "active_session_ip" VARCHAR(64),
ADD COLUMN     "last_revoked_notice" JSONB;

-- CreateIndex
CREATE INDEX "idx_audit_logs_ip" ON "audit_logs"("ip_address");
