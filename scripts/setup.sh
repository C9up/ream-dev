#!/usr/bin/env bash
set -e

echo "=== Ream Dev Setup ==="

# 1. Install Node.js dependencies
echo "[1/3] Installing dependencies..."
pnpm install

# 2. Build Rust crates (every workspace member, incl. ream-events)
echo "[2/3] Building Rust (release)..."
cargo build --release

# 3. Copy .node binaries to where TS packages expect them
echo "[3/3] Copying NAPI binaries..."
PLATFORM="linux-x64-gnu"
[[ "$(uname -s)" == "Darwin" ]] && [[ "$(uname -m)" == "arm64" ]] && PLATFORM="darwin-arm64"
[[ "$(uname -s)" == "Darwin" ]] && [[ "$(uname -m)" == "x86_64" ]] && PLATFORM="darwin-x64"

cp target/release/libream_http_napi.so packages/ream/tests/integration/http/index.${PLATFORM}.node 2>/dev/null || \
cp target/release/libream_http_napi.dylib packages/ream/tests/integration/http/index.${PLATFORM}.node 2>/dev/null || true

cp target/release/libream_napi_test.so packages/ream/tests/integration/napi/index.${PLATFORM}.node 2>/dev/null || \
cp target/release/libream_napi_test.dylib packages/ream/tests/integration/napi/index.${PLATFORM}.node 2>/dev/null || true

cp target/release/libream_events_napi.so packages/ream/events.${PLATFORM}.node 2>/dev/null || \
cp target/release/libream_events_napi.dylib packages/ream/events.${PLATFORM}.node 2>/dev/null || true

echo ""
echo "=== Setup complete ==="
echo "Run: pnpm test       (317 tests)"
echo "Run: pnpm test:rust  (89 tests)"
