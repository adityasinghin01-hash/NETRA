#!/usr/bin/env bash
# Build the React app and sync it into the Catalyst client folder, then deploy.
# Usage: bash scripts/deploy-client.sh   (from repo root)
set -euo pipefail
cd "$(dirname "$0")/.."
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
echo "✓ done"
