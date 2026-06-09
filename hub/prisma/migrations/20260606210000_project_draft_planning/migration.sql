-- CreateEnum
CREATE TYPE "ProjectLifecycleStatus" AS ENUM ('DRAFT', 'ACTIVE');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "lifecycleStatus" "ProjectLifecycleStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Project" ADD COLUMN "planningMeta" JSONB;

-- Deduplicate prefixes before unique constraint (keep lowest id per prefix)
DELETE FROM "Project" p
USING "Project" p2
WHERE p."prefix" = p2."prefix" AND p.id > p2.id;

-- CreateIndex
CREATE UNIQUE INDEX "Project_prefix_key" ON "Project"("prefix");

-- CreateTable
CREATE TABLE "ProjectAcceptSession" (
    "id" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "userCode" VARCHAR(16) NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAcceptSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanningSkill" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" VARCHAR(64),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningSkill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanningSkillRevision" (
    "id" TEXT NOT NULL,
    "skillId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" INTEGER,
    "parentRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningSkillRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectPlanningSkillOverride" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPlanningSkillOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanningSkill_slug_key" ON "PlanningSkill"("slug");
CREATE UNIQUE INDEX "ProjectAcceptSession_userCode_key" ON "ProjectAcceptSession"("userCode");
CREATE INDEX "ProjectAcceptSession_projectId_idx" ON "ProjectAcceptSession"("projectId");
CREATE INDEX "ProjectAcceptSession_userId_idx" ON "ProjectAcceptSession"("userId");
CREATE INDEX "PlanningSkillRevision_skillId_idx" ON "PlanningSkillRevision"("skillId");
CREATE UNIQUE INDEX "ProjectPlanningSkillOverride_projectId_slug_key" ON "ProjectPlanningSkillOverride"("projectId", "slug");

ALTER TABLE "ProjectAcceptSession" ADD CONSTRAINT "ProjectAcceptSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanningSkillRevision" ADD CONSTRAINT "PlanningSkillRevision_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "PlanningSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectPlanningSkillOverride" ADD CONSTRAINT "ProjectPlanningSkillOverride_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
