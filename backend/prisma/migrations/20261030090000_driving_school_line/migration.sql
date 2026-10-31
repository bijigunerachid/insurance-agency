-- Driving schools are a product line of their own (owner, 29/10/2026): RMA prints them as the
-- « usage divers » AUTO-ECOLE TOURISME and AUTO-ECOLE 2 OU 3 ROUES (model D). The value is added on
-- its own, PostgreSQL using a new enum value only once it is committed.
ALTER TYPE "ProductLine" ADD VALUE 'DRIVING_SCHOOL';
