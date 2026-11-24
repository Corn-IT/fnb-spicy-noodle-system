-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "session_id" VARCHAR(64),
    "endpoint" VARCHAR(2048) NOT NULL,
    "p256dh" VARCHAR(512) NOT NULL,
    "auth" VARCHAR(256) NOT NULL,
    "user_agent" VARCHAR(512),
    "device_label" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_notified_at" TIMESTAMPTZ(6),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_push_subscriptions_endpoint" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "idx_push_subscriptions_user_session" ON "push_subscriptions"("user_id", "session_id");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
