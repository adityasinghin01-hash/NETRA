# NETRA — Prototype Build Plan, Start → Submission

Execution plan for building the entire prototype (backend + data + AI + frontend + deploy), Jul 12 → Jul 26. Aditya builds with Claude Code daily; frontend teammate builds screens in parallel (Aditya verifies/integrates); PPT teammate runs `TEAMMATE_PPT_GUIDE.md` independently.

Order matters: every task lists what it unblocks. Anything marked 🔴 is on the critical path — if it slips, the submission slips.

---

## Phase 0 — Foundations (Jul 12–13)

**Goal: platform de-risked, repo restructured, contracts frozen. Nothing else starts until 0.1–0.3 are done.**

| # | Task | Details | Done when |
|---|---|---|---|
| 0.1 🔴 | Catalyst account ready | Claim credits (promo `KSPH26`), create project `netra`, install CLI (`npm i -g zcatalyst-cli`), `catalyst login` (interactive — Aditya runs in terminal) | `catalyst project:list` shows the project; credits visible in console |
| 0.2 🔴 | Hello-world deploys | Minimal Express "pong" on **AppSail**; static page on **Web Client Hosting** | Both public URLs load. Platform surprises surface TODAY, not Jul 24 |
| 0.3 🔴 | Repo restructure | Strip SaaS modules (Plan/Subscription/Webhook/ApiKey models+routes+tests, Mongoose refs); create `pipeline/`, `embedding-service/`, `catalyst/`; fresh React+Vite in `frontend/` | `npm test` green on kept tests; tree matches SYSTEM_DESIGN §8 |
| 0.4 🔴 | Data Store schema | Create all tables from SYSTEM_DESIGN §3 via Catalyst console/CLI config | All tables exist; one manual row insert+read verified via SDK |
| 0.5 | Seed lookups | `pipeline/seeds/`: 31 districts + real centroids, ~120 stations (10 Bengaluru + 3–5/district) with `ParentUnit` hierarchy, CrimeHead/SubHead taxonomy (~15/40), real IPC/BNS acts+sections (~60), statuses, categories (FIR/UDR/PAR/Zero-FIR), gravity, ~200 employees, ranks | Lookup tables populated; counts logged |
| 0.6 | Quota check | Bulk-write 1k dummy rows, measure, delete | Confirmed insert ceiling + writes/min; decides import tiering |
| 0.7 | Contracts frozen | API shapes (SYSTEM_DESIGN §4) + table schemas declared v1; changes require team-chat notice | Both teammates ack |

**Phase-0 exit test:** deployed AppSail endpoint reads a seeded district row from Data Store and returns it as JSON.

## Phase 1 — Data engine + app skeleton (Jul 13–16)

**Goal: realistic synthetic world in the DB; app shell logging in and drawing the map.**

| # | Task | Details | Done when |
|---|---|---|---|
| 1.1 🔴 | Case generator core | `pipeline/generator/`: CrimeNo builder (1+4+4+4+5 format), date/time distributions (2021–26, seasonal + weekly cycles), geo sampling (station-anchored jitter, Bengaluru-weighted), parties (complainants/victims/accused), act-sections by crime type, outcomes (A/B/C with realistic rates), arrests | 50k cases generate in <10 min; distribution report prints; spot-checks pass (CrimeNo valid, coords in Karnataka) |
| 1.2 🔴 | Planted signal | Config-driven injection: hotspot clusters (specific station+window+type), repeat offenders (same accused across cases), serial-MO patterns as semantic attributes (entry/tool/target/time) | Planted config file documents ground truth (used later to sanity-check analytics — separate from the BLIND test) |
| 1.3 🔴 | Narratives | Gemini batch writes `BriefFacts` per case from structured attributes; varied phrasing; ~20% Kannada script; cache to disk (resume-safe) | Linked-pattern cases read differently (manual review of 20); 50k narratives cached |
| 1.4 | Blind-test tooling | `pipeline/generator/inject_scenarios.py` — reads PPT teammate's secret prose file, generates + merges those FIRs; Aditya never opens the input | Delivered to PPT teammate Jul 15 with instructions |
| 1.5 | `mock-seed.json` | Realistic mock payloads for every endpoint, generated from real generator output | Handed to frontend Jul 14 |
| 1.6 🔴 | Import | Tiered bulk import (10k minimum viable → 50k target) respecting 0.6 findings | Cases + children queryable in Data Store |
| 1.7 🔴 | Core APIs | `/cases` (+filters/pagination), `/cases/:id` (joined), `/stats/summary`, `/geo/districts`, `/data-quality`; Catalyst Auth session validation + RBAC jurisdiction scoping middleware | Jest smoke tests green; manually verified per role |
| 1.8 | Frontend shell | Scaffold + Tailwind + design tokens, sidebar/topbar, login vs Catalyst Auth, mock client toggle | Login works on deployed WCH build |
| 1.9 | Command Map v1 | Choropleth (GeoJSON), district→station drilldown, KPI tiles, filters wired | Runs on real `/geo/districts` + `/stats/summary` |

**Phase-1 exit test:** log in as `district` role on the deployed URL → map shows only your district's data, KPI tiles real.

## Phase 2 — The AI stars (Jul 17–21)

**Goal: everything we claim, working and measured. Heaviest phase — protect it.**

| # | Task | Details | Done when |
|---|---|---|---|
| 2.1 🔴 | Linkage v1 (TF-IDF) | `pipeline/analytics/linkage.py`: TF-IDF + cosine + agglomerative/DBSCAN clustering over BriefFacts; write `LinkedCaseClusters` | Recovers ≥3/5 of OUR planted patterns (config ground truth) |
| 2.2 🔴 | Linkage v2 (embeddings) | Multilingual sentence-transformer (Kannada-capable); embed corpus; same clustering; side-by-side eval vs v1 | Ships only if it beats v1 on planted patterns incl. the Kannada one |
| 2.3 🔴 | Embedding service | `embedding-service/`: FastAPI `POST /embed`, Dockerfile, deploy to AppSail OCI; SAME model as 2.2 | Deployed; returns identical vectors to offline pipeline (checksum test) |
| 2.4 🔴 | Live match | `POST /linkage/match` in Express: embed via 2.3 (JS TF-IDF fallback), in-memory cosine vs `CaseEmbeddings` (loaded at boot), top-k + best cluster | <800ms p95; correct on 5 hand tests incl. Kannada; fallback works with 2.3 stopped |
| 2.5 🔴 | **Blind test** | Run linkage on full corpus incl. secretly injected scenarios; score vs PPT teammate's answer key | Precision/recall numbers exist → deck slide 4 |
| 2.6 | Hotspots + anomalies + trends | DBSCAN hotspots; seasonal-baseline anomaly detection → `Alerts`; precompute `TrendSeries` | Finds planted hotspots; alert messages read naturally |
| 2.7 | Forecasting + benchmark | Grid-cell (geohash) features → gradient boosting → `Forecasts` + patrol windows; **Chicago open-data notebook, PAI/hit-rate@10%** | Beats naive baseline on Chicago holdout; number → deck slide 5 |
| 2.8 | Network + risk | Offender dedup → `Offenders`/`NetworkEdges`; unit risk scores + top-3 reasons | Graph shows planted repeat offenders; every score has reasons |
| 2.9 🔴 | Remaining APIs | `/linkage/clusters`, `/geo/hotspots`, `/geo/forecast`, `/alerts`, `/stats/trends`, `/stats/outcomes`, `/network/graph`, `/risk/units` | All green in smoke tests; frontend flips mocks OFF |
| 2.10 | Frontend star screens | Linkage screen (clusters + live match + example button), Analytics 3 tabs, map layers (hotspots/forecast/patrol), alert feed | All 5 screens on real APIs by Jul 21 |
| 2.11 | **Jul 20 cut-line review** | Honest call: linkage convincing? forecast credible? | Cut list decided; video shows only proven features |

**Phase-2 exit test:** paste a fresh burglary FIR on the deployed site → correct cluster match with similarity score; blind-test numbers written down.

## Phase 3 — Briefing + polish + assets (Jul 22–23)

| # | Task | Details | Done when |
|---|---|---|---|
| 3.1 | AI briefing | QuickML LLM prompt over district's last-24h/7d aggregates → `Briefings` (EN+KN) + SmartBrowz PDF; Catalyst Cron daily; cache-first serving | Brief reads credibly in both languages; PDF downloads; failure → cached copy |
| 3.2 | Briefing screen | Document view, EN⇄KN toggle, date/district pickers, PDF/print | Judges-can't-break-it states all handled |
| 3.3 🔴 | Polish pass | Playwright headless screenshots of all 5 screens → visual review with Claude → fix list → repeat | No layout jumps, dead buttons, console errors; empty/error states everywhere |
| 3.4 🔴 | Deck assets out | Final screenshots, blind-test + benchmark numbers, NCRB impact stats, architecture diagram export → PPT teammate | Everything on their asset checklist delivered |
| 3.5 🔴 | Raw video capture | Screen recordings per beat sheet + voiceover takes → PPT teammate for edit | Rough cut exists Jul 23 (this IS the backup video) |

## Phase 4 — Ship (Jul 24–26)

| # | Task | Details | Done when |
|---|---|---|---|
| 4.1 🔴 | Production freeze | Final deploys (AppSail ×2, WCH), prod data seeded, demo credentials for 3 roles | Full role-based walkthrough on prod URL, zero errors |
| 4.2 🔴 | README + repo hygiene | Root README: what/why/architecture/screenshots/setup+run instructions/team; remove secrets, `.env.example` accurate | A stranger can understand the repo in 5 min; `git clone` → run instructions verified |
| 4.3 🔴 | Final video + deck | PPT teammate finals both; Aditya reviews | Video <3 min, captioned; deck = official template, PDF ≤5MB |
| 4.4 🔴 | Repo → PUBLIC | Flip visibility after final push | Repo loads logged-out |
| 4.5 🔴 | Submit | Form: brief (≤1024 chars) + repo + deploy + video links + deck PDF; every link tested in incognito | Submitted by **Jul 26, 6 PM IST** (18-hr buffer before 11:59 deadline) |

---

## Critical path (the chain that cannot slip)

Catalyst setup → repo restructure → Data Store schema → generator + narratives → import → linkage v1 → embedding service → live match → blind test → frontend on real APIs → polish → video → submit

Everything else (forecasting, network, briefing, benchmark) hangs off this chain and can be trimmed at the Jul 20 review without killing the submission. **Linkage cannot be trimmed — it's the product.**

## Standing risks & pre-decided responses

| Risk | Response (decided now, not in panic) |
|---|---|
| Catalyst Data Store too limited for joins/aggregations | Precompute MORE in Python (even per-district JSON blobs served from Stratus); Express just serves files |
| Bulk import too slow/capped | 10k cases is fully demoable; tier the rest |
| Embedding container won't deploy on AppSail OCI | TF-IDF fallback is already the live path; embeddings shown in video from local run — disclosed honestly |
| QuickML unavailable/weak | Briefings pre-generated for demo dates via cache table; Regenerate button serves cache with notice |
| Gemini narrative generation rate-limited | Batch over 2 days with disk cache (1.3 is resume-safe); reduce to 20k cases if needed |
| Frontend teammate slips | Aditya + Claude build the screen directly (this plan already assumes we can) |
| Anything else on fire | Jul 20 cut-line: video only shows what's proven |

## Daily rhythm

1. Morning: 15-min team sync; Aditya + Claude pick the day's tasks from this plan (work top-down within the current phase)
2. Build in small commits; deployed URL updated at least once/day (deploy rot never accumulates)
3. Evening: tick off Done-when boxes honestly; anything failing its exit test doesn't count as done
