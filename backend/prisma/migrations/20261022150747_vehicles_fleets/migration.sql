-- CreateEnum
CREATE TYPE "VehicleCategory" AS ENUM ('CAR', 'MOTORCYCLE', 'TAXI', 'PASSENGER_TRANSPORT', 'COMMERCIAL', 'TRIPORTEUR');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'OTHER');

-- CreateEnum
CREATE TYPE "TaxiType" AS ENUM ('PETIT', 'GRAND');

-- CreateEnum
CREATE TYPE "PassengerTransportKind" AS ENUM ('TOURISTIQUE', 'PERSONNEL', 'SCOLAIRE', 'AUTOCAR');

-- CreateTable
CREATE TABLE "fleet" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "createdById" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fleet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "fleetId" UUID,
    "registration" VARCHAR(20) NOT NULL,
    "registrationKey" VARCHAR(20) NOT NULL,
    "category" "VehicleCategory" NOT NULL,
    "make" VARCHAR(40) NOT NULL,
    "model" VARCHAR(60) NOT NULL,
    "firstRegistrationDate" DATE,
    "vin" VARCHAR(25),
    "fiscalPowerCv" INTEGER,
    "engineCc" INTEGER,
    "seats" INTEGER,
    "fuel" "FuelType",
    "taxiType" "TaxiType",
    "passengerTransportKind" "PassengerTransportKind",
    "createdById" UUID NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "archivedById" UUID,
    "archiveReason" VARCHAR(200),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fleet_id_customerId_key" ON "fleet"("id", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "fleet_customerId_name_key" ON "fleet"("customerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_registrationKey_key" ON "vehicle"("registrationKey");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_vin_key" ON "vehicle"("vin");

-- CreateIndex
CREATE INDEX "vehicle_ownerId_idx" ON "vehicle"("ownerId");

-- CreateIndex
CREATE INDEX "vehicle_fleetId_idx" ON "vehicle"("fleetId");

-- CreateIndex
CREATE INDEX "vehicle_archivedAt_idx" ON "vehicle"("archivedAt");

-- AddForeignKey
ALTER TABLE "fleet" ADD CONSTRAINT "fleet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet" ADD CONSTRAINT "fleet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_fleetId_ownerId_fkey" FOREIGN KEY ("fleetId", "ownerId") REFERENCES "fleet"("id", "customerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written additions. See docs/data-model.md §2 and docs/insurer-rules.md.
-- ---------------------------------------------------------------------------

ALTER TABLE "fleet"
  ADD CONSTRAINT "fleet_name_not_blank" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "fleet_version_positive" CHECK ("version" >= 1);

ALTER TABLE "vehicle"
  ADD CONSTRAINT "vehicle_registration_key_format" CHECK ("registrationKey" ~ '^[[:alnum:]]{3,20}$' AND "registrationKey" = upper("registrationKey")),
  ADD CONSTRAINT "vehicle_vin_format" CHECK ("vin" IS NULL OR "vin" ~ '^[A-Z0-9]{5,25}$'),
  ADD CONSTRAINT "vehicle_numbers_range" CHECK (
    ("seats" IS NULL OR "seats" BETWEEN 1 AND 100)
    AND ("fiscalPowerCv" IS NULL OR "fiscalPowerCv" BETWEEN 1 AND 100)
    AND ("engineCc" IS NULL OR "engineCc" BETWEEN 1 AND 20000)
  ),
  ADD CONSTRAINT "vehicle_first_registration_range" CHECK ("firstRegistrationDate" IS NULL OR "firstRegistrationDate" >= DATE '1900-01-01'),
  -- Rule L14 (loi 17-99 art. 123): seats for paid passenger transport, fiscal power for two-wheelers.
  ADD CONSTRAINT "vehicle_category_required" CHECK (
    ("category" NOT IN ('TAXI', 'PASSENGER_TRANSPORT') OR "seats" IS NOT NULL)
    AND ("category" <> 'MOTORCYCLE' OR "fiscalPowerCv" IS NOT NULL)
  ),
  -- Fields that only make sense for one category.
  ADD CONSTRAINT "vehicle_category_specific" CHECK (
    ("taxiType" IS NULL OR "category" = 'TAXI')
    AND ("passengerTransportKind" IS NULL OR "category" = 'PASSENGER_TRANSPORT')
  ),
  ADD CONSTRAINT "vehicle_archive_fields" CHECK (
    ("archivedAt" IS NULL AND "archivedById" IS NULL AND "archiveReason" IS NULL)
    OR ("archivedAt" IS NOT NULL AND "archivedById" IS NOT NULL AND "archiveReason" IS NOT NULL)
  ),
  ADD CONSTRAINT "vehicle_version_positive" CHECK ("version" >= 1);

INSERT INTO "role_permission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "role" r
JOIN (VALUES
  ('ADMIN', 'vehicles.read'), ('ADMIN', 'vehicles.write'), ('ADMIN', 'vehicles.archive'),
  ('MANAGER', 'vehicles.read'), ('MANAGER', 'vehicles.write'), ('MANAGER', 'vehicles.archive'),
  ('AGENT', 'vehicles.read'), ('AGENT', 'vehicles.write'),
  ('AUDITOR', 'vehicles.read')
) AS p(role_code, permission) ON p.role_code = r."code";

-- Runtime role: no DELETE (vehicles are archived, fleets kept for history).
GRANT SELECT, INSERT, UPDATE ON "fleet", "vehicle" TO app_runtime;