#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STRICT_MODE=0
ACTIONABLE_MODE=0
for arg in "$@"; do
  if [[ "$arg" == "--strict" ]]; then
    STRICT_MODE=1
  fi
  if [[ "$arg" == "--actionable" ]]; then
    STRICT_MODE=1
    ACTIONABLE_MODE=1
  fi
done
export STRICT_MODE
export ACTIONABLE_MODE

echo "[duplicate] scanning packages for repeated logic (2-line shingles + single lines)"

TMP_LINES="$(mktemp)"
TMP_SHINGLES="$(mktemp)"
trap 'rm -f "$TMP_LINES" "$TMP_SHINGLES"' EXIT

if [[ "${DUPLICATE_FORCE_FIND:-0}" != "1" ]] && command -v rg >/dev/null 2>&1; then
  mapfile -t FILES < <(rg --files packages \
    -g '!**/node_modules/**' \
    -g '!**/dist/**' \
    -g '!**/target/**' \
    -g '!**/coverage/**' \
    -g '*.{ts,tsx,rs}')
else
  echo "[duplicate] warning: rg not found, using slower find fallback"
  mapfile -t FILES < <(find packages -type f \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.rs' \) \
    ! -path '*/node_modules/*' \
    ! -path '*/dist/*' \
    ! -path '*/target/*' \
    ! -path '*/coverage/*' \
    | sort)
fi

if [[ "${#FILES[@]}" -eq 0 ]]; then
  echo "[duplicate] error: no source files found to scan"
  exit 1
fi

for file in "${FILES[@]}"; do
  if [[ "$STRICT_MODE" -eq 1 ]]; then
    case "$file" in
      */tests/*|*.test.ts|*.spec.ts) continue ;;
    esac
  fi

  awk -v file="$file" '
  function trim(s) { sub(/^[ \t\r\n]+/, "", s); sub(/[ \t\r\n]+$/, "", s); return s }
  function normalize(s, out) {
    out = trim(s)
    gsub(/[ \t]+/, " ", out)
    out = tolower(out)
    return out
  }
  {
    raw = $0
    norm = normalize(raw)

    # Ignore trivial/control/comment/import-export lines
    if (length(norm) < 16) next
    if (norm ~ /^(\/\/|\/\*|\*|#)/) next
    if (norm ~ /^(import |export )/) next
    if (norm ~ /^[{}();,]+$/) next
    if (norm ~ /^(use |extern crate )/) next
    if (norm ~ /^fn [a-z0-9_]+\(.*\) \{$/) next
    if (norm ~ /^async [a-z0-9_]+\(.*\):/) next

    # Single-line candidate
    print norm "\t" file "\t" NR "\tL"

    # 2-line shingle candidate
    if (prev_norm != "") {
      shingle = prev_norm " || " norm
      print shingle "\t" file "\t" prev_nr "\tS"
    }
    prev_norm = norm
    prev_nr = NR
  }
  ' "$file"
done > "$TMP_LINES"

awk -F '\t' '
{
  key = $1
  file = $2
  loc = file ":" $3
  kind = $4

  # Count distinct files only for each pattern.
  if (!(seen_key_file[key SUBSEP file]++)) {
    file_count[key]++
    files[key] = files[key] (files[key] ? ", " : "") file
  }

  # Keep up to 5 sample locations.
  if (sample_count[key] < 5) {
    sample_count[key]++
    samples[key] = samples[key] (samples[key] ? ", " : "") loc
  }

  kind_of[key] = kind
}
END {
  found = 0
  for (k in file_count) {
    # Require at least 2 distinct files to reduce noise.
    if (file_count[k] < 2) continue

    # For single lines, require at least 3 files because these are noisier.
    if (kind_of[k] == "L" && file_count[k] < 3) continue

    # Strict mode signal-noise improvements for common boilerplate.
    if (ENVIRON["STRICT_MODE"] == "1") {
      if (k ~ /^(constructor\(protected app: appcontext\) \{\}|async start\(\) \{\}|async ready\(\) \{\}|async shutdown\(\) \{\})$/) continue
      if (k ~ /(readonly code: string|readonly hint\?: string|this\.hint = options\?\.hint)/) continue
      if (k ~ /(napi_build::setup\(\)|fn default\(\) -> self \{|beforeeach\(\(\) => \{|throw new error\()/) continue
      if (k ~ /(headers: record<string, string>|\[key: string\]: unknown|const log: string\[\] = \[\])/) continue
    }

    # Actionable mode: keep mostly refactorable implementation patterns.
    if (ENVIRON["ACTIONABLE_MODE"] == "1") {
      # Drop frequent type/interface boilerplate.
      if (k ~ /(readonly |: string|: number|: boolean|: unknown|: record<|: hashmap<|roles\?:|permissions\?:|authenticated: boolean)/) continue
      # Drop typical lifecycle/provider boilerplate.
      if (k ~ /(async handle\(ctx: httpcontext, next: \(\) => promise<void>\)|pub fn new\(\) -> self|get\(_target, prop, receiver\)|async start\(\) \{\} \|\| async ready\(\) \{\}|async ready\(\) \{\} \|\| async shutdown\(\) \{\})/) continue
      # Prefer 2-line shingles in actionable mode (better signal).
      if (kind_of[k] != "S") continue
    }

    found++
    score = file_count[k]
    printf "%04d\t%s\t%s\t%s\t%s\n", score, kind_of[k], file_count[k], k, samples[k]
  }

  if (!found) {
    print "[duplicate] no cross-package candidates found with current thresholds"
  }
}
' "$TMP_LINES" | sort -r > "$TMP_SHINGLES"

if grep -q '^\[duplicate\]' "$TMP_SHINGLES"; then
  cat "$TMP_SHINGLES"
  exit 0
fi

echo "[duplicate] top candidates (S=2-line shingle, L=single-line)"
head -n 120 "$TMP_SHINGLES" | awk -F '\t' '
{
  printf "[%s files][%s] %s\n", $3, $2, $4
  printf "  -> sample: %s\n", $5
}
END {
  print "[duplicate] thresholded report generated"
}'
