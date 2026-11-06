-- In-app alerts (owner, 05/11/2026): a bell with what is new, a pop-up while working, and the
-- history of who did what. Team activity is written in the transaction of the action; renewals
-- at 30/15/7 days, long unpaid balances, late remittances and low stock once each when the
-- application checks. Each alert is seen by the users holding its permission.

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('ACTIVITY', 'RENEWAL_DUE', 'UNPAID', 'REMITTANCE_LATE', 'STOCK_LOW');

-- CreateTable
CREATE TABLE "notification" (
    "id" BIGSERIAL NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "action" VARCHAR(64),
    "permission" VARCHAR(64) NOT NULL,
    "dedupeKey" VARCHAR(120),
    "actorUserId" UUID,
    "entityType" VARCHAR(32),
    "entityId" VARCHAR(64),
    "data" JSONB NOT NULL,
    "link" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_seen" (
    "userId" UUID NOT NULL,
    "seenAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_seen_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_dedupeKey_key" ON "notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_createdAt_idx" ON "notification"("createdAt");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_seen" ADD CONSTRAINT "notification_seen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written protections ---------------------------------------------------------------

ALTER TABLE "notification"
  ADD CONSTRAINT "notification_permission" CHECK ("permission" ~ '^[a-z]+(\.[a-z]+)+$'),
  ADD CONSTRAINT "notification_data_object" CHECK (jsonb_typeof("data") = 'object'),
  -- Links stay inside the application.
  ADD CONSTRAINT "notification_link" CHECK ("link" ~ '^/[A-Za-z0-9/?=&_.-]*$'),
  -- Team activity names who did it and what; an alert of the day is written once.
  ADD CONSTRAINT "notification_activity" CHECK (
    ("kind" = 'ACTIVITY' AND "action" IS NOT NULL AND "actorUserId" IS NOT NULL)
    OR ("kind" <> 'ACTIVITY' AND "dedupeKey" IS NOT NULL)
  );

-- The history never changes: alerts are neither edited nor deleted (TRUNCATE is reserved for
-- test resets).
CREATE FUNCTION "notification_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'notification is append-only';
END;
$$;
CREATE TRIGGER "notification_no_update_delete"
  BEFORE UPDATE OR DELETE ON "notification"
  FOR EACH ROW EXECUTE FUNCTION "notification_reject_change"();

GRANT SELECT, INSERT ON "notification" TO app_runtime;
GRANT USAGE ON SEQUENCE "notification_id_seq" TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON "notification_seen" TO app_runtime;
