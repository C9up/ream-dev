#!/usr/bin/env bash
set -e

echo "=== Ream Dev Setup ==="

# 1. Install Node.js dependencies
echo "[1/4] Installing dependencies..."
pnpm install

# 2. Create symlink for cross-repo Rust dependency
echo "[2/4] Linking Rust crates..."
mkdir -p packages/pulsar/crates
ln -sf ../../../packages/ream/crates/ream-napi-core packages/pulsar/crates/ream-napi-core 2>/dev/null || true

# 3. Build Rust crates
echo "[3/4] Building Rust (release)..."
cargo build --release
cd packages/pulsar && cargo build --release && cd ../..

# 4. Copy .node binaries to where TS packages expect them
echo "[4/4] Copying NAPI binaries..."
PLATFORM="linux-x64-gnu"
[[ "$(uname -s)" == "Darwin" ]] && [[ "$(uname -m)" == "arm64" ]] && PLATFORM="darwin-arm64"
[[ "$(uname -s)" == "Darwin" ]] && [[ "$(uname -m)" == "x86_64" ]] && PLATFORM="darwin-x64"

cp target/release/libream_http_napi.so packages/ream/tests/integration/http/index.${PLATFORM}.node 2>/dev/null || \
cp target/release/libream_http_napi.dylib packages/ream/tests/integration/http/index.${PLATFORM}.node 2>/dev/null || true

cp target/release/libream_napi_test.so packages/ream/tests/integration/napi/index.${PLATFORM}.node 2>/dev/null || \
cp target/release/libream_napi_test.dylib packages/ream/tests/integration/napi/index.${PLATFORM}.node 2>/dev/null || true

cp packages/pulsar/target/release/libream_bus_napi.so packages/pulsar/index.${PLATFORM}.node 2>/dev/null || \
cp packages/pulsar/target/release/libream_bus_napi.dylib packages/pulsar/index.${PLATFORM}.node 2>/dev/null || true

echo ""
echo "=== Setup complete ==="
echo "Run: pnpm test       (317 tests)"
echo "Run: pnpm test:rust  (89 tests)"
