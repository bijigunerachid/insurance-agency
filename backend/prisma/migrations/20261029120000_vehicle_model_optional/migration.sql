-- The vehicle model is optional: the RMA platform sheet prints the make alone ("RENAULT"), never the
-- model (owner, 29/10/2026). When given, it is not blank.
ALTER TABLE "vehicle" ALTER COLUMN "model" DROP NOT NULL;
ALTER TABLE "vehicle"
  ADD CONSTRAINT "vehicle_model_not_blank" CHECK ("model" IS NULL OR length(btrim("model")) > 0);
