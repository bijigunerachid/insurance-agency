-- The guarantees the insurer's platform sheet prints for the contract (owner, 29/10/2026: a full
-- cover lists Dommages collision, Incendie, Vol… without a premium): kept as printed, read-only,
-- recorded when the contract is created or renewed from the sheet. Never a price of the app.
ALTER TABLE "contract" ADD COLUMN "guarantees" JSONB;
ALTER TABLE "contract"
  ADD CONSTRAINT "contract_guarantees_list" CHECK ("guarantees" IS NULL OR jsonb_typeof("guarantees") = 'array');
