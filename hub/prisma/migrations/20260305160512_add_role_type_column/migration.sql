/*
  Warnings:

  - The `type` column on the `ProjectColumn` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "ProjectColumn" ADD COLUMN     "roleType" "ColumnType" DEFAULT 'STANDARD',
DROP COLUMN "type",
ADD COLUMN     "type" TEXT;
