#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${1:-${HOST_DATA_DIR:-./data}}"

mkdir -p \
  "${DATA_DIR}/debug" \
  "${DATA_DIR}/favs" \
  "${DATA_DIR}/logs" \
  "${DATA_DIR}/novels" \
  "${DATA_DIR}/users"

echo "Initialized data directories under: ${DATA_DIR}"
