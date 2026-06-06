#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
set -a
source .env
set +a

: "${VT_DOMAIN:?VT_DOMAIN required}"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert not found — install from https://github.com/FiloSottile/mkcert" >&2
  exit 1
fi

mkdir -p certs

CERT_FILE="certs/${VT_DOMAIN}.pem"
KEY_FILE="certs/${VT_DOMAIN}-key.pem"

if [[ -f "$CERT_FILE" && -f "$KEY_FILE" ]]; then
  echo "Certs already exist: $CERT_FILE"
  exit 0
fi

echo "Generating mkcert certificates for ${VT_DOMAIN}..."
mkcert -cert-file "$CERT_FILE" -key-file "$KEY_FILE" "$VT_DOMAIN"
# rpxy runs as an unprivileged user in the container; allow read on mounted certs.
chmod a+r "$CERT_FILE" "$KEY_FILE"
echo "Wrote $CERT_FILE and $KEY_FILE"
echo "Run 'mkcert -install' once per machine if browsers/CLI reject the cert."
