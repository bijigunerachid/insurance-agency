-- A provisional attestation may run exactly one month: the RMA platform prints it from 18H to 18H
-- the same day a month later, which does
-- not exceed the month of arrêté 213-05 art. 2 (rule L23), like an annual attestation running to
-- the same day a year later. Longer stays refused.
ALTER TABLE "attestation" DROP CONSTRAINT "attestation_provisional_one_month";
ALTER TABLE "attestation"
  ADD CONSTRAINT "attestation_provisional_one_month" CHECK (NOT "provisional" OR "validTo" <= "validFrom" + interval '1 month');
