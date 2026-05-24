-- CreateEnum
CREATE TYPE "DelegationMode" AS ENUM ('FULL', 'COLUMN_BOUND');

-- AlterTable
ALTER TABLE "AgentDelegation"
ADD COLUMN "delegationMode" "DelegationMode" NOT NULL DEFAULT 'FULL',
ADD COLUMN "allowedMoveRange" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "restrictedColumnId" INTEGER;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "assigneeApiKeyId" TEXT;
