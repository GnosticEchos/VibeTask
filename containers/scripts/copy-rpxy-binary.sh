#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  source .env
  set +a
fi

if [[ -n "${RPXY_BINARY:-}" ]]; then
  SRC="$RPXY_BINARY"
elif [[ -n "${RPXY_BUILD_CONTEXT:-}" ]]; then
  SRC="${RPXY_BUILD_CONTEXT%/}/target/release/rpxy"
else
  echo "Set RPXY_BINARY or RPXY_BUILD_CONTEXT in containers/.env" >&2
  echo "  RPXY_BUILD_CONTEXT=\$HOME/src/rust-rpxy" >&2
  echo "  RPXY_BINARY=\$HOME/src/rust-rpxy/target/release/rpxy" >&2
  exit 1
fi

DEST="rpxy/bin/rpxy"

if [[ ! -f "$SRC" ]]; then
  echo "rpxy binary not found: $SRC" >&2
  if [[ -n "${RPXY_BUILD_CONTEXT:-}" ]]; then
    echo "Build with: cd \"${RPXY_BUILD_CONTEXT}\" && cargo build --release" >&2
  fi
  exit 1
fi

mkdir -p rpxy/bin
cp -f "$SRC" "$DEST"
chmod +x "$DEST"
echo "Copied $SRC -> $DEST"
