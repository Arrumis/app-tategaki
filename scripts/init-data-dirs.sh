#!/usr/bin/env bash
set -euo pipefail

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

DATA_DIR="${1:-${TATEGAKI_DATA_DIR:-${HOST_DATA_DIR:-./data}}}"

mkdir -p \
  "${DATA_DIR}/debug" \
  "${DATA_DIR}/favs" \
  "${DATA_DIR}/logs" \
  "${DATA_DIR}/novels" \
  "${DATA_DIR}/users"

echo "Initialized data directories under: ${DATA_DIR}"
