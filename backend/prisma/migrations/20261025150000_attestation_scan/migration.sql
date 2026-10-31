-- Scanned attestations read offline on the server, checked by an employee, then filed (customer,
-- vehicle, contract, attestation and the scan attached to the contract).

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'FILED', 'DISCARDED');

-- CreateTable
CREATE TABLE "attestation_scan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storageKey" VARCHAR(80) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "originalName" VARCHAR(200) NOT NULL,
    "mimeType" VARCHAR(40) NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL,
    "uploadedById" UUID NOT NULL,
    "text" VARCHAR(20000),
    "confidence" INTEGER,
    "proposed" JSONB NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "customerId" UUID,
    "vehicleId" UUID,
    "contractId" UUID,
    "documentId" UUID,
    "closedAt" TIMESTAMPTZ(3),
    "closedById" UUID,
    "discardReason" VARCHAR(300),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "attestation_scan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attestation_scan_storageKey_key" ON "attestation_scan"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "attestation_scan_documentId_key" ON "attestation_scan"("documentId");

-- CreateIndex
CREATE INDEX "attestation_scan_status_uploadedAt_idx" ON "attestation_scan"("status", "uploadedAt");

-- AddForeignKey
ALTER TABLE "attestation_scan" ADD CONSTRAINT "attestation_scan_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation_scan" ADD CONSTRAINT "attestation_scan_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation_scan" ADD CONSTRAINT "attestation_scan_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written protections ---------------------------------------------------------------

ALTER TABLE "attestation_scan"
  ADD CONSTRAINT "attestation_scan_mime_type" CHECK ("mimeType" IN ('application/pdf', 'image/jpeg', 'image/png')),
  ADD CONSTRAINT "attestation_scan_size" CHECK ("size" > 0 AND "size" <= 10485760),
  ADD CONSTRAINT "attestation_scan_sha256" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "attestation_scan_storage_key" CHECK ("storageKey" ~ '^[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}$'),
  ADD CONSTRAINT "attestation_scan_confidence" CHECK ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 100),
  ADD CONSTRAINT "attestation_scan_proposed_object" CHECK (jsonb_typeof("proposed") = 'object'),
  -- Filed: with its document and contract; set aside: with a reason; both: when and by whom.
  ADD CONSTRAINT "attestation_scan_closing" CHECK (
    ("status" = 'PENDING' AND "closedAt" IS NULL AND "closedById" IS NULL AND "discardReason" IS NULL AND "documentId" IS NULL)
    OR ("status" = 'FILED' AND "closedAt" IS NOT NULL AND "closedById" IS NOT NULL AND "documentId" IS NOT NULL
        AND "contractId" IS NOT NULL AND "discardReason" IS NULL)
    OR ("status" = 'DISCARDED' AND "closedAt" IS NOT NULL AND "closedById" IS NOT NULL
        AND length(btrim(coalesce("discardReason", ''))) > 0 AND "documentId" IS NULL)
  );

-- The same file waits once in the list of scans to process.
CREATE UNIQUE INDEX "attestation_scan_pending_file" ON "attestation_scan"("sha256") WHERE "status" = 'PENDING';

-- A scan that is filed or set aside never changes again; it is never deleted.
CREATE FUNCTION "attestation_scan_check_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'scans are never deleted: set them aside with a reason';
  END IF;
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'a filed or discarded scan never changes';
  END IF;
  IF NEW."storageKey" <> OLD."storageKey" OR NEW."sha256" <> OLD."sha256"
     OR NEW."uploadedById" <> OLD."uploadedById" OR NEW."uploadedAt" <> OLD."uploadedAt" THEN
    RAISE EXCEPTION 'the file of a scan never changes';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "attestation_scan_no_change"
  BEFORE UPDATE OR DELETE ON "attestation_scan"
  FOR EACH ROW EXECUTE FUNCTION "attestation_scan_check_change"();

INSERT INTO "role_permission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "role" r
JOIN (VALUES ('ADMIN', 'scans.manage'), ('MANAGER', 'scans.manage'), ('AGENT', 'scans.manage')) AS p(role_code, permission)
  ON p.role_code = r."code";

GRANT SELECT, INSERT ON "attestation_scan" TO app_runtime;
GRANT UPDATE ("status", "customerId", "vehicleId", "contractId", "documentId", "closedAt", "closedById",
  "discardReason", "version") ON "attestation_scan" TO app_runtime;
