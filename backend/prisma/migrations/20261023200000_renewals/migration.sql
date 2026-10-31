-- Renewals (docs/data-model.md §3.5): listed 30 days before the end of an issued contract,
-- followed by an employee, renewed into a new draft contract or not renewed with a reason.

-- CreateEnum
CREATE TYPE "RenewalStatus" AS ENUM ('TO_PREPARE', 'CUSTOMER_CONTACTED', 'DOCUMENTS_COMPLETE', 'RENEWED', 'NOT_RENEWED');

-- AlterTable
ALTER TABLE "contract" ADD COLUMN     "previousContractId" UUID;

-- CreateTable
CREATE TABLE "renewal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contractId" UUID NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "RenewalStatus" NOT NULL DEFAULT 'TO_PREPARE',
    "assignedUserId" UUID NOT NULL,
    "renewedContractId" UUID,
    "outcomeReason" VARCHAR(300),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "renewal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renewal_event" (
    "id" BIGSERIAL NOT NULL,
    "renewalId" UUID NOT NULL,
    "fromStatus" "RenewalStatus",
    "toStatus" "RenewalStatus",
    "fromAssigneeId" UUID,
    "toAssigneeId" UUID,
    "note" VARCHAR(300),
    "userId" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renewal_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "renewal_contractId_key" ON "renewal"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "renewal_renewedContractId_key" ON "renewal"("renewedContractId");

-- CreateIndex
CREATE INDEX "renewal_status_dueDate_idx" ON "renewal"("status", "dueDate");

-- CreateIndex
CREATE INDEX "renewal_assignedUserId_idx" ON "renewal"("assignedUserId");

-- CreateIndex
CREATE INDEX "renewal_event_renewalId_at_idx" ON "renewal_event"("renewalId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "contract_previousContractId_key" ON "contract"("previousContractId");

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_previousContractId_fkey" FOREIGN KEY ("previousContractId") REFERENCES "contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewal" ADD CONSTRAINT "renewal_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewal" ADD CONSTRAINT "renewal_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewal" ADD CONSTRAINT "renewal_renewedContractId_fkey" FOREIGN KEY ("renewedContractId") REFERENCES "contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewal_event" ADD CONSTRAINT "renewal_event_renewalId_fkey" FOREIGN KEY ("renewalId") REFERENCES "renewal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewal_event" ADD CONSTRAINT "renewal_event_fromAssigneeId_fkey" FOREIGN KEY ("fromAssigneeId") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewal_event" ADD CONSTRAINT "renewal_event_toAssigneeId_fkey" FOREIGN KEY ("toAssigneeId") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewal_event" ADD CONSTRAINT "renewal_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written protections (Prisma cannot express them) ---------------------------------

ALTER TABLE "contract"
  ADD CONSTRAINT "contract_not_own_renewal" CHECK ("previousContractId" IS NULL OR "previousContractId" <> "id");

ALTER TABLE "renewal"
  -- A renewed contract names the new contract; a refused one says why.
  ADD CONSTRAINT "renewal_renewed_contract" CHECK (("status" = 'RENEWED') = ("renewedContractId" IS NOT NULL)),
  ADD CONSTRAINT "renewal_not_renewed_reason" CHECK (
    "status" <> 'NOT_RENEWED' OR length(btrim(coalesce("outcomeReason", ''))) > 0
  ),
  ADD CONSTRAINT "renewal_version_positive" CHECK ("version" >= 1);

ALTER TABLE "renewal_event"
  ADD CONSTRAINT "renewal_event_note_not_blank" CHECK ("note" IS NULL OR length(btrim("note")) > 0);

-- The follow-up history is append-only, like the audit log.
CREATE FUNCTION "renewal_event_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'renewal_event is append-only';
END;
$$;
CREATE TRIGGER "renewal_event_no_update_delete"
  BEFORE UPDATE OR DELETE ON "renewal_event"
  FOR EACH ROW EXECUTE FUNCTION "renewal_event_reject_change"();

INSERT INTO "role_permission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "role" r
JOIN (VALUES
  ('ADMIN', 'renewals.read'), ('ADMIN', 'renewals.write'), ('ADMIN', 'renewals.assign'),
  ('MANAGER', 'renewals.read'), ('MANAGER', 'renewals.write'), ('MANAGER', 'renewals.assign'),
  ('AGENT', 'renewals.read'), ('AGENT', 'renewals.write'),
  ('AUDITOR', 'renewals.read')
) AS p(role_code, permission) ON p.role_code = r."code";

-- Runtime role: renewals are never deleted; their history is insert-only.
GRANT SELECT, INSERT, UPDATE ON "renewal" TO app_runtime;
GRANT SELECT, INSERT ON "renewal_event" TO app_runtime;
GRANT USAGE ON SEQUENCE "renewal_event_id_seq" TO app_runtime;
