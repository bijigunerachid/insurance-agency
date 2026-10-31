-- What the customer really handed over when the agency rounded a cash payment (owner, 29/10/2026:
-- 751,55 paid with 752,00, 750,66 with 750,00). The payment amount stays the exact premium owed to
-- the insurer (rule L4); the difference is the agency's own cash gap, kept with the payment, which
-- is never updated or deleted.
ALTER TABLE "payment" ADD COLUMN "clientPaid" DECIMAL(14,2);
ALTER TABLE "payment"
  ADD CONSTRAINT "payment_client_paid" CHECK (
    "clientPaid" IS NULL
    OR ("kind" = 'PAYMENT' AND "method" = 'CASH' AND "clientPaid" > 0 AND "clientPaid" <> "amount")
  );
