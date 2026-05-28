#!/usr/bin/env bash
# =============================================================================
# verify-all.sh — single-button "does the workspace still hold together?" check
# =============================================================================
#
# WHY THIS SCRIPT EXISTS
# ----------------------
# The dev loop in this monorepo is overwhelmingly TypeScript: `pnpm test`,
# `vitest`, biome, the demo app via tsx. Cross-cutting concerns are easy to
# miss because nothing in the day-to-day workflow exercises them.
#
# Concrete failures this script is designed to catch BEFORE they ship:
#
#   1. Rust build breakage. On 2026-05-08 Story 52.1 dropped argon2 + bcrypt
#      from `warden-engine`, but `ream-http-napi` (which is INSIDE the Cargo
#      workspace) still imported them. `cargo build --all` would have failed
#      immediately. Nothing in the TS dev loop runs cargo, so the break sat
#      uncaught for 4 days until a code review checked.
#
#   2. Excluded Cargo crates. Two crates live OUTSIDE the root workspace and
#      need a separate `cargo build` invocation:
#        - packages/pulsar/crates/pulsar-bus-napi
#        - packages/ream-cli
#      The root `cargo test --all` does NOT cover them.
#
#   3. Source-first packages without a `build` script. Per ADR-003 most
#      packages ship raw TypeScript (consumed via @swc-node/register). Those
#      packages skip `pnpm build`, which means typing regressions only surface
#      via vitest's transform pass — and only on the files vitest actually
#      imports.
#
#   4. Node engine drift. The workspace requires Node >=22 (engines field).
#      Running tests under Node 20 silently passes some tests and fails
#      others in confusing ways. The script refuses to proceed on <22.
#
# WHAT IT RUNS, IN ORDER
# ----------------------
#   [1/8] node engine >= 22
#   [2/8] pnpm -r lint              (--if-present, all workspace packages)
#   [3/8] pnpm -r build             (--if-present, all workspace packages)
#   [4/8] pnpm -r typecheck         (--if-present, all workspace packages)
#   [5/8] pnpm -r test              (--if-present, all workspace packages)
#   [6/8] cargo check --all         (root Cargo.toml workspace — 11 crates)
#   [7/8] cargo check, excluded crates (pulsar-bus-napi + ream-cli)
#   [8/8] cargo test --all          (root Cargo.toml workspace)
#
# Each stage runs only if the previous one succeeded (`set -e`). A failure
# trap reports which stage broke so the message in the terminal points at
# the right thing without having to re-read 200 lines of output.
#
# WHAT IT DOES NOT RUN
# --------------------
# - Real-database integration tests (atlas cross-dialect needs
#   ATLAS_TEST_PG_URL / ATLAS_TEST_MYSQL_URL set — env-gated, never
#   forced).
# - Coverage threshold checks. Use `pnpm quality:packages` for that path.
# - `cargo build --release`. The check + test passes are enough to catch
#   compile breakage; release builds are slow and add no new signal for a
#   pre-commit gate.
# - End-to-end binding round-trip (loading the freshly built .node into a
#   Node process and exercising NAPI exports). Reasonable next-tier check
#   if NAPI ABI mismatches start surfacing.
#
# USAGE
# -----
#   pnpm verify:all              # from ream-dev root, recommended
#   bash scripts/verify-all.sh   # equivalent
#
# Exit status: 0 if every stage passes, otherwise the failing stage's
# non-zero exit propagates up (Rust toolchain errors are exit 101; pnpm
# uses 1; the engine check uses 1).
#
# Runtime: ~1-2 minutes on a warm cargo cache + warm vitest transform
# cache, much longer (5-8 minutes) on a cold tree.
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CURRENT_STAGE=""
on_error() {
  local exit_code=$?
  echo ""
  echo "[verify] ❌ FAILED at stage: ${CURRENT_STAGE}"
  echo "[verify]    exit status: ${exit_code}"
  echo "[verify]    see the output above for the underlying error."
  exit "$exit_code"
}
trap on_error ERR

stage() {
  CURRENT_STAGE="$1"
  echo ""
  echo "[verify] ━━━ ${CURRENT_STAGE} ━━━"
}

# -----------------------------------------------------------------------------

stage "[1/8] node engine >= 22"
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "[verify] Node >= 22 is required (engines.node = >=22.0.0)."
  echo "[verify] Current: $(node -v)"
  echo "[verify] Hint: use nvm / volta to switch (`nvm install 22 && nvm use 22`)."
  exit 1
fi
echo "[verify] node $(node -v) ✓"

# -----------------------------------------------------------------------------

stage "[2/8] pnpm -r lint (--if-present)"
pnpm -r --filter './packages/*' --if-present run lint

# -----------------------------------------------------------------------------

stage "[3/8] pnpm -r build (--if-present)"
pnpm -r --filter './packages/*' --if-present run build

# -----------------------------------------------------------------------------

stage "[4/8] pnpm -r typecheck (--if-present)"
# Source-first packages typically declare `typecheck: tsc --noEmit`; packages
# with a real build pipeline get typecheck via their build step. --if-present
# skips packages that have neither (those have nothing to ship the type
# surface anyway).
pnpm -r --filter './packages/*' --if-present run typecheck

# -----------------------------------------------------------------------------

stage "[5/8] pnpm -r test (--if-present)"
pnpm -r --filter './packages/*' --if-present run test

# -----------------------------------------------------------------------------

stage "[6/8] cargo check --all (root workspace, 11 crates)"
if ! command -v cargo >/dev/null 2>&1; then
  echo "[verify] cargo not found on PATH."
  echo "[verify] Install via https://rustup.rs/ — the workspace pins toolchain"
  echo "[verify]   via rust-toolchain.toml so rustup will pick the right version."
  exit 1
fi
cargo check --all

# -----------------------------------------------------------------------------

stage "[7/8] cargo check, workspace-excluded crates"
# The root Cargo.toml's [workspace.exclude] list keeps these two crates out
# of `cargo check --all`. They build standalone via a relative path to
# ream-napi-core (linked into pulsar by scripts/setup.sh).
echo "[verify] → packages/pulsar (includes pulsar-bus-napi)"
( cd packages/pulsar && cargo check )
echo "[verify] → packages/ream-cli"
( cd packages/ream-cli && cargo check )

# -----------------------------------------------------------------------------

stage "[8/8] cargo test --all (root workspace)"
cargo test --all

# -----------------------------------------------------------------------------

echo ""
echo "[verify] ✅ all 8 stages passed."
echo "[verify]   Node $(node -v) — Rust $(cargo --version | awk '{print $2}')"
echo "[verify]   The workspace is consistent. Safe to commit / ship."
