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
#   2. Excluded Cargo crates. One crate lives OUTSIDE the root workspace and
#      needs a separate `cargo build` invocation:
#        - packages/ream-cli
#      The root `cargo test --all` does NOT cover it.
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
#   [1/11] node engine >= 22
#   [2/11] pnpm -r lint              (--if-present, all workspace packages)
#   [3/11] pnpm -r build             (--if-present, all workspace packages)
#   [4/11] pnpm -r typecheck         (--if-present, all workspace packages)
#   [5/11] pnpm -r test              (--if-present, all workspace packages)
#   [6/11] cargo fmt --check          (every crate, incl. the excluded one)
#   [7/11] cargo check --all         (root Cargo.toml workspace — 11 crates)
#   [8/11] cargo check, excluded crate (ream-cli)
#   [9/11] cargo test --all          (root Cargo.toml workspace)
#   [10/11] cargo audit             (RustSec advisories, .cargo/audit.toml)
#   [11/11] vendored copies         (scripts/vendor-sync.mjs --check)
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

# Stages that could not run, so the summary can say so instead of implying
# they passed.
SKIPPED=()

stage() {
  CURRENT_STAGE="$1"
  echo ""
  echo "[verify] ━━━ ${CURRENT_STAGE} ━━━"
}

# -----------------------------------------------------------------------------

stage "[1/11] node engine >= 22"
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "[verify] Node >= 22 is required (engines.node = >=22.0.0)."
  echo "[verify] Current: $(node -v)"
  echo "[verify] Hint: use nvm / volta to switch (`nvm install 22 && nvm use 22`)."
  exit 1
fi
echo "[verify] node $(node -v) ✓"

# -----------------------------------------------------------------------------

stage "[2/11] pnpm -r lint (--if-present)"
pnpm -r --filter './packages/*' --if-present run lint

# -----------------------------------------------------------------------------

stage "[3/11] pnpm -r build (--if-present)"
pnpm -r --filter './packages/*' --if-present run build

# -----------------------------------------------------------------------------

stage "[4/11] pnpm -r typecheck (--if-present)"
# Source-first packages typically declare `typecheck: tsc --noEmit`; packages
# with a real build pipeline get typecheck via their build step. --if-present
# skips packages that have neither (those have nothing to ship the type
# surface anyway).
pnpm -r --filter './packages/*' --if-present run typecheck

# -----------------------------------------------------------------------------

stage "[5/11] pnpm -r test (--if-present)"
pnpm -r --filter './packages/*' --if-present run test

# -----------------------------------------------------------------------------

stage "[6/11] cargo fmt --check (every crate)"
if ! command -v cargo >/dev/null 2>&1; then
  echo "[verify] cargo not found on PATH."
  echo "[verify] Install via https://rustup.rs/ — the workspace pins toolchain"
  echo "[verify]   via rust-toolchain.toml so rustup will pick the right version."
  exit 1
fi
# CI runs `cargo fmt --check` and this gate did not, so formatting drift got
# through here and failed there — on a commit already tagged. A gate that
# checks less than CI is not a gate. Every crate: the root workspace covers
# most, `[workspace.exclude]` and the per-package crates need their own pass.
cargo fmt --all --check
for manifest in $(find packages -maxdepth 3 -name Cargo.toml -not -path "*/target/*"); do
  crate_dir=$(dirname "$manifest")
  ( cd "$crate_dir" && cargo fmt --check ) || {
    echo "[verify] rustfmt drift in ${crate_dir} — run: (cd ${crate_dir} && cargo fmt)"
    exit 1
  }
done

# -----------------------------------------------------------------------------

stage "[7/11] cargo check --locked --all (root workspace, 11 crates)"
if ! command -v cargo >/dev/null 2>&1; then
  echo "[verify] cargo not found on PATH."
  echo "[verify] Install via https://rustup.rs/ — the workspace pins toolchain"
  echo "[verify]   via rust-toolchain.toml so rustup will pick the right version."
  exit 1
fi
# `--locked` on every cargo invocation below. Without it a stale Cargo.lock is
# silently REWRITTEN by the gate, so the run verifies a dependency resolution
# that was never committed and the next checkout resolves something else. It
# fails loudly instead: regenerate the lock deliberately and commit it.
cargo check --locked --all

# -----------------------------------------------------------------------------

stage "[8/11] cargo check, workspace-excluded crate"
# The root Cargo.toml's [workspace.exclude] list keeps this crate out of
# `cargo check --all`.
echo "[verify] → packages/ream-cli"
( cd packages/ream-cli && cargo check --locked )

# -----------------------------------------------------------------------------

stage "[9/11] cargo test --locked --all (root workspace)"
cargo test --locked --all

# -----------------------------------------------------------------------------

stage "[10/11] cargo audit (RustSec advisories)"
# The one gate nothing else covered: `cargo check` and `cargo test` say nothing
# about a dependency with a published vulnerability, and neither does anything
# on the Node side. Skipped with a message when the tool is absent rather than
# failing — it is a separate install (`cargo install cargo-audit --locked`) and
# a missing tool is not a broken workspace.
#
# `.cargo/audit.toml` lists what may pass, each entry with the reason it does
# not reach this code. Anything not listed fails here.
# Detected the way it is INVOKED, not the way it is installed. `cargo audit`
# resolves through cargo's own subcommand lookup, which searches ~/.cargo/bin
# whether or not that directory is on PATH — so `command -v cargo-audit` said
# "missing" for a tool that was installed and working, and the gate skipped the
# advisory check on machines that had it.
if cargo audit --version >/dev/null 2>&1; then
  cargo audit
else
  echo "[verify] cargo-audit not installed — RustSec advisories NOT checked."
  echo "[verify]   cargo install cargo-audit --locked"
  SKIPPED+=("cargo audit (cargo-audit not installed)")
fi

# -----------------------------------------------------------------------------

stage "[11/11] vendored copies match their source"
# Code that belongs in several packages and cannot be a dependency: each
# package is published from its own repository, so the file has to exist in
# each one. The copies are generated from scripts/vendor/, never edited, and
# this fails when one has drifted.
node scripts/vendor-sync.mjs --check

# -----------------------------------------------------------------------------

echo ""
# The summary has to account for what was SKIPPED. "All 11 stages passed" on a
# run where the advisory check never happened is a green light for something
# nobody looked at — and a gate that misreports is worse than no gate, because
# it is believed.
if [ ${#SKIPPED[@]} -eq 0 ]; then
  echo "[verify] ✅ all 11 stages passed."
else
  echo "[verify] ⚠️  $((11 - ${#SKIPPED[@]})) of 11 stages passed; ${#SKIPPED[@]} SKIPPED and not verified:"
  for skipped in "${SKIPPED[@]}"; do
    echo "[verify]   - ${skipped}"
  done
  echo "[verify] Install the missing tool before treating this run as a release gate."
fi
echo "[verify]   Node $(node -v) — Rust $(cargo --version | awk '{print $2}')"
if [ ${#SKIPPED[@]} -eq 0 ]; then
  echo "[verify]   The workspace is consistent. Safe to commit / ship."
else
  # Saying "safe to ship" one line under "not verified" is how the warning
  # above gets ignored: the last line is the one that is read.
  echo "[verify]   Consistent as far as it was checked — NOT a release gate while a stage is skipped."
fi
