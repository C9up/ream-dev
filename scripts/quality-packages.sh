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

# Every package workspace, not just the root one: fmt, strict clippy, tests and
# advisories. `cargo test --all` here covered the ROOT workspace only — a
# handful of crates — while five packages were failing strict clippy and a
# yanked `spin`, an `ammonia` two XSS advisories behind and an `h2` DoS sat
# unread in their lockfiles.
echo "[quality] rust workspaces"
bash scripts/quality-rust.sh

# Cheap, and it is the check that would have stopped atlas 0.3.10 going to npm
# with a red integration job.
echo "[quality] publish gates"
node scripts/check-publish-gates.mjs

echo "[quality] all checks passed"
