-- Reports (agency answers of 23/10/2026): seen by management and the auditor; exported as CSV or
-- Excel by management only (the export also needs a recent re-authentication, checked by the API).
INSERT INTO "role_permission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "role" r
JOIN (VALUES
  ('ADMIN', 'reports.read'), ('ADMIN', 'reports.export'),
  ('MANAGER', 'reports.read'), ('MANAGER', 'reports.export'),
  ('AUDITOR', 'reports.read')
) AS p(role_code, permission) ON p.role_code = r."code";
