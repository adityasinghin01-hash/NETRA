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

## 3. Sovereign LLM proxy — hardening applied, one residual trade-off
The `/glm` and `/vlm` routes (`functions/netra_api/index.js`) proxy to Catalyst QuickML using the
org's OAuth token. Two issues from the security review were **fixed**:

- **Removed the `/llm-seed` route.** It let an unauthenticated caller write OAuth creds into the Data
  Store on an unseeded environment (trust-on-first-use), which would let them hijack the LLM proxy on
  any fresh redeploy. Creds are now seeded/rotated **out-of-band via the Catalyst Data Store console**
  — never over an HTTP route.
- **Same-origin gate on `/glm` and `/vlm`.** Requests are now rejected (403) unless the browser-set
  `Origin`/`Referer` resolves to a `*.catalystserverless.in` host (or an `ALLOWED_ORIGINS` env host).
  This blocks cross-origin browser abuse and header-less scanners with **no frontend change** (the
  app's same-origin POSTs already carry these headers).

**Residual trade-off (accepted):** the origin gate is a *soft* control — a non-browser client can
forge `Origin`/`Referer`. A hard control (authenticated Catalyst function scope, or a per-user token)
would require a frontend rebuild + redeploy, which is out of scope for the frozen submission build.
Combined with the per-IP rate limiter, this is an acceptable prototype posture; a production build
would put the proxy behind authenticated function scope.

---
_Items 1 and 2 were surfaced in the manual code review (findings A1 and P0-3) and are documented here
rather than "fixed" because they are intentional prototype trade-offs, not defects. Item 3 records the
two fixes applied after the full-codebase security review, plus the one residual trade-off._
