-- Scans of the documents printed by the RMA and CAT platforms, attached to contracts. Files live on
-- the server's disk; rows are never changed except to record a removal, once.

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ATTESTATION', 'CONDITIONS_PARTICULIERES', 'QUITTANCE', 'NOTE_DE_COUVERTURE');

-- CreateTable
CREATE TABLE "document" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contractId" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "originalName" VARCHAR(200) NOT NULL,
    "mimeType" VARCHAR(40) NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storageKey" VARCHAR(80) NOT NULL,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" UUID NOT NULL,
    "replacesId" UUID,
    "removedAt" TIMESTAMPTZ(3),
    "removedById" UUID,
    "removeReason" VARCHAR(300),

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_storageKey_key" ON "document"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "document_replacesId_key" ON "document"("replacesId");

-- CreateIndex
CREATE INDEX "document_contractId_idx" ON "document"("contractId");

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written protections (Prisma cannot express them) ---------------------------------

ALTER TABLE "document"
  ADD CONSTRAINT "document_mime_type" CHECK ("mimeType" IN ('application/pdf', 'image/jpeg', 'image/png')),
  ADD CONSTRAINT "document_size" CHECK ("size" > 0 AND "size" <= 10485760),
  ADD CONSTRAINT "document_sha256" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "document_storage_key" CHECK ("storageKey" ~ '^[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}$'),
  ADD CONSTRAINT "document_name" CHECK (length(btrim("originalName")) > 0),
  ADD CONSTRAINT "document_not_own_replacement" CHECK ("replacesId" IS NULL OR "replacesId" <> "id"),
  -- Removed: when, by whom and why, all together.
  ADD CONSTRAINT "document_removal" CHECK (
    ("removedAt" IS NULL AND "removedById" IS NULL AND "removeReason" IS NULL)
    OR ("removedAt" IS NOT NULL AND "removedById" IS NOT NULL
        AND length(btrim(coalesce("removeReason", ''))) > 0)
  );

-- The same file is attached once to a contract, unless it was removed.
CREATE UNIQUE INDEX "document_contract_file" ON "document"("contractId", "sha256") WHERE "removedAt" IS NULL;

-- A replacement is a scan of the same contract and type, and only replaces a document in place.
CREATE FUNCTION "document_check_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."removedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'a document is added before it can be removed';
  END IF;
  IF NEW."replacesId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "document"
    WHERE "id" = NEW."replacesId" AND "contractId" = NEW."contractId" AND "type" = NEW."type"
      AND "removedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'a document replaces one of the same contract and type that is not removed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "document_insert"
  BEFORE INSERT ON "document"
  FOR EACH ROW EXECUTE FUNCTION "document_check_insert"();

-- A document is never edited or deleted; it can only be removed, once.
CREATE FUNCTION "document_check_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'documents are never deleted: remove them with a reason';
  END IF;
  IF OLD."removedAt" IS NOT NULL OR NEW."removedAt" IS NULL
     OR (to_jsonb(NEW) - 'removedAt' - 'removedById' - 'removeReason')
        <> (to_jsonb(OLD) - 'removedAt' - 'removedById' - 'removeReason') THEN
    RAISE EXCEPTION 'a document is only removed, once';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "document_no_change"
  BEFORE UPDATE OR DELETE ON "document"
  FOR EACH ROW EXECUTE FUNCTION "document_check_change"();

INSERT INTO "role_permission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "role" r
JOIN (VALUES
  ('ADMIN', 'documents.read'), ('ADMIN', 'documents.download'), ('ADMIN', 'documents.upload'), ('ADMIN', 'documents.remove'),
  ('MANAGER', 'documents.read'), ('MANAGER', 'documents.download'), ('MANAGER', 'documents.upload'), ('MANAGER', 'documents.remove'),
  ('AGENT', 'documents.read'), ('AGENT', 'documents.download'), ('AGENT', 'documents.upload'),
  ('AUDITOR', 'documents.read')
) AS p(role_code, permission) ON p.role_code = r."code";

-- Runtime role: insert and read; only the removal columns can change.
GRANT SELECT, INSERT ON "document" TO app_runtime;
GRANT UPDATE ("removedAt", "removedById", "removeReason") ON "document" TO app_runtime;
