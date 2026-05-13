-- CreateEnum
CREATE TYPE "AgentPermissionLevel" AS ENUM ('VIEWER', 'USER');

-- CreateTable
CREATE TABLE "AgentDelegation" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "permissionLevel" "AgentPermissionLevel" NOT NULL DEFAULT 'VIEWER',
    "delegatedById" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAuditLog" (
    "id" TEXT NOT NULL,
    "delegationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" INTEGER,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestBody" JSONB,
    "responseStatus" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentDelegation_apiKeyId_idx" ON "AgentDelegation"("apiKeyId");

-- CreateIndex
CREATE INDEX "AgentDelegation_projectId_idx" ON "AgentDelegation"("projectId");

-- CreateIndex
CREATE INDEX "AgentDelegation_delegatedById_idx" ON "AgentDelegation"("delegatedById");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDelegation_apiKeyId_projectId_key" ON "AgentDelegation"("apiKeyId", "projectId");

-- CreateIndex
CREATE INDEX "AgentAuditLog_delegationId_idx" ON "AgentAuditLog"("delegationId");

-- CreateIndex
CREATE INDEX "AgentAuditLog_createdAt_idx" ON "AgentAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AgentAuditLog_action_idx" ON "AgentAuditLog"("action");

-- AddForeignKey
ALTER TABLE "AgentDelegation" ADD CONSTRAINT "AgentDelegation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDelegation" ADD CONSTRAINT "AgentDelegation_delegatedById_fkey" FOREIGN KEY ("delegatedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAuditLog" ADD CONSTRAINT "AgentAuditLog_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "AgentDelegation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
