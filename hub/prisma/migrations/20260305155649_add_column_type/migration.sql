/*
  Warnings:

  - The `type` column on the `ProjectColumn` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "ColumnType" AS ENUM ('STANDARD', 'AGENT_REVIEW', 'AGENT_ONLY', 'COMPLETE');

-- AlterTable
ALTER TABLE "ProjectColumn" DROP COLUMN "type",
ADD COLUMN     "type" "ColumnType" DEFAULT 'STANDARD';
