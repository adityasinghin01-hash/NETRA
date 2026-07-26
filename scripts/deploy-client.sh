#!/usr/bin/env bash
# Build the React app and sync it into the Catalyst client folder, then deploy.
# Usage: bash scripts/deploy-client.sh   (from repo root)
set -euo pipefail
cd "$(dirname "$0")/.."
echo "→ re-embedding Copilot cards (keeps copilot-cards-embeddings.json in sync with copilot-cards.json;"
echo "  the retrieval index reads the EMBEDDINGS file, so skipping this ships a stale corpus)…"
( cd frontend && node scripts/embed-cards.mjs )
echo "→ building frontend…"
( cd frontend && npm run build )
echo "→ syncing build into client/…"
rm -rf client/*
cp -r frontend/dist/* client/
cp client/index.html client/404.html
cat > client/client-package.json <<'JSON'
{
  "name": "netra",
  "version": "0.0.1",
  "homepage": "index.html",
  "404": "404.html"
}
JSON
echo "→ deploying to Catalyst…"
catalyst deploy --only client

# Prime the edge cache before anyone else hits it — Catalyst stalls on cold requests, so the first
# visitor otherwise pays that cost live. Non-fatal: a deploy that warmed imperfectly is still a
# good deploy, and the script can be re-run on its own.
echo "→ warming the edge cache (see scripts/warm-cache.sh for why this exists)…"
bash scripts/warm-cache.sh || echo "⚠ warm-up incomplete — re-run: bash scripts/warm-cache.sh"

echo "✓ done"
