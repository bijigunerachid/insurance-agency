-- What the employee typed from an insurer document (attestation, conditions particulières, quittance,
-- note de couverture), one capture per document, compared with the records by the API.

-- CreateTable
CREATE TABLE "document_capture" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "documentId" UUID NOT NULL,
    "fields" JSONB NOT NULL,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL,
    "capturedById" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "document_capture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_capture_documentId_key" ON "document_capture"("documentId");

-- AddForeignKey
ALTER TABLE "document_capture" ADD CONSTRAINT "document_capture_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_capture" ADD CONSTRAINT "document_capture_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written protections ---------------------------------------------------------------

ALTER TABLE "document_capture"
  ADD CONSTRAINT "document_capture_fields_object" CHECK (jsonb_typeof("fields") = 'object'),
  -- A capture stays small: about twenty short printed values.
  ADD CONSTRAINT "document_capture_fields_size" CHECK (pg_column_size("fields") <= 8192);

INSERT INTO "role_permission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "role" r
JOIN (VALUES
  ('ADMIN', 'documents.capture'), ('MANAGER', 'documents.capture'), ('AGENT', 'documents.capture')
) AS p(role_code, permission) ON p.role_code = r."code";

-- Runtime role: a capture is created and corrected, never deleted.
GRANT SELECT, INSERT ON "document_capture" TO app_runtime;
GRANT UPDATE ("fields", "capturedAt", "capturedById", "version") ON "document_capture" TO app_runtime;
