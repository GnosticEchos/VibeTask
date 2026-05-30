#!/usr/bin/env bash
# Mark all existing migrations as already applied (no SQL run).
# USE ONLY when your database was created with db push / hand-rolled SQL and already
# matches these migrations — then `migrate deploy` only applies future ones.
# See: docs/developer/DEVELOPER_HELPER_TOOLS.md (Prisma troubleshooting)
# For failed rows / checksum drift after restore: ./scripts/repair-prisma-migrations.sh
set -euo pipefail
cd "$(dirname "$0")/.."
for name in $(ls prisma/migrations | grep -v migration_lock.toml | sort); do
  echo "Resolving as applied: $name"
  npx prisma migrate resolve --applied "$name"
done
echo "Done. Run: npx prisma migrate deploy"
