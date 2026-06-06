#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example to .env and edit ports/secrets." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

: "${VT_DOMAIN:?VT_DOMAIN required}"
: "${RPXY_HTTP_PORT:?RPXY_HTTP_PORT required}"
: "${RPXY_HTTPS_PORT:?RPXY_HTTPS_PORT required}"
: "${HUB_HTTP_PORT:?HUB_HTTP_PORT required}"
: "${HUB_WS_PORT:?HUB_WS_PORT required}"
: "${FRONTEND_PORT:?FRONTEND_PORT required}"

export VT_DOMAIN RPXY_HTTP_PORT RPXY_HTTPS_PORT HUB_HTTP_PORT HUB_WS_PORT FRONTEND_PORT

envsubst '${VT_DOMAIN} ${RPXY_HTTP_PORT} ${RPXY_HTTPS_PORT} ${HUB_HTTP_PORT} ${HUB_WS_PORT} ${FRONTEND_PORT}' \
  < rpxy/rpxy.toml.template > rpxy/rpxy.toml

echo "Rendered rpxy/rpxy.toml"
