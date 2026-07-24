# NETRA — Security Notes

Honest record of two known items that are **accepted** for the prototype (not code bugs), so the
demo and the public repo never misrepresent them.

## 1. Auth is demo-only (not a security boundary)
Sign-in (`frontend/src/lib/auth.ts`, `Login.tsx`) sets a role + jurisdiction in `localStorage`.
Credentials are **not verified**, and the backend does **not** authorize by role — the jurisdiction
scoping is presentational. Anyone can set `netra_session` to `{role:"hq"}` and see all-state views.

**Why acceptable here:** the dataset is fully synthetic, the app predicts zones/patterns not people,
and it's a datathon prototype. A production deployment would enforce authentication and
role-based authorization server-side (e.g. Catalyst auth + per-request jurisdiction checks).

## 2. `npm audit` — 4 high-severity advisories, not in the shipped bundle
`npm audit` (frontend) reports 4 high-severity advisories in the `@huggingface/transformers` →
`onnxruntime-node` → `adm-zip` / `sharp` (libvips) chain, with **no upstream fix available**.

**Why accepted:** these are the **Node-side** optional deps of the transformers meta-package. The
browser build uses `onnxruntime-web` (WASM), and the vulnerable packages are **tree-shaken out of the
shipped bundle** — verified: `grep -E 'onnxruntime-node|adm-zip|node_modules/sharp' dist/assets/*.js`
returns nothing. They never reach the client. Re-verify after any dependency bump.

---
_Both items were surfaced in the manual code review (findings A1 and P0-3) and are documented here
rather than "fixed" because they are intentional prototype trade-offs, not defects._
