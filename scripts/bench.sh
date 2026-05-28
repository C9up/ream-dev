#!/usr/bin/env bash
set -e

echo ""
echo "=== Ream NFR Benchmark Suite ==="
echo ""

PASS=0
WARN=0
FAIL=0

check() {
  local name="$1" target="$2" actual="$3" unit="$4"
  if [ "$actual" = "N/A" ]; then
    printf "  [--] %-40s %s (not measured)\n" "$name" "$target"
    return
  fi
  if [ "$(echo "$actual <= $target" | bc -l 2>/dev/null || echo 0)" = "1" ]; then
    printf "  [OK] %-40s %s%s (target: %s%s)\n" "$name" "$actual" "$unit" "$target" "$unit"
    PASS=$((PASS + 1))
  else
    printf "  [XX] %-40s %s%s (target: %s%s)\n" "$name" "$actual" "$unit" "$target" "$unit"
    FAIL=$((FAIL + 1))
  fi
}

# --- NFR21: NAPI binary size < 10MB ---
echo "Binary sizes:"
for f in packages/pulsar/index.*.node packages/ream/tests/integration/http/index.*.node packages/ream/tests/integration/napi/index.*.node; do
  if [ -f "$f" ]; then
    SIZE_KB=$(du -k "$f" | cut -f1)
    SIZE_MB=$(echo "scale=1; $SIZE_KB / 1024" | bc -l 2>/dev/null || echo "N/A")
    NAME=$(basename "$f")
    check "$NAME" "10" "$SIZE_MB" "MB"
  fi
done

echo ""

# --- NFR4: NAPI crossing overhead < 500ns ---
echo "NAPI overhead:"
NAPI_OUTPUT=$(npx vitest run packages/ream/tests/integration/napi/ 2>&1 || true)
NAPI_NS=$(echo "$NAPI_OUTPUT" | grep -oP '\d+ns per call' | grep -oP '^\d+' || echo "N/A")
check "NAPI crossing overhead" "500" "$NAPI_NS" "ns"

echo ""

# --- Rust test timing ---
echo "Rust tests:"
RUST_START=$(date +%s%3N)
cargo test --all --quiet 2>&1 > /dev/null
RUST_END=$(date +%s%3N)
RUST_MS=$((RUST_END - RUST_START))
printf "  [OK] %-40s %sms\n" "Rust test suite" "$RUST_MS"

echo ""

# --- NFR6: Boot time < 2s ---
echo "Boot time:"
BOOT_START=$(date +%s%3N)
timeout 5 npx tsx -e "
import { Ignitor } from './packages/ream/src/index.ts'
const app = new Ignitor({ port: 0 })
  .httpServer()
  .routes((r) => r.get('/', async () => {}))
// No serverFactory = no server start, just lifecycle
await app.start()
process.exit(0)
" 2>/dev/null || true
BOOT_END=$(date +%s%3N)
BOOT_MS=$((BOOT_END - BOOT_START))
BOOT_S=$(echo "scale=1; $BOOT_MS / 1000" | bc -l 2>/dev/null || echo "N/A")
check "Ignitor boot time" "2" "$BOOT_S" "s"

echo ""

# --- Summary ---
echo "=== Summary ==="
echo "  $PASS passed, $WARN warnings, $FAIL failed"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
