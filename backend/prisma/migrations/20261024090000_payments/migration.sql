-- Payments received at the agency (Phase 7): receipts REC-YYYY-NNNNN, reversals instead of edits.

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHEQUE', 'TRANSFER', 'CARD', 'OTHER');

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receiptNumber" VARCHAR(16) NOT NULL,
    "contractId" UUID NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" VARCHAR(80),
    "payerName" VARCHAR(120),
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" UUID NOT NULL,
    "reversesId" UUID,
    "reason" VARCHAR(300),
    "idempotencyKey" UUID NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_receiptNumber_key" ON "payment"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversesId_key" ON "payment"("reversesId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_idempotencyKey_key" ON "payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_contractId_idx" ON "payment"("contractId");

-- CreateIndex
CREATE INDEX "payment_receivedAt_idx" ON "payment"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_id_contractId_key" ON "payment"("id", "contractId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversesId_contractId_key" ON "payment"("reversesId", "contractId");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_reversesId_contractId_fkey" FOREIGN KEY ("reversesId", "contractId") REFERENCES "payment"("id", "contractId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written protections (Prisma cannot express them) ---------------------------------

ALTER TABLE "payment"
  ADD CONSTRAINT "payment_receipt_format" CHECK ("receiptNumber" ~ '^REC-[0-9]{4}-[0-9]{5}$'),
  -- A payment is positive; a reversal is negative, names the payment it cancels and says why.
  ADD CONSTRAINT "payment_kind" CHECK (
    ("kind" = 'PAYMENT' AND "amount" > 0 AND "reversesId" IS NULL AND "reason" IS NULL)
    OR ("kind" = 'REVERSAL' AND "amount" < 0 AND "reversesId" IS NOT NULL
        AND length(btrim(coalesce("reason", ''))) > 0)
  ),
  -- Cheques, transfers and "other" always carry their reference.
  ADD CONSTRAINT "payment_reference" CHECK (
    "kind" = 'REVERSAL' OR "method" NOT IN ('CHEQUE', 'TRANSFER', 'OTHER')
    OR length(btrim(coalesce("reference", ''))) > 0
  ),
  ADD CONSTRAINT "payment_not_own_reversal" CHECK ("reversesId" IS NULL OR "reversesId" <> "id");

-- A reversal cancels exactly the amount of its payment.
CREATE FUNCTION "payment_check_reversal"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  original numeric;
BEGIN
  IF NEW."kind" = 'REVERSAL' THEN
    SELECT "amount" INTO original FROM "payment" WHERE "id" = NEW."reversesId" AND "kind" = 'PAYMENT';
    IF original IS NULL OR NEW."amount" <> -original THEN
      RAISE EXCEPTION 'a reversal cancels the exact amount of a payment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "payment_reversal_amount"
  BEFORE INSERT ON "payment"
  FOR EACH ROW EXECUTE FUNCTION "payment_check_reversal"();

-- Payments are never changed or deleted, not even by the schema owner.
CREATE FUNCTION "payment_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'payment rows are never changed: record a reversal';
END;
$$;
CREATE TRIGGER "payment_no_update_delete"
  BEFORE UPDATE OR DELETE ON "payment"
  FOR EACH ROW EXECUTE FUNCTION "payment_reject_change"();

INSERT INTO "role_permission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "role" r
JOIN (VALUES
  ('ADMIN', 'payments.read'), ('ADMIN', 'payments.record'), ('ADMIN', 'payments.reverse'),
  ('MANAGER', 'payments.read'), ('MANAGER', 'payments.record'), ('MANAGER', 'payments.reverse'),
  ('AGENT', 'payments.read'), ('AGENT', 'payments.record'),
  ('AUDITOR', 'payments.read')
) AS p(role_code, permission) ON p.role_code = r."code";

-- Runtime role: insert and read only.
GRANT SELECT, INSERT ON "payment" TO app_runtime;
