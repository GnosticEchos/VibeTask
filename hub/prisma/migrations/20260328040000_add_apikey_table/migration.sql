-- Better Auth @better-auth/api-key plugin table.
-- The model lived in schema.prisma but had no migration; databases that only ran `migrate deploy`
-- never created this table, causing Prisma P2021 and 500s on GET/POST /api/agents.
-- IF NOT EXISTS: safe when the table was already created via `prisma db push`.

CREATE TABLE IF NOT EXISTS "apikey" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT,
    "prefix" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "lastUsedAt" TIMESTAMP(3),
    "permissions" JSONB,
    "rateLimitEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitTimeWindow" INTEGER NOT NULL DEFAULT 86400000,
    "rateLimitMax" INTEGER NOT NULL DEFAULT 10,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "remaining" INTEGER,
    "lastRequest" TIMESTAMP(3),
    "refillInterval" INTEGER,
    "refillAmount" INTEGER,
    "lastRefillAt" TIMESTAMP(3),

    CONSTRAINT "apikey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "apikey_key_key" ON "apikey"("key");

CREATE INDEX IF NOT EXISTS "apikey_referenceId_idx" ON "apikey"("referenceId");

CREATE INDEX IF NOT EXISTS "apikey_key_idx" ON "apikey"("key");

CREATE INDEX IF NOT EXISTS "apikey_configId_idx" ON "apikey"("configId");
