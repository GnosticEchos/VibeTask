-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('CONSTITUTION', 'SPECIFICATION', 'BRAINSTORM', 'POST_MORTEM', 'IMPLEMENTATION_PLAN', 'OTHER');

-- CreateEnum
CREATE TYPE "DocLinkRole" AS ENUM ('SPECIFICATION', 'IMPLEMENTATION_PLAN', 'REFERENCE', 'ATTACHMENT');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "settings" JSONB;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "isContainer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentId" INTEGER,
ADD COLUMN     "planAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subBoardOutlineColor" TEXT;

-- CreateTable
CREATE TABLE "ProjectDocument" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "docType" "DocType" NOT NULL DEFAULT 'SPECIFICATION',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDocumentLink" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "role" "DocLinkRole",
    "pinnedVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,

    CONSTRAINT "TaskDocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskMonitorPass" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "columnId" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "passedAt" TIMESTAMP(3),

    CONSTRAINT "TaskMonitorPass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectDocument_projectId_idx" ON "ProjectDocument"("projectId");

-- CreateIndex
CREATE INDEX "ProjectDocument_createdById_idx" ON "ProjectDocument"("createdById");

-- CreateIndex
CREATE INDEX "TaskDocumentLink_projectId_idx" ON "TaskDocumentLink"("projectId");

-- CreateIndex
CREATE INDEX "TaskDocumentLink_documentId_idx" ON "TaskDocumentLink"("documentId");

-- CreateIndex
CREATE INDEX "TaskDocumentLink_taskId_idx" ON "TaskDocumentLink"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDocumentLink_taskId_documentId_key" ON "TaskDocumentLink"("taskId", "documentId");

-- CreateIndex
CREATE INDEX "TaskMonitorPass_taskId_idx" ON "TaskMonitorPass"("taskId");

-- CreateIndex
CREATE INDEX "TaskMonitorPass_columnId_idx" ON "TaskMonitorPass"("columnId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskMonitorPass_taskId_columnId_key" ON "TaskMonitorPass"("taskId", "columnId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDocumentLink" ADD CONSTRAINT "TaskDocumentLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDocumentLink" ADD CONSTRAINT "TaskDocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMonitorPass" ADD CONSTRAINT "TaskMonitorPass_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
