-- CreateEnum
CREATE TYPE "SessionStage" AS ENUM ('PASSWORD_CHANGE', 'TOTP_ENROLL', 'TOTP_VERIFY', 'ACTIVE');

-- CreateTable
CREATE TABLE "role" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "requiresTwoFactor" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "roleId" INTEGER NOT NULL,
    "permission" VARCHAR(64) NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("roleId","permission")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "roleId" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lastFailedLoginAt" TIMESTAMPTZ(3),
    "lockedUntil" TIMESTAMPTZ(3),
    "totpSecret" VARCHAR(255),
    "totpEnabledAt" TIMESTAMPTZ(3),
    "totpLastStep" BIGINT,
    "passwordChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "stage" "SessionStage" NOT NULL,
    "pendingTotpSecret" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "reauthAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokedReason" VARCHAR(64),
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(255),

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" UUID,
    "action" VARCHAR(64) NOT NULL,
    "entityType" VARCHAR(64),
    "entityId" VARCHAR(64),
    "requestId" UUID,
    "ip" VARCHAR(64),
    "details" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_code_key" ON "role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_username_key" ON "app_user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "session_tokenHash_key" ON "session"("tokenHash");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "session_expiresAt_idx" ON "session"("expiresAt");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- CreateIndex
CREATE INDEX "audit_log_actorUserId_at_idx" ON "audit_log"("actorUserId", "at");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written additions (Prisma cannot express these). See docs/data-model.md §2.
-- ---------------------------------------------------------------------------

-- Integrity checks
ALTER TABLE "app_user"
  ADD CONSTRAINT "app_user_username_format" CHECK ("username" ~ '^[a-z0-9._-]{3,64}$'),
  ADD CONSTRAINT "app_user_failed_logins_nonneg" CHECK ("failedLogins" >= 0),
  ADD CONSTRAINT "app_user_version_positive" CHECK ("version" >= 1);
ALTER TABLE "session"
  ADD CONSTRAINT "session_expiry_after_creation" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "role_permission"
  ADD CONSTRAINT "role_permission_format" CHECK ("permission" ~ '^[a-z]+(\.[a-z]+)+$');

-- Roles (system configuration, not demo data). Permission codes: src/modules/auth/permissions.js
INSERT INTO "role" ("code", "name", "requiresTwoFactor") VALUES
  ('ADMIN',   'Administrateur', true),
  ('MANAGER', 'Responsable d''agence', true),
  ('AGENT',   'Agent', false),
  ('AUDITOR', 'Auditeur', false);

INSERT INTO "role_permission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "role" r
JOIN (VALUES
  ('ADMIN', 'system.health'),
  ('ADMIN', 'users.read'),
  ('ADMIN', 'users.manage'),
  ('ADMIN', 'audit.read'),
  ('MANAGER', 'system.health'),
  ('MANAGER', 'audit.read'),
  ('AUDITOR', 'audit.read')
) AS p(role_code, permission) ON p.role_code = r."code";

-- Audit log is append-only, even for the table owner (TRUNCATE is reserved for test resets).
CREATE FUNCTION "audit_log_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;
CREATE TRIGGER "audit_log_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_reject_change"();

-- Runtime role privileges (the role itself is created by `npm run db:roles`).
GRANT SELECT ON "role", "role_permission" TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON "app_user" TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "session" TO app_runtime;
GRANT SELECT, INSERT ON "audit_log" TO app_runtime;
GRANT USAGE ON SEQUENCE "audit_log_id_seq" TO app_runtime;