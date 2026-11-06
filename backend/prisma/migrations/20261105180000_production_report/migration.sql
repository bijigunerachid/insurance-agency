-- État de production (owner, 05/11/2026): the contracts issued in a period, as the agency's
-- printed sheet lists them. Every employee sees it: an agent their own production (the contracts
-- they recorded), management and the auditor everyone's. The Excel export stays reports.export.
INSERT INTO "role_permission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "role" r
JOIN (VALUES
  ('ADMIN', 'production.read'), ('ADMIN', 'production.all'),
  ('MANAGER', 'production.read'), ('MANAGER', 'production.all'),
  ('AUDITOR', 'production.read'), ('AUDITOR', 'production.all'),
  ('AGENT', 'production.read')
) AS p(role_code, permission) ON p.role_code = r."code";
