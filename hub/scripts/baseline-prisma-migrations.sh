#!/usr/bin/env bash
# Mark all existing migrations as already applied (no SQL run).
# USE ONLY when your database was created with db push / hand-rolled SQL and already
# matches these migrations — then `migrate deploy` only applies future ones.
# See: https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/add-prisma-migrate-to-existing-project
set -euo pipefail
cd "$(dirname "$0")/.."
for name in $(ls prisma/migrations | grep -v migration_lock.toml | sort); do
  echo "Resolving as applied: $name"
  npx prisma migrate resolve --applied "$name"
done
echo "Done. Run: npx prisma migrate deploy"
