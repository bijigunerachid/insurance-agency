-- The formula chosen on the insurer's platform, printed at the end of each optional guarantee
-- (« RC », « BOOST RC », « RC POIDS LOURDS », « DC »; owner, 29/10/2026: RC = responsabilité civile,
-- DC = dommages collision). Kept as printed, recorded with the guarantees when the contract is
-- created or renewed from the sheet.
ALTER TABLE "contract" ADD COLUMN "formula" VARCHAR(40);
ALTER TABLE "contract"
  ADD CONSTRAINT "contract_formula_not_blank" CHECK ("formula" IS NULL OR btrim("formula") <> '');
