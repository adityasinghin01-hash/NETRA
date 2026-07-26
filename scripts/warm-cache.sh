#!/usr/bin/env bash
# Prime the Catalyst edge cache for every deployed asset.
#
# WHY: Catalyst serves this app at ~150-260KB/s and was measured ABORTING transfers mid-body on
# cold requests — karnataka-roads.json stopped at 1.2MB/60s and again at 1.47MB/90s, then completed
# in 3.0s on the third try. The pattern is consistent: the first successful full fetch of a file
# makes every subsequent fetch fast. Walking the whole asset list once after a deploy means the
# first REAL visitor (a judge opening the submission link) lands on a warm cache instead of paying
# that cost live.
#
# Run this after every `catalyst deploy`, and again shortly before sharing the link.
#   bash scripts/warm-cache.sh
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${NETRA_BASE_URL:-https://netra-60077866273.development.catalystserverless.in}"
FAILED=0
COUNT=0

warm() {
  local path="$1"
  local out
  # --compressed matches what a browser sends, so we warm the gzipped variant that browsers get.
  # Retries mirror the app's own fetchJson: a cold stall usually clears on the next attempt.
  for attempt in 1 2 3; do
    out=$(curl -sS -m 180 --compressed -o /dev/null \
          -w "%{http_code} %{size_download} %{time_total}" "$BASE$path" 2>/dev/null) && {
      set -- $out
      if [ "$1" = "200" ]; then
        printf "  ✓ %-46s %8s bytes  %ss\n" "$path" "$2" "$3"
        return 0
      fi
    }
    sleep 2
  done
  printf "  ✗ %-46s FAILED after 3 attempts\n" "$path"
  return 1
}

echo "→ warming $BASE"
echo "→ entry document + hashed build assets"
warm "/app/" || FAILED=$((FAILED + 1))
COUNT=$((COUNT + 1))

# Every file the build emitted, largest first — the big ones are the ones that stall, so they get
# warmed while the script still has the most time budget.
if [ -d client/assets ]; then
  while IFS= read -r f; do
    # Skip .wasm: the build still EMITS ort-wasm-simd-threaded.asyncify.wasm (23.5MB) because Vite
    # resolves `new URL(..., import.meta.url)` statically, but embedMatch.ts points wasmPaths at
    # jsdelivr so the browser never requests it. Warming it would spend ~9 minutes (3 x 180s
    # timeouts at ~21KB/s) on a file no visitor will ever fetch.
    case "$f" in *.wasm) continue ;; esac
    warm "/app/assets/$(basename "$f")" || FAILED=$((FAILED + 1))
    COUNT=$((COUNT + 1))
  done < <(ls -S client/assets)
fi

echo "→ data files"
for f in client/*.json client/*.geojson; do
  [ -e "$f" ] || continue
  warm "/app/$(basename "$f")" || FAILED=$((FAILED + 1))
  COUNT=$((COUNT + 1))
done

echo
if [ "$FAILED" -eq 0 ]; then
  echo "✓ warmed $COUNT assets, no failures — the link is ready to share"
else
  echo "⚠ warmed $COUNT assets, $FAILED still failing after 3 attempts each"
  echo "  Re-run this script; anything that keeps failing is genuinely missing, not just slow."
  exit 1
fi
