#!/usr/bin/env bash
# Restore database from CSV dumps using psql
# Run with: bash prisma/full-restore.sh
set -e

DB_URL="${DATABASE_URL:-postgresql://postgres@localhost:5432/kanban_rewrite}"
DUMP_DIR="$(cd "$(dirname "$0")/DATADUMP" && pwd)"

echo "Clearing existing data..."
psql "$DB_URL" -c 'TRUNCATE "TaskDocumentLink", "ProjectDocument", "TaskLog", "TaskComment", "Task", "ProjectColumn", "ProjectUser", "Project", "User" CASCADE' 2>/dev/null || true

echo ""
echo "=== Restoring Users ==="
psql "$DB_URL" <<SQL
CREATE temp TABLE users_csv (
  "id" int, "email" text, "name" text, "surname" text, "avatarUrl" text,
  "role" text, "createdAt" timestamptz, "updatedAt" timestamptz
);
\copy users_csv FROM '$DUMP_DIR/users.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "User" (id, email, name, surname, "avatarUrl", "role", "createdAt", "updatedAt")
SELECT "id"::int, "email", "name", "surname", "avatarUrl", "role"::"UserRole", "createdAt", "updatedAt" FROM users_csv;
SELECT COUNT(*) as users FROM "User";
SQL

echo ""
echo "=== Restoring Projects ==="
psql "$DB_URL" <<SQL
CREATE temp TABLE projects_csv (
  "id" int, "name" text, "description" text, "prefix" text,
  "ownerId" int, "createdAt" timestamptz, "updatedAt" timestamptz
);
\copy projects_csv FROM '$DUMP_DIR/projects.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "Project" (id, name, description, prefix, "ownerId", "createdAt", "updatedAt")
SELECT "id", "name", NULLIF("description", '')::text, "prefix", "ownerId", "createdAt", "updatedAt" FROM projects_csv;
SELECT COUNT(*) as projects FROM "Project";
SQL

echo ""
echo "=== Restoring Project Columns ==="
psql "$DB_URL" <<SQL
CREATE temp TABLE cols_csv (
  "id" int, "name" text, "projectId" int, "order" int, "color" text,
  "type" text, "roleType" text, "description" text, "createdAt" timestamptz, "updatedAt" timestamptz
);
\copy cols_csv FROM '$DUMP_DIR/project_columns.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "ProjectColumn" (id, name, "projectId", "order", color, type, description, "createdAt", "updatedAt", "roleType")
SELECT "id", "name", "projectId", "order", NULLIF("color", '')::text, NULLIF("type", '')::text,
       NULLIF("description", '')::text, "createdAt", "updatedAt",
       COALESCE(NULLIF("roleType", '')::text, 'STANDARD')::"ColumnType" FROM cols_csv;
SELECT COUNT(*) as columns FROM "ProjectColumn";
SQL

echo ""
echo "=== Restoring Project Users ==="
psql "$DB_URL" <<SQL
CREATE temp TABLE pu_csv (
  "id" int, "userId" int, "projectId" int, "role" text,
  "createdAt" timestamptz, "updatedAt" timestamptz
);
\copy pu_csv FROM '$DUMP_DIR/project_users.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "ProjectUser" (id, "userId", "projectId", role, "createdAt", "updatedAt")
SELECT "id", "userId", "projectId", "role"::"ProjectRole", "createdAt", "updatedAt" FROM pu_csv;
SELECT COUNT(*) as members FROM "ProjectUser";
SQL

echo ""
echo "=== Restoring Tasks ==="
psql "$DB_URL" <<SQL
CREATE temp TABLE tasks_csv (
  "id" int, "projectId" int, "columnId" int, "name" text, "description" text,
  "identifier" text, "parentId" int, "order" int, "assigneeId" int, "createdById" int,
  "createdAt" timestamptz, "updatedAt" timestamptz
);
\copy tasks_csv FROM '$DUMP_DIR/tasks.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "Task" (id, name, description, "projectId", "projectColumnId", "createdById", "assigneeId", "order", identifier, "relationMode", "relationId", "createdAt", "updatedAt", "parentId", "isContainer", "planAccepted", "subBoardOutlineColor")
SELECT "id", "name", NULLIF("description", '')::text, "projectId",
       NULLIF("projectColumnId"::text, '')::int,
       "createdById", NULLIF("assigneeId"::text, '')::int,
       "order", "identifier",
       NULLIF("relationMode", '')::text,
       NULLIF("relationId"::text, '')::int,
       "createdAt", "updatedAt",
       NULLIF("parentId"::text, '')::int,
       COALESCE("isContainer", false),
       COALESCE("planAccepted", false),
       NULLIF("subBoardOutlineColor", '')::text
FROM tasks_csv;
SELECT COUNT(*) as tasks FROM "Task";
SQL

echo ""
echo "=== Restoring Task Comments ==="
psql "$DB_URL" <<SQL
CREATE temp TABLE comments_csv (
  "id" int, "taskId" int, "userId" int, "content" text,
  "createdAt" timestamptz, "updatedAt" timestamptz
);
\copy comments_csv FROM '$DUMP_DIR/task_comments.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "TaskComment" (id, "taskId", "userId", content, "createdAt", "updatedAt")
SELECT "id", "taskId", "userId", content, "createdAt", "updatedAt" FROM comments_csv;
SELECT COUNT(*) as comments FROM "TaskComment";
SQL

echo ""
echo "=== Restoring Task Logs ==="
psql "$DB_URL" <<SQL
CREATE temp TABLE logs_csv (
  "id" int, "taskId" int, "userId" int, "action" text, "details" text,
  "createdAt" timestamptz
);
\copy logs_csv FROM '$DUMP_DIR/task_logs.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "TaskLog" (id, "taskId", "userId", action, details, "createdAt")
SELECT "id", "taskId", "userId", action, details, "createdAt" FROM logs_csv;
SELECT COUNT(*) as logs FROM "TaskLog";
SQL

echo ""
echo "=== Restoring Project Documents ==="
psql "$DB_URL" <<SQL
CREATE temp TABLE docs_csv (
  "id" int, "projectId" int, "title" text, "content" text,
  "docType" text, "version" int, "createdById" int,
  "createdAt" timestamptz, "updatedAt" timestamptz
);
\copy docs_csv FROM '$DUMP_DIR/project_documents.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "ProjectDocument" (id, "projectId", title, content, "docType", version, "createdById", "createdAt", "updatedAt")
SELECT "id", "projectId", title, content, "docType"::"DocType", version, "createdById", "createdAt", "updatedAt" FROM docs_csv;
SELECT COUNT(*) as docs FROM "ProjectDocument";
SQL

echo ""
echo "=== Restoring Task Document Links ==="
if [ -s $DUMP_DIR/task_document_links.csv ]; then
  psql "$DB_URL" <<SQL
  CREATE temp TABLE links_csv (
    "id" int, "projectId" int, "taskId" int, "documentId" int,
    "role" text, "createdAt" timestamptz
  );
  \copy links_csv FROM '$DUMP_DIR/task_document_links.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "TaskDocumentLink" (id, "projectId", "taskId", "documentId", role, "pinnedVersion", "createdAt", "createdBy")
SELECT "id", "projectId", "taskId", "documentId",
       NULLIF("role", '')::"DocLinkRole",
       NULLIF("pinnedVersion"::text, '')::int,
       "createdAt", NULLIF("createdBy"::text, '')::int
FROM links_csv;
SELECT COUNT(*) as links FROM "TaskDocumentLink";
SQL
else
  echo "task_document_links.csv is empty or missing, skipping"
fi

echo ""
echo "=== Setting passwords ==="
HASH='95e21e2717da27e0b70c7a4bca082805:ca8efd7d992e51534f76a62a4801e9fed87a48f9f741e31fd805dabf4fce1abcc4cfd35085a5a1f9f76a859edbdc275189cbd13b84f3ba358eeca41bbd927d65'
psql "$DB_URL" -c "UPDATE \"User\" SET password = '$HASH' WHERE password IS NULL"

echo ""
echo "=== Creating Better Auth Account records ==="
psql "$DB_URL" -c "INSERT INTO \"Account\" (\"userId\", \"accountId\", \"providerId\", \"password\", \"createdAt\", \"updatedAt\")
  SELECT id, id::text, 'credential', '$HASH', NOW(), NOW()
  FROM \"User\"
  ON CONFLICT (\"providerId\", \"accountId\") DO NOTHING"

echo ""
echo "=== Final row counts ==="
psql "$DB_URL" -c "
SELECT 'User' as tbl, COUNT(*) as cnt FROM \"User\"
UNION ALL SELECT 'Project', COUNT(*) FROM \"Project\"
UNION ALL SELECT 'ProjectColumn', COUNT(*) FROM \"ProjectColumn\"
UNION ALL SELECT 'ProjectUser', COUNT(*) FROM \"ProjectUser\"
UNION ALL SELECT 'Task', COUNT(*) FROM \"Task\"
UNION ALL SELECT 'TaskComment', COUNT(*) FROM \"TaskComment\"
UNION ALL SELECT 'TaskLog', COUNT(*) FROM \"TaskLog\"
UNION ALL SELECT 'ProjectDocument', COUNT(*) FROM \"ProjectDocument\"
UNION ALL SELECT 'TaskDocumentLink', COUNT(*) FROM \"TaskDocumentLink\"
ORDER BY tbl"

echo ""
echo "✅ Restore complete!"
echo "All users can login with: <email> / admin1234"
