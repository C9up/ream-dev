#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[quality] verify Node engine >= 22"
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "[quality] error: Node >= 22 is required, current is $(node -v)"
  exit 1
fi

echo "[quality] lint packages"
pnpm -r --filter './packages/*' --if-present run lint

echo "[quality] build packages"
pnpm -r --filter './packages/*' --if-present run build

if [ "${COVERAGE:-1}" = "1" ]; then
  echo "[quality] test packages (with coverage thresholds)"
  pnpm -r --filter './packages/*' --if-present run test:coverage
else
  echo "[quality] test packages"
  pnpm -r --filter './packages/*' --if-present run test
fi

echo "[quality] rust workspace tests"
cargo test --all

echo "[quality] all checks passed"
