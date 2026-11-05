-- A renewal always has a new policy number (owner, 05/11/2026: the platform gives one each
-- year), so a contract of a renewal chain no longer shares the number of the contract it renews:
-- a policy number is unique per insurer, the only exception being a contract cancelled before
-- its issue (no insurer reference: never issued). The signature is kept for the trigger
-- "contract_policy_unique"; p_previous no longer changes the answer.

CREATE OR REPLACE FUNCTION "contract_policy_taken"(p_insurer uuid, p_policy text, p_id uuid, p_previous uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "contract" o
    WHERE o."insurerId" = p_insurer AND o."policyNumber" = p_policy
      AND o."id" IS DISTINCT FROM p_id
      AND NOT (o."status" = 'CANCELLED' AND o."insurerReference" IS NULL)
  )
$$;
