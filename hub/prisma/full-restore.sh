#!/usr/bin/env bash
# Restore database from CSV dumps using psql
# Run with: bash prisma/full-restore.sh
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres@localhost:5432/kanban_rewrite}"
DUMP_DIR="$(cd "$(dirname "$0")/DATADUMP" && pwd)"

echo "Clearing existing data..."
psql "$DB_URL" -c 'TRUNCATE "TaskDocumentLink", "ProjectDocument", "TaskLog", "TaskComment", "Task", "ProjectColumn", "ProjectUser", "Project", "User" CASCADE' 2>/dev/null || true

echo ""
echo "=== Restoring Users ==="
psql "$DB_URL" <<SQL
CREATE TEMP TABLE users_csv (
  id int, name text, surname text, email text, password text, "avatarUrl" text
);
\copy users_csv FROM '$DUMP_DIR/users.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "User" (id, email, name, surname, "avatarUrl", role, "createdAt", "updatedAt")
SELECT id::int, email, name, surname, NULLIF("avatarUrl", ''),
       'USER'::"UserRole", NOW(), NOW()
FROM users_csv;
SELECT setval(pg_get_serial_sequence('"User"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "User"));
UPDATE "User" SET role = 'ADMIN' WHERE id = 1;
SELECT COUNT(*) AS users FROM "User";
SQL

echo ""
echo "=== Restoring Projects ==="
psql "$DB_URL" <<SQL
CREATE TEMP TABLE projects_csv (
  id int, name text, description text, "ownerId" int, prefix text
);
\copy projects_csv FROM '$DUMP_DIR/projects.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "Project" (id, name, description, prefix, "ownerId", "createdAt", "updatedAt")
SELECT id::int, name, NULLIF(description, ''), prefix, "ownerId"::int, NOW(), NOW()
FROM projects_csv;
SELECT setval(pg_get_serial_sequence('"Project"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "Project"));
SELECT COUNT(*) AS projects FROM "Project";
SQL

echo ""
echo "=== Restoring Project Columns ==="
psql "$DB_URL" <<SQL
CREATE TEMP TABLE cols_csv (
  id int, name text, "projectId" int, "order" int, color text, description text, type text
);
\copy cols_csv FROM '$DUMP_DIR/projectColumns.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "ProjectColumn" (id, name, "projectId", "order", color, type, description, "createdAt", "updatedAt", "roleType")
SELECT id::int, name, "projectId"::int, "order"::int,
       NULLIF(color, ''), NULLIF(type, ''), NULLIF(description, ''),
       NOW(), NOW(), 'STANDARD'::"ColumnType"
FROM cols_csv;
SELECT setval(pg_get_serial_sequence('"ProjectColumn"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "ProjectColumn"));
SELECT COUNT(*) AS columns FROM "ProjectColumn";
SQL

echo ""
echo "=== Restoring Project Users ==="
psql "$DB_URL" <<SQL
CREATE TEMP TABLE pu_csv (
  id int, "userId" int, "projectId" int, role text
);
\copy pu_csv FROM '$DUMP_DIR/projectUsers.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "ProjectUser" (id, "userId", "projectId", role, "createdAt", "updatedAt")
SELECT id::int, "userId"::int, "projectId"::int, role, NOW(), NOW()
FROM pu_csv;
SELECT setval(pg_get_serial_sequence('"ProjectUser"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "ProjectUser"));
SELECT COUNT(*) AS members FROM "ProjectUser";
SQL

echo ""
echo "=== Restoring Tasks ==="
psql "$DB_URL" <<SQL
CREATE TEMP TABLE tasks_csv (
  id int, name text, description text, "createdById" int, "assigneeId" int,
  "projectId" int, "projectColumnId" int, "order" int, identifier text,
  "relationMode" text, "relationId" int
);
\copy tasks_csv FROM '$DUMP_DIR/tasks.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "Task" (
  id, name, description, "projectId", "projectColumnId", "createdById", "assigneeId",
  "order", identifier, "relationMode", "relationId", "createdAt", "updatedAt"
)
SELECT id::int, name, NULLIF(description, ''), "projectId"::int, "projectColumnId"::int,
       "createdById"::int, NULLIF("assigneeId"::text, '')::int, "order"::int, identifier,
       NULLIF("relationMode", ''), NULLIF("relationId"::text, '')::int, NOW(), NOW()
FROM tasks_csv;
SELECT setval(pg_get_serial_sequence('"Task"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "Task"));
SELECT COUNT(*) AS tasks FROM "Task";
SQL

echo ""
echo "=== Restoring Task Comments ==="
psql "$DB_URL" <<SQL
CREATE TEMP TABLE comments_csv (
  id int, "taskId" int, "userId" int, content text
);
\copy comments_csv FROM '$DUMP_DIR/taskComments.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "TaskComment" (id, "taskId", "userId", content, "createdAt", "updatedAt")
SELECT id::int, "taskId"::int, "userId"::int, NULLIF(content, ''), NOW(), NOW()
FROM comments_csv;
SELECT setval(pg_get_serial_sequence('"TaskComment"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "TaskComment"));
SELECT COUNT(*) AS comments FROM "TaskComment";
SQL

echo ""
echo "=== Restoring Task Logs ==="
psql "$DB_URL" <<SQL
CREATE TEMP TABLE logs_csv (
  id int, "taskId" int, "userId" int, text text
);
\copy logs_csv FROM '$DUMP_DIR/taskLogs.csv' WITH (FORMAT csv, HEADER true, NULL '');
INSERT INTO "TaskLog" (id, "taskId", "userId", text, "createdAt", "updatedAt")
SELECT id::int, "taskId"::int, "userId"::int, NULLIF(text, ''), NOW(), NOW()
FROM logs_csv;
SELECT setval(pg_get_serial_sequence('"TaskLog"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "TaskLog"));
SELECT COUNT(*) AS logs FROM "TaskLog";
SQL

if [ -f "$DUMP_DIR/project_documents.csv" ]; then
  echo ""
  echo "=== Restoring Project Documents ==="
  psql "$DB_URL" <<SQL
  CREATE TEMP TABLE docs_csv (
    id int, "projectId" int, title text, content text,
    "docType" text, version int, "createdById" int,
    "createdAt" timestamptz, "updatedAt" timestamptz
  );
  \copy docs_csv FROM '$DUMP_DIR/project_documents.csv' WITH (FORMAT csv, HEADER true, NULL '');
  INSERT INTO "ProjectDocument" (id, "projectId", title, content, "docType", version, "createdById", "createdAt", "updatedAt")
  SELECT id, "projectId", title, content, "docType"::"DocType", version, "createdById", "createdAt", "updatedAt" FROM docs_csv;
  SELECT COUNT(*) AS docs FROM "ProjectDocument";
SQL
else
  echo ""
  echo "project_documents.csv not found, skipping"
fi

if [ -s "$DUMP_DIR/task_document_links.csv" ]; then
  echo ""
  echo "=== Restoring Task Document Links ==="
  psql "$DB_URL" <<SQL
  CREATE TEMP TABLE links_csv (
    id int, "projectId" int, "taskId" int, "documentId" int,
    role text, "createdAt" timestamptz
  );
  \copy links_csv FROM '$DUMP_DIR/task_document_links.csv' WITH (FORMAT csv, HEADER true, NULL '');
  INSERT INTO "TaskDocumentLink" (id, "projectId", "taskId", "documentId", role, "createdAt")
  SELECT id, "projectId", "taskId", "documentId", NULLIF(role, '')::"DocLinkRole", "createdAt"
  FROM links_csv;
  SELECT COUNT(*) AS links FROM "TaskDocumentLink";
SQL
else
  echo ""
  echo "task_document_links.csv is empty or missing, skipping"
fi

echo ""
echo "=== Setting passwords ==="
HASH='95e21e2717da27e0b70c7a4bca082805:ca8efd7d992e51534f76a62a4801e9fed87a48f9f741e31fd805dabf4fce1abcc4cfd35085a5a1f9f76a859edbdc275189cbd13b84f3ba358eeca41bbd927d65'
psql "$DB_URL" -c "UPDATE \"User\" SET password = '$HASH' WHERE password IS NULL OR password = ''"

echo ""
echo "=== Creating Better Auth Account records ==="
psql "$DB_URL" -c "INSERT INTO \"Account\" (\"userId\", \"accountId\", \"providerId\", \"password\", \"createdAt\", \"updatedAt\")
  SELECT id, id::text, 'credential', '$HASH', NOW(), NOW()
  FROM \"User\"
  ON CONFLICT (\"providerId\", \"accountId\") DO NOTHING"

echo ""
echo "=== Final row counts ==="
psql "$DB_URL" -c "
SELECT 'User' AS tbl, COUNT(*) AS cnt FROM \"User\"
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
echo "Restore complete."
echo "All users can login with: <email> / admin1234"
