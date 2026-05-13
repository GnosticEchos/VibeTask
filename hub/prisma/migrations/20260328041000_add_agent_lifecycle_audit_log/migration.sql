-- Agent lifecycle audit trail for /api/agents (create/update/delete/regenerate).
-- Model was added to schema.prisma without a migration; missing table caused P2021 on POST /api/agents
-- after Better Auth created the apikey row.
-- IF NOT EXISTS: safe if the table was already created via `prisma db push`.

CREATE TABLE IF NOT EXISTS "AgentLifecycleAuditLog" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedBy" INTEGER NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLifecycleAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AgentLifecycleAuditLog_apiKeyId_idx" ON "AgentLifecycleAuditLog"("apiKeyId");

CREATE INDEX IF NOT EXISTS "AgentLifecycleAuditLog_performedBy_idx" ON "AgentLifecycleAuditLog"("performedBy");

CREATE INDEX IF NOT EXISTS "AgentLifecycleAuditLog_action_idx" ON "AgentLifecycleAuditLog"("action");

CREATE INDEX IF NOT EXISTS "AgentLifecycleAuditLog_createdAt_idx" ON "AgentLifecycleAuditLog"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AgentLifecycleAuditLog_performedBy_fkey'
  ) THEN
    ALTER TABLE "AgentLifecycleAuditLog"
      ADD CONSTRAINT "AgentLifecycleAuditLog_performedBy_fkey"
      FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
