# Sovereign embedding model — status & path to full on-host hosting

NETRA's semantic matching (Linkage, Case Search "Smart MO search", Copilot retrieval) runs the
`Xenova/paraphrase-multilingual-MiniLM-L12-v2` sentence-transformer **in the browser** via
transformers.js (onnxruntime-web). This keeps the FIR text on-device — it is never sent to any
external inference API. The **model weights**, however, are still fetched from the open-weights
host (HuggingFace) on first load. Making that fully sovereign hit two hard Catalyst limits.

## What was attempted

- Downloaded the model into `frontend/public/models/…` (config, tokenizer, `onnx/model_quantized.onnx`)
  and the onnxruntime WASM into `frontend/public/ort/`, then pointed transformers.js at them
  (`env.allowLocalModels`, `env.localModelPath`, `env.backends.onnx.wasm.wasmPaths`).
- Verified locally: **0 external requests**, identical semantic results — fully sovereign on `vite preview`.

## Why it can't ship on Catalyst **web hosting** as-is

1. **HTTP 413** — the quantized model is **112 MB**; Catalyst web client hosting enforces a
   single-file size cap well below that. (The 16 MB tokenizer and 22 MB WASM upload fine.)
2. **HTTP 400** — Catalyst web hosting rejects requests for the `.wasm` / `.mjs` paths under
   `/ort/`, so the onnxruntime runtime must stay **Vite-bundled** (which already serves it locally
   from `dist/assets/`, not a CDN).
3. **SPA fallback** — a missing file returns `index.html`, so a "local-first, remote-fallback"
   setup makes transformers.js parse HTML as a model and refetch everything remotely (worse).

## Current state (shipped)

- Model weights: loaded from the open-weights host on first session (cached thereafter).
- onnxruntime WASM: served locally from the Vite bundle (no jsdelivr dependency).
- FIR text: never leaves the browser — embedding is fully on-device.

## Path to full sovereignty (remaining step)

Host the 112 MB model on **object storage in the same Catalyst project** (Stratus bucket), which
has no small single-file cap, then either:
- set `env.remoteHost` + `env.remotePathTemplate` to the Stratus base URL, or
- proxy the model through the `netra_api` function from Stratus.
Both keep the weights inside the Catalyst (police) cloud. Requires enabling Stratus and uploading
the file via the Catalyst console/CLI. `scripts/fetch-models.sh` produces the exact files to upload.

For the prototype pitch, the honest framing: **inference is on-device and sovereign; the model is
open-weight and self-hostable on-premise** — the only thing crossing the network is the one-time
model download, which object storage closes in production.
