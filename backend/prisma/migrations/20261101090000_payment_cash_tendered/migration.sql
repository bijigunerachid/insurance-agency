-- The cash the customer handed over, when the employee types it (owner, 30/10/2026: « Somme reçue /
-- Rendu », as on the agency's former receipt). The change given back is what was handed over minus
-- what the customer paid (the rounded sum when the agency rounded, else the amount); it is computed,
-- never stored. Cash only, and never less than what the customer paid.
ALTER TABLE "payment" ADD COLUMN "cashTendered" DECIMAL(14,2);
ALTER TABLE "payment"
  ADD CONSTRAINT "payment_cash_tendered" CHECK (
    "cashTendered" IS NULL
    OR (
      "kind" = 'PAYMENT'
      AND "method" = 'CASH'
      AND "cashTendered" >= COALESCE("clientPaid", "amount")
    )
  );
