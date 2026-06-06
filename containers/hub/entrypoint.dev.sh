#!/bin/sh
set -e
cd /app
if [ ! -x node_modules/.bin/tsx ]; then
  npm ci
fi
npx prisma generate
npx prisma migrate deploy
exec npm run dev
