#!/usr/bin/env bash
# Fetch the sovereign embedding model + onnxruntime WASM into frontend/public/ so the app can
# serve them from our own host (no HuggingFace / jsdelivr calls at runtime). ~130MB, gitignored.
# Run once after a fresh clone / npm install:  bash scripts/fetch-models.sh
set -euo pipefail
cd "$(dirname "$0")/.."

MODEL="Xenova/paraphrase-multilingual-MiniLM-L12-v2"
BASE="https://huggingface.co/${MODEL}/resolve/main"
DIR="frontend/public/models/${MODEL}"
mkdir -p "$DIR/onnx"

echo "→ embedding model ($MODEL)"
for f in config.json tokenizer.json tokenizer_config.json special_tokens_map.json; do
  [ -f "$DIR/$f" ] || curl -sL -o "$DIR/$f" "$BASE/$f"
done
[ -f "$DIR/onnx/model_quantized.onnx" ] || curl -sL -o "$DIR/onnx/model_quantized.onnx" "$BASE/onnx/model_quantized.onnx"

echo "→ onnxruntime-web WASM (from node_modules)"
mkdir -p frontend/public/ort
for f in ort-wasm-simd-threaded.mjs ort-wasm-simd-threaded.wasm \
         ort-wasm-simd-threaded.asyncify.mjs ort-wasm-simd-threaded.asyncify.wasm; do
  cp "frontend/node_modules/onnxruntime-web/dist/$f" frontend/public/ort/
done

echo "✓ models ready. Semantic matching now runs fully on-host (sovereign)."
