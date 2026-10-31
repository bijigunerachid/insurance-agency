-- A series' model is chosen in the catalogue (owner, 23/10/2026): the combination of a series and
-- a model is configuration, not a rule. The code keeps its printed form ("14 A"); its letter is
-- only the default model offered when a series is created.
ALTER TABLE "attestation_series" DROP CONSTRAINT "attestation_series_code_model";
