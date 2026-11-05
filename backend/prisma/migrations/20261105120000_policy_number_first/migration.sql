-- The insurer's policy number is the contract's number in the agency (owner, 05/11/2026): it is
-- recorded with the contract, while still a draft, instead of at the issue. A draft cancelled
-- before the insurer issued it (no insurer reference: never issued) no longer holds its number,
-- so a contract typed wrong and cancelled does not block the real one. The column stays nullable:
-- a contract recorded before this change may have none until it is issued (the service asks).

CREATE OR REPLACE FUNCTION "contract_policy_taken"(p_insurer uuid, p_policy text, p_id uuid, p_previous uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "contract" o
    WHERE o."insurerId" = p_insurer AND o."policyNumber" = p_policy
      AND o."id" IS DISTINCT FROM p_id
      AND NOT (o."status" = 'CANCELLED' AND o."insurerReference" IS NULL)
      AND "contract_chain_root"(o."id") IS DISTINCT FROM
          coalesce("contract_chain_root"(p_previous), p_id)
  )
$$;
