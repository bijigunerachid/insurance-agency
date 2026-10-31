-- Remittances of collected premiums to RMA and CAT (rule L5): bordereaux VER-YYYY-NNNNN, cancelled
-- with a reason instead of edited.

-- CreateEnum
CREATE TYPE "RemittanceMethod" AS ENUM ('TRANSFER', 'CHEQUE', 'PLATFORM', 'CASH', 'OTHER');

-- CreateTable
CREATE TABLE "remittance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" VARCHAR(16) NOT NULL,
    "insurerId" UUID NOT NULL,
    "collectedUntil" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "RemittanceMethod" NOT NULL,
    "reference" VARCHAR(80),
    "remittedOn" DATE NOT NULL,
    "note" VARCHAR(300),
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" UUID NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledById" UUID,
    "cancelReason" VARCHAR(300),
    "idempotencyKey" UUID NOT NULL,

    CONSTRAINT "remittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remittance_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "remittanceId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "released" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "remittance_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "remittance_number_key" ON "remittance"("number");

-- CreateIndex
CREATE UNIQUE INDEX "remittance_idempotencyKey_key" ON "remittance"("idempotencyKey");

-- CreateIndex
CREATE INDEX "remittance_insurerId_recordedAt_idx" ON "remittance"("insurerId", "recordedAt");

-- CreateIndex
CREATE INDEX "remittance_item_paymentId_idx" ON "remittance_item"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "remittance_item_remittanceId_paymentId_key" ON "remittance_item"("remittanceId", "paymentId");

-- AddForeignKey
ALTER TABLE "remittance" ADD CONSTRAINT "remittance_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remittance" ADD CONSTRAINT "remittance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remittance" ADD CONSTRAINT "remittance_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remittance_item" ADD CONSTRAINT "remittance_item_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "remittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remittance_item" ADD CONSTRAINT "remittance_item_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written protections (Prisma cannot express them) ---------------------------------

ALTER TABLE "remittance"
  ADD CONSTRAINT "remittance_number_format" CHECK ("number" ~ '^VER-[0-9]{4}-[0-9]{5}$'),
  ADD CONSTRAINT "remittance_amount_positive" CHECK ("amount" > 0),
  -- Everything but cash carries its reference (transfer, cheque, platform…).
  ADD CONSTRAINT "remittance_reference" CHECK (
    "method" = 'CASH' OR length(btrim(coalesce("reference", ''))) > 0
  ),
  -- Cancelled: when, by whom and why, all together.
  ADD CONSTRAINT "remittance_cancellation" CHECK (
    ("cancelledAt" IS NULL AND "cancelledById" IS NULL AND "cancelReason" IS NULL)
    OR ("cancelledAt" IS NOT NULL AND "cancelledById" IS NOT NULL
        AND length(btrim(coalesce("cancelReason", ''))) > 0)
  );

-- A payment is in at most one remittance that is not cancelled.
CREATE UNIQUE INDEX "remittance_item_payment_open" ON "remittance_item"("paymentId") WHERE NOT "released";

-- An item belongs to a remittance of the payment's insurer, copies its amount, and is added only
-- to a remittance that is not cancelled.
CREATE FUNCTION "remittance_item_check_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  payment_amount numeric;
  payment_insurer uuid;
  remittance_insurer uuid;
  remittance_cancelled timestamptz;
BEGIN
  SELECT p."amount", c."insurerId" INTO payment_amount, payment_insurer
    FROM "payment" p JOIN "contract" c ON c."id" = p."contractId" WHERE p."id" = NEW."paymentId";
  SELECT "insurerId", "cancelledAt" INTO remittance_insurer, remittance_cancelled
    FROM "remittance" WHERE "id" = NEW."remittanceId";
  IF payment_insurer IS DISTINCT FROM remittance_insurer THEN
    RAISE EXCEPTION 'a remittance only includes payments of its insurer';
  END IF;
  IF NEW."amount" <> payment_amount THEN
    RAISE EXCEPTION 'a remittance item copies the amount of its payment';
  END IF;
  IF remittance_cancelled IS NOT NULL OR NEW."released" THEN
    RAISE EXCEPTION 'items are added only to a remittance that is not cancelled';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "remittance_item_insert"
  BEFORE INSERT ON "remittance_item"
  FOR EACH ROW EXECUTE FUNCTION "remittance_item_check_insert"();

-- An item only changes to "released", once its remittance is cancelled; it is never deleted.
CREATE FUNCTION "remittance_item_check_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'remittance items are never deleted';
  END IF;
  IF NEW."id" <> OLD."id" OR NEW."remittanceId" <> OLD."remittanceId"
     OR NEW."paymentId" <> OLD."paymentId" OR NEW."amount" <> OLD."amount"
     OR OLD."released" OR NOT NEW."released"
     OR NOT EXISTS (SELECT 1 FROM "remittance" WHERE "id" = NEW."remittanceId" AND "cancelledAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'a remittance item is only released when its remittance is cancelled';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "remittance_item_no_change"
  BEFORE UPDATE OR DELETE ON "remittance_item"
  FOR EACH ROW EXECUTE FUNCTION "remittance_item_check_change"();

-- A remittance is never edited or deleted; it can only be cancelled, once.
CREATE FUNCTION "remittance_check_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'remittances are never deleted: cancel them';
  END IF;
  IF OLD."cancelledAt" IS NOT NULL OR NEW."cancelledAt" IS NULL
     OR (to_jsonb(NEW) - 'cancelledAt' - 'cancelledById' - 'cancelReason')
        <> (to_jsonb(OLD) - 'cancelledAt' - 'cancelledById' - 'cancelReason') THEN
    RAISE EXCEPTION 'a remittance is only cancelled, once';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "remittance_no_change"
  BEFORE UPDATE OR DELETE ON "remittance"
  FOR EACH ROW EXECUTE FUNCTION "remittance_check_change"();

INSERT INTO "role_permission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "role" r
JOIN (VALUES
  ('ADMIN', 'remittances.read'), ('ADMIN', 'remittances.manage'),
  ('MANAGER', 'remittances.read'), ('MANAGER', 'remittances.manage'),
  ('AUDITOR', 'remittances.read')
) AS p(role_code, permission) ON p.role_code = r."code";

-- Runtime role: insert and read; only the cancellation columns and "released" can change.
GRANT SELECT, INSERT ON "remittance", "remittance_item" TO app_runtime;
GRANT UPDATE ("cancelledAt", "cancelledById", "cancelReason") ON "remittance" TO app_runtime;
GRANT UPDATE ("released") ON "remittance_item" TO app_runtime;
