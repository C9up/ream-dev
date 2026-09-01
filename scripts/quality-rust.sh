#!/usr/bin/env bash
#
# Every Rust workspace: format, strict clippy, tests, advisories.
#
# `quality-packages.sh` ran `cargo test --all` on the ROOT workspace, which is
# a handful of crates. Every package carries its own workspace, and nothing
# walked them: five were failing strict clippy at the same time, and an
# unmaintained-and-yanked advisory list had gone unread — a yanked `spin`, an
# `ammonia` two XSS advisories behind, an `h2` DoS.
#
# `cargo deny` is optional so a contributor without it can still run the gate;
# CI installs it, and the run says which it did.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

workspaces=(".")
for dir in packages/*/; do
  [ -f "${dir}Cargo.toml" ] && workspaces+=("${dir%/}")
done

have_deny=0
if command -v cargo-deny >/dev/null 2>&1; then
  have_deny=1
else
  echo "[rust] cargo-deny not installed — skipping the advisory check"
  echo "[rust]   cargo install cargo-deny --locked"
fi

for ws in "${workspaces[@]}"; do
  name="${ws#packages/}"
  echo "[rust] ${name}: fmt"
  (cd "$ROOT/$ws" && cargo fmt --check)
  echo "[rust] ${name}: clippy"
  (cd "$ROOT/$ws" && cargo clippy --all-targets --all-features -- -D warnings)
  echo "[rust] ${name}: test"
  (cd "$ROOT/$ws" && cargo test --workspace)
  if [ "$have_deny" = "1" ]; then
    echo "[rust] ${name}: advisories"
    (cd "$ROOT/$ws" && cargo deny --config "$ROOT/deny.toml" check advisories)
  fi
done

echo "[rust] all workspaces clean"
