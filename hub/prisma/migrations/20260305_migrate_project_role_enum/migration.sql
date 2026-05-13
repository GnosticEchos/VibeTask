-- Migrate project role enum values from uppercase to title case
-- This migration updates existing ProjectUser records to use the new role format

-- Update OWNER to Owner
UPDATE "ProjectUser" SET "role" = 'Owner' WHERE "role" = 'OWNER';

-- Update ADMIN to Maintainer
UPDATE "ProjectUser" SET "role" = 'Maintainer' WHERE "role" = 'ADMIN';

-- Update MEMBER to Editor
UPDATE "ProjectUser" SET "role" = 'Editor' WHERE "role" = 'MEMBER';

-- Update VIEWER to Viewer
UPDATE "ProjectUser" SET "role" = 'Viewer' WHERE "role" = 'VIEWER';
