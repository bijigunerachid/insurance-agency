-- Rule L14 (loi 17-99 art. 123): a two-wheeler needs its fiscal power or its cylindrée. The CV only
-- matters for a cover below 50 million DH, and the RMA sheet of a moped prints the cylindrée, not the
-- CV (owner, 29/10/2026). Seats for paid passenger transport are unchanged.
ALTER TABLE "vehicle" DROP CONSTRAINT "vehicle_category_required";
ALTER TABLE "vehicle"
  ADD CONSTRAINT "vehicle_category_required" CHECK (
    ("category" NOT IN ('TAXI', 'PASSENGER_TRANSPORT') OR "seats" IS NOT NULL)
    AND ("category" <> 'MOTORCYCLE' OR "fiscalPowerCv" IS NOT NULL OR "engineCc" IS NOT NULL)
  );
