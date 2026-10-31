-- Avenants on running contracts (owner, 28/10/2026: vehicle change and registration change, from
-- the RMA platform's "AVENANT DE CHANGEMENT DE VEHICULE"). Each avenant brings a new attestation
-- that replaces the vehicle's earlier one (rule L28); the replaced paper comes back to the agency.

-- CreateEnum
CREATE TYPE "AmendmentKind" AS ENUM ('VEHICLE_CHANGE', 'REGISTRATION_CHANGE');

-- AlterTable
ALTER TABLE "attestation" ADD COLUMN     "replacedById" UUID,
ADD COLUMN     "returnedAt" TIMESTAMPTZ(3),
ADD COLUMN     "returnedById" UUID;

-- AlterTable
ALTER TABLE "contract" ADD COLUMN     "amendmentsTotal" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "amendment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contractId" UUID NOT NULL,
    "kind" "AmendmentKind" NOT NULL,
    "number" VARCHAR(20),
    "effectiveDate" DATE NOT NULL,
    "amount" DECIMAL(14,2),
    "insurerReference" VARCHAR(120),
    "previousVehicleId" UUID,
    "vehicleId" UUID NOT NULL,
    "previousRegistration" VARCHAR(20),
    "registration" VARCHAR(20),
    "attestationId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amendment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "amendment_attestationId_key" ON "amendment"("attestationId");

-- CreateIndex
CREATE INDEX "amendment_previousVehicleId_idx" ON "amendment"("previousVehicleId");

-- CreateIndex
CREATE INDEX "amendment_vehicleId_idx" ON "amendment"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "amendment_contractId_number_key" ON "amendment"("contractId", "number");

-- CreateIndex
CREATE INDEX "attestation_replacedById_idx" ON "attestation"("replacedById");

-- AddForeignKey
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "amendment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation" ADD CONSTRAINT "attestation_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment" ADD CONSTRAINT "amendment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment" ADD CONSTRAINT "amendment_previousVehicleId_fkey" FOREIGN KEY ("previousVehicleId") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment" ADD CONSTRAINT "amendment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment" ADD CONSTRAINT "amendment_attestationId_fkey" FOREIGN KEY ("attestationId") REFERENCES "attestation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment" ADD CONSTRAINT "amendment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checks the database holds whatever the app sends.
ALTER TABLE "contract"
  ADD CONSTRAINT "contract_amendments_total_not_negative" CHECK ("amendmentsTotal" >= 0);
ALTER TABLE "amendment"
  ADD CONSTRAINT "amendment_number_format" CHECK ("number" IS NULL OR "number" ~ '^[0-9A-Z-]{1,20}$'),
  ADD CONSTRAINT "amendment_amount_not_negative" CHECK ("amount" IS NULL OR "amount" >= 0),
  ADD CONSTRAINT "amendment_reference_not_blank" CHECK ("insurerReference" IS NULL OR length(btrim("insurerReference")) > 0),
  -- A registration change keeps the vehicle and records both plates; a vehicle change changes it.
  ADD CONSTRAINT "amendment_kind_fields" CHECK (
    ("kind" = 'REGISTRATION_CHANGE' AND "previousVehicleId" = "vehicleId"
      AND "previousRegistration" IS NOT NULL AND "registration" IS NOT NULL)
    OR ("kind" = 'VEHICLE_CHANGE' AND "previousVehicleId" IS DISTINCT FROM "vehicleId"
      AND "previousRegistration" IS NULL AND "registration" IS NULL)
  );
ALTER TABLE "attestation"
  ADD CONSTRAINT "attestation_return" CHECK (("returnedAt" IS NULL) = ("returnedById" IS NULL)),
  ADD CONSTRAINT "attestation_returned_when_replaced" CHECK ("returnedAt" IS NULL OR "replacedById" IS NOT NULL);

-- Append-only, like the contract's status history, even for the table owner.
CREATE FUNCTION "amendment_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'amendment is append-only';
END;
$$;
CREATE TRIGGER "amendment_no_update_delete"
  BEFORE UPDATE OR DELETE ON "amendment"
  FOR EACH ROW EXECUTE FUNCTION "amendment_reject_change"();
GRANT SELECT, INSERT ON "amendment" TO app_runtime;
