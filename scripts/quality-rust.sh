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

# What a package's own `test:rust` script sets, and this gate did not.
#
# ream-mcp warms the fastembed model up on a background thread; the ONNX
# runtime then registers an atexit handler that aborts the process — SIGABRT,
# after a green run — when the warm-up is still in flight at exit. The gate
# reported "test failed" for 41 passing tests, on nothing to do with the code.
# Set for every workspace: a package that does not read it does not care.
export REAM_MCP_DISABLE_EMBEDDINGS=1

workspaces=(".")
for dir in packages/*/; do
  [ -f "${dir}Cargo.toml" ] && workspaces+=("${dir%/}")
done

have_deny=0
# Detected the way it is invoked: `cargo deny` resolves through cargo's
# subcommand lookup in ~/.cargo/bin, which need not be on PATH.
if cargo deny --version >/dev/null 2>&1; then
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

# "Clean" has to mean everything was checked. With cargo-deny absent the
# advisory pass never ran, and announcing clean anyway is a green light for
# something nobody looked at.
if [ "$have_deny" -eq 1 ]; then
  echo "[rust] all workspaces clean"
else
  echo "[rust] ⚠️  fmt, clippy and tests passed on all workspaces — advisories NOT checked (cargo-deny missing)"
  echo "[rust]   cargo install cargo-deny --locked"
fi
