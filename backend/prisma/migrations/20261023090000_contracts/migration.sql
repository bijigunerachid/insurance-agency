-- Contracts (Phase 6): docs/data-model.md §3.2. Numbers come from the insurer (rules L15, L27).

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'AWAITING_INSURER', 'ISSUED', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttestationMedium" AS ENUM ('PAPER', 'ELECTRONIC');

-- CreateTable
CREATE TABLE "contract" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ref" VARCHAR(20) NOT NULL,
    "customerId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "insurerId" UUID NOT NULL,
    "policyNumber" VARCHAR(40),
    "insurerReference" VARCHAR(120),
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "premiumTotal" DECIMAL(14,2),
    "tacitRenewal" BOOLEAN NOT NULL DEFAULT false,
    "noticeDays" INTEGER,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_vehicle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contractId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedById" UUID NOT NULL,
    "removedAt" TIMESTAMPTZ(3),
    "removedById" UUID,

    CONSTRAINT "contract_vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_status_change" (
    "id" BIGSERIAL NOT NULL,
    "contractId" UUID NOT NULL,
    "fromStatus" "ContractStatus",
    "toStatus" "ContractStatus" NOT NULL,
    "reason" VARCHAR(300),
    "insurerReference" VARCHAR(120),
    "effectiveDate" DATE,
    "userId" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_status_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attestation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contractId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "seriesId" UUID NOT NULL,
    "number" VARCHAR(20) NOT NULL,
    "provisional" BOOLEAN NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "medium" "AttestationMedium" NOT NULL DEFAULT 'PAPER',
    "coverNoteRef" VARCHAR(60),
    "duplicateOfId" UUID,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledById" UUID,
    "cancelReason" VARCHAR(200),
    "createdById" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_ref_key" ON "contract"("ref");

-- CreateIndex
CREATE INDEX "contract_customerId_idx" ON "contract"("customerId");

-- CreateIndex
CREATE INDEX "contract_status_idx" ON "contract"("status");

-- CreateIndex
CREATE INDEX "contract_endDate_idx" ON "contract"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "contract_insurerId_policyNumber_key" ON "contract"("insurerId", "policyNumber");

-- CreateIndex
CREATE INDEX "contract_vehicle_contractId_idx" ON "contract_vehicle"("contractId");

-- CreateIndex
CREATE INDEX "contract_vehicle_vehicleId_idx" ON "contract_vehicle"("vehicleId");

-- CreateIndex
CREATE INDEX "contract_status_change_contractId_at_idx" ON "contract_status_change"("contractId", "at");

-- CreateIndex
CREATE INDEX "attestation_contractId_idx" ON "attestation"("contractId");

-- CreateIndex
CREATE INDEX "attestation_vehicleId_idx" ON "attestation"("vehicleId");

-- CreateIndex
CREATE INDEX "attestation_seriesId_number_idx" ON "attestation"("seriesId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "product_id_insurerId_key" ON "product"("id", "insurerId");

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_productId_insurerId_fkey" FOREIGN KEY ("productId", "insurerId") REFERENCES "product"("id", "insurerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_vehicle" ADD CONSTRAINT "contract_vehicle_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_vehicle" ADD CONSTRAINT "contract_vehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_vehicle" ADD CONSTRAINT "contract_vehicle_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_vehicle" ADD CONSTRAINT "contract_vehicle_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_status_change" ADD CONSTRAINT "contract_status_change_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_status_change" ADD CONSTRAINT "contract_status_change_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "attestation_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "attestation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written protections (Prisma cannot express them) ---------------------------------

ALTER TABLE "contract"
  ADD CONSTRAINT "contract_ref_format" CHECK ("ref" ~ '^CTR-[0-9]{4}-[0-9]{5}$'),
  ADD CONSTRAINT "contract_dates" CHECK ("endDate" > "startDate"),
  ADD CONSTRAINT "contract_premium_not_negative" CHECK ("premiumTotal" IS NULL OR "premiumTotal" >= 0),
  ADD CONSTRAINT "contract_notice_days" CHECK ("noticeDays" IS NULL OR "noticeDays" BETWEEN 1 AND 365),
  ADD CONSTRAINT "contract_policy_not_blank" CHECK ("policyNumber" IS NULL OR length(btrim("policyNumber")) > 0),
  ADD CONSTRAINT "contract_reference_not_blank" CHECK ("insurerReference" IS NULL OR length(btrim("insurerReference")) > 0),
  -- An issued or suspended contract always carries the insurer's policy number and proof.
  ADD CONSTRAINT "contract_issued_has_policy" CHECK (
    "status" NOT IN ('ISSUED', 'SUSPENDED') OR ("policyNumber" IS NOT NULL AND "insurerReference" IS NOT NULL)
  ),
  ADD CONSTRAINT "contract_version_positive" CHECK ("version" >= 1);

-- A vehicle is covered once per contract at a time; removal says who and when.
CREATE UNIQUE INDEX "contract_vehicle_active_key" ON "contract_vehicle"("contractId", "vehicleId") WHERE "removedAt" IS NULL;
ALTER TABLE "contract_vehicle"
  ADD CONSTRAINT "contract_vehicle_removal" CHECK (("removedAt" IS NULL) = ("removedById" IS NULL));

ALTER TABLE "contract_status_change"
  ADD CONSTRAINT "contract_status_change_reason_not_blank" CHECK ("reason" IS NULL OR length(btrim("reason")) > 0),
  -- Cancelling always says why (agency answers, 22/10/2026).
  ADD CONSTRAINT "contract_status_change_cancel_reason" CHECK ("toStatus" <> 'CANCELLED' OR "reason" IS NOT NULL);

-- Status history is append-only, like the audit log.
CREATE FUNCTION "contract_status_change_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'contract_status_change is append-only';
END;
$$;
CREATE TRIGGER "contract_status_change_no_update_delete"
  BEFORE UPDATE OR DELETE ON "contract_status_change"
  FOR EACH ROW EXECUTE FUNCTION "contract_status_change_reject_change"();

ALTER TABLE "attestation"
  ADD CONSTRAINT "attestation_number_format" CHECK ("number" ~ '^[0-9]{1,20}$'),
  ADD CONSTRAINT "attestation_dates" CHECK ("validTo" > "validFrom"),
  -- Rule L23 (arrêté 213-05, art. 2): a provisional attestation lasts one month at most.
  ADD CONSTRAINT "attestation_provisional_one_month" CHECK (NOT "provisional" OR "validTo" < "validFrom" + interval '1 month'),
  ADD CONSTRAINT "attestation_not_own_duplicate" CHECK ("duplicateOfId" IS NULL OR "duplicateOfId" <> "id"),
  ADD CONSTRAINT "attestation_cancellation" CHECK (
    ("cancelledAt" IS NULL AND "cancelledById" IS NULL AND "cancelReason" IS NULL)
    OR ("cancelledAt" IS NOT NULL AND "cancelledById" IS NOT NULL AND length(btrim("cancelReason")) > 0)
  ),
  ADD CONSTRAINT "attestation_version_positive" CHECK ("version" >= 1);

-- One original per serial number in a series; a duplicate repeats the original's number (L26).
CREATE UNIQUE INDEX "attestation_series_number_key" ON "attestation"("seriesId", "number") WHERE "duplicateOfId" IS NULL;

INSERT INTO "role_permission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "role" r
JOIN (VALUES
  ('ADMIN', 'contracts.read'), ('ADMIN', 'contracts.write'), ('ADMIN', 'contracts.terminate'),
  ('MANAGER', 'contracts.read'), ('MANAGER', 'contracts.write'), ('MANAGER', 'contracts.terminate'),
  ('AGENT', 'contracts.read'), ('AGENT', 'contracts.write'),
  ('AUDITOR', 'contracts.read')
) AS p(role_code, permission) ON p.role_code = r."code";

-- Runtime role: contracts and attestations are never deleted; the status history is insert-only.
GRANT SELECT, INSERT, UPDATE ON "contract", "contract_vehicle", "attestation" TO app_runtime;
GRANT SELECT, INSERT ON "contract_status_change" TO app_runtime;
GRANT USAGE ON SEQUENCE "contract_status_change_id_seq" TO app_runtime;
