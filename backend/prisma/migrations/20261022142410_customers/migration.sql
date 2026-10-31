-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "IdentityType" AS ENUM ('CIN', 'PASSPORT', 'RESIDENCE_CARD');

-- CreateTable
CREATE TABLE "counter" (
    "type" VARCHAR(32) NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "counter_pkey" PRIMARY KEY ("type","year")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" UUID NOT NULL,
    "ref" VARCHAR(16) NOT NULL,
    "type" "CustomerType" NOT NULL,
    "firstName" VARCHAR(80),
    "lastName" VARCHAR(80),
    "legalName" VARCHAR(160),
    "ice" CHAR(15),
    "identityType" "IdentityType",
    "identityNumber" VARCHAR(32),
    "phone" VARCHAR(20),
    "email" VARCHAR(254),
    "addressLine" VARCHAR(200),
    "city" VARCHAR(80),
    "searchText" VARCHAR(400) NOT NULL,
    "assignedUserId" UUID,
    "createdById" UUID NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "archivedById" UUID,
    "archiveReason" VARCHAR(200),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_ref_key" ON "customer"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "customer_ice_key" ON "customer"("ice");

-- CreateIndex
CREATE INDEX "customer_phone_idx" ON "customer"("phone");

-- CreateIndex
CREATE INDEX "customer_assignedUserId_idx" ON "customer"("assignedUserId");

-- CreateIndex
CREATE INDEX "customer_archivedAt_idx" ON "customer"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_identityType_identityNumber_key" ON "customer"("identityType", "identityNumber");

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written additions. See docs/data-model.md §2.
-- ---------------------------------------------------------------------------

ALTER TABLE "counter"
  ADD CONSTRAINT "counter_value_positive" CHECK ("value" >= 1),
  ADD CONSTRAINT "counter_year_range" CHECK ("year" = 0 OR "year" BETWEEN 2000 AND 2200);

ALTER TABLE "customer"
  ADD CONSTRAINT "customer_ref_format" CHECK ("ref" ~ '^CLI-[0-9]{6,}$'),
  -- An individual has a first and last name and no company fields; a business has a legal name.
  ADD CONSTRAINT "customer_type_fields" CHECK (
    ("type" = 'INDIVIDUAL' AND "firstName" IS NOT NULL AND "lastName" IS NOT NULL
       AND "legalName" IS NULL AND "ice" IS NULL)
    OR ("type" = 'BUSINESS' AND "legalName" IS NOT NULL)
  ),
  ADD CONSTRAINT "customer_ice_format" CHECK ("ice" IS NULL OR "ice" ~ '^[0-9]{15}$'),
  ADD CONSTRAINT "customer_identity_pair" CHECK (("identityType" IS NULL) = ("identityNumber" IS NULL)),
  ADD CONSTRAINT "customer_identity_format" CHECK (
    "identityNumber" IS NULL
    OR ("identityType" = 'CIN' AND "identityNumber" ~ '^[A-Z]{1,2}[0-9]{1,7}$')
    OR ("identityType" <> 'CIN' AND "identityNumber" ~ '^[A-Z0-9]{5,20}$')
  ),
  ADD CONSTRAINT "customer_phone_format" CHECK ("phone" IS NULL OR "phone" ~ '^\+[0-9]{8,15}$'),
  ADD CONSTRAINT "customer_email_format" CHECK ("email" IS NULL OR "email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Archive fields are set together, and an archive always says why.
  ADD CONSTRAINT "customer_archive_fields" CHECK (
    ("archivedAt" IS NULL AND "archivedById" IS NULL AND "archiveReason" IS NULL)
    OR ("archivedAt" IS NOT NULL AND "archivedById" IS NOT NULL AND "archiveReason" IS NOT NULL)
  ),
  ADD CONSTRAINT "customer_version_positive" CHECK ("version" >= 1);

-- Permissions (codes in src/modules/auth/permissions.js), as approved in docs/security.md §4.2.
INSERT INTO "role_permission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "role" r
JOIN (VALUES
  ('ADMIN', 'customers.read'), ('ADMIN', 'customers.write'), ('ADMIN', 'customers.assign'),
  ('ADMIN', 'customers.archive'), ('ADMIN', 'customers.identity'),
  ('MANAGER', 'customers.read'), ('MANAGER', 'customers.write'), ('MANAGER', 'customers.assign'),
  ('MANAGER', 'customers.archive'), ('MANAGER', 'customers.identity'),
  ('AGENT', 'customers.read'), ('AGENT', 'customers.write'), ('AGENT', 'customers.reveal'),
  ('AUDITOR', 'customers.read')
) AS p(role_code, permission) ON p.role_code = r."code";

-- Runtime role: no DELETE on customers (archive only).
GRANT SELECT, INSERT, UPDATE ON "counter" TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON "customer" TO app_runtime;