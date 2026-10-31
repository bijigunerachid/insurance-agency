-- An electric two- or three-wheeler keeps the moped usage chosen on the insurer's platform while its
-- attestation is the white model D (Divers), as RMA issues it with the usage
-- « CYLINDRÉE < 50 CM3 VITESSE … », and as the ACAPS letter of 19/02/2026
-- puts electric vehicles under Divers. Any other insurer's usage still belongs to its own usage.
CREATE OR REPLACE FUNCTION "vehicle_insurer_usage_fits"() RETURNS trigger AS $$
DECLARE
  belongs "insurer_usage"."usageId"%TYPE;
  insurer_model "vehicle_usage"."modelCode"%TYPE;
  vehicle_model "vehicle_usage"."modelCode"%TYPE;
BEGIN
  IF NEW."insurerUsageId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT iu."usageId", u."modelCode" INTO belongs, insurer_model
    FROM "insurer_usage" iu JOIN "vehicle_usage" u ON u."id" = iu."usageId"
   WHERE iu."id" = NEW."insurerUsageId";
  IF NEW."usageId" IS NOT DISTINCT FROM belongs THEN
    RETURN NEW;
  END IF;
  SELECT "modelCode" INTO vehicle_model FROM "vehicle_usage" WHERE "id" = NEW."usageId";
  IF NEW."fuel" = 'ELECTRIC' AND insurer_model = 'E' AND vehicle_model = 'D' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'vehicle insurer usage does not belong to its usage'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'vehicle_insurer_usage_fits';
END;
$$ LANGUAGE plpgsql;

-- The fuel now counts too.
DROP TRIGGER "vehicle_insurer_usage_fits" ON "vehicle";
CREATE TRIGGER "vehicle_insurer_usage_fits"
  BEFORE INSERT OR UPDATE OF "insurerUsageId", "usageId", "fuel" ON "vehicle"
  FOR EACH ROW EXECUTE FUNCTION "vehicle_insurer_usage_fits"();
