# NETRA — Presentation & Submission Owner: Complete Work Package

You own everything the judges **read and watch**. In an async-judged round (no live demo on Jul 26), your deliverables are 50% of what wins this. This doc is everything you need — read it once fully, then work top to bottom.

## 0. THE IDEA — read this first, you're selling it

**What NETRA is, in one line:** an AI crime-intelligence engine that turns Karnataka Police's own FIR records into decisions — where crime is clustering, which crimes are connected, what happens next week, and what to do about it.

**The problem (why KSP posted this challenge):** Karnataka has 1,100+ police stations, each filing FIRs (First Information Reports — the document that opens every criminal case) into a shared but siloed database. Today that data answers questions only through static dashboards and manual queries. Three real consequences:
1. **Serial criminals are invisible across borders.** A burglar hitting shops in Tumakuru, Chitradurga, and Davanagere is investigated as 3 unrelated local cases by 3 officers who've never spoken. Nothing connects them.
2. **Patterns are found late or never.** A spike in night-time vehicle theft is noticed when someone manually compiles a monthly report — weeks after it started.
3. **Leadership reviews the past instead of shaping the future.** SPs see last month's totals; nobody tells them where next week's risk is.

**What NETRA does about it — the 5 pillars:**
1. **See** — Interactive Karnataka map: state → district → station drilldown, crime hotspots found by clustering algorithms (not just pins), and an honest data-quality indicator
2. **Track** — Crime trends over time with automatic anomaly alerts ("vehicle theft in X up 40% in 6 weeks — here's the evidence")
3. **Connect ⭐ (the headline)** — AI reads the free-text narrative of every FIR (English AND Kannada) and links serial crimes across district borders by modus operandi. Also: repeat-offender registry and a network graph of who's co-accused with whom across cases. **The live demo moment: paste a brand-new FIR, and NETRA answers "87% match with Serial Cluster #3" in under a second.**
4. **Judge** — Case-outcome analytics: for every station, what % of cases end chargesheeted (A), declared false (B), or undetected (C) — the accountability view police leadership never gets easily
5. **Act** — 7-day hotspot forecast with suggested patrol windows, and a 1-page AI-written daily briefing per district, in English or Kannada, downloadable as PDF

**Why we beat 12,000 other teams (your selling angles):**
- **Built on KSP's literal database schema.** They published their real FIR-system ER diagram; our tables match it field-for-field. Every other team will invent their own data model. Judges from SCRB will see their own column names → "this plugs in tomorrow" is a demonstrated fact, not a claim
- **The headline feature is rare.** Everyone will bring maps and charts. Almost nobody will bring cross-district serial-crime linkage that reads Kannada FIR text — and we prove it works with a blind test (see your secret task, §5)
- **Every AI claim has a number behind it.** Blind-test precision for linkage; a real-data benchmark (Chicago open crime data) for forecasting. No hand-waving
- **Ethics by design.** Caste/religion/occupation are never used by any model and never shown on any screen; NETRA predicts places and patterns, never people; every AI output explains its reasons. Government judges probe this hard — we answer before they ask
- **100% on Zoho Catalyst** (the mandatory platform), using their services end to end — sponsor alignment
- **Team story:** 3 students, ₹0 infrastructure cost, 15 days

**What NETRA is NOT (don't accidentally claim these):** not a chatbot (that's Challenge 1's problem statement), not predicting individuals or "pre-crime", not CCTV/facial recognition, not using any real crime data (all demo data is synthetic, generated to KSP's schema — always disclose this).

## Your 5 deliverables & deadlines

| # | Deliverable | Deadline | Notes |
|---|---|---|---|
| 1 | Prototype Deck (official template, PDF ≤5MB) | skeleton **Jul 17** · v1 **Jul 22** · final **Jul 25** | Template compliance is MANDATORY — any other format may be rejected |
| 2 | Prototype Brief (≤1024 characters) | draft **Jul 22** · final **Jul 25** | Typed into the submission form |
| 3 | Demo video (3 min, edited) | rough cut **Jul 23** · final **Jul 25** | Aditya records screen + narration; you edit, title, pace |
| 4 | 🕵️ Blind-test scenarios (SECRET) | **Jul 15** | See §5 — do NOT show Aditya |
| 5 | Submission QA | **Jul 26 morning** | Every link tested from incognito browser |

Download the official template from the Datathon portal (Submission section → "CLICK HERE TO DOWNLOAD THE TEMPLATE") on day one. Build inside it from the start — don't design in your own format and "convert later."

## 1. The Deck — slide-by-slide script

Follow the official template's required sections first; fold the content below into its structure. One message per slide. Every claim needs a number. Real screenshots only (no stock images, no mockups pretending to be product).

**S1 — Title.** NETRA — Networked Evidence, Tracking & Risk Analytics. Tagline: *"From 22 lakh FIRs to Monday-morning decisions."* Team name, challenge number (Challenge 2), one clean logo mark (ask me/Aditya to generate one).

**S2 — Problem.** 1,100+ KSP stations file FIRs into siloed records. Three consequences, one line each: serial offenders invisible across district borders · patterns found weeks late, manually · leadership reviews outcomes, never predicts. Use 1–2 NCRB statistics (Aditya provides by Jul 17; e.g., property-crime detection rates).

**S3 — Solution overview.** One diagram, five capabilities around the NETRA eye: See (map/hotspots) · Track (trends/alerts) · Connect (offender network) · Judge (A/B/C outcomes) · Act (forecast + patrol + briefing). NO text paragraphs on this slide.

**S4 — ⭐ Headline: Cross-District Case Linkage.** The slide that wins or loses us the shortlist. Screenshot of the Linkage screen showing one serial cluster spanning 3 districts + the live-match box with a similarity result. Caption story: *"9 burglaries. 3 districts. 3 different investigating officers. One modus operandi — found in 40 ms."* Bottom banner (Aditya provides number by Jul 21): **"Blind evaluation: X/5 planted serial patterns recovered, precision Y%."**

**S5 — Forecast & patrol.** Screenshot: forecast heatmap + a patrol suggestion card. Banner: **"Method validated on real data: Chicago open crime dataset, hit-rate@top-10% cells = Z"** (Aditya provides). Sub-line: features are place/time/crime-type ONLY — no personal data.

**S6 — Command of the data.** 2×2 screenshot grid: Command Map with hotspots · anomaly alert feed · offender network graph · A/B/C outcome analytics. One-line caption each.

**S7 — AI Daily Briefing.** Screenshot of the brief in English AND Kannada side by side + PDF. Line: *"Every SP starts the day with 1 page, not 1,000 rows — in their language."*

**S8 — Built on KSP's own schema.** LEFT: cropped snippet of KSP's official ER PDF. RIGHT: our matching Data Store table names (CaseMaster, ArrestSurrender, ChargesheetDetails…). Line: *"Field-for-field faithful to the SCRB FIR system — NETRA plugs into real data with zero remodeling."* This slide = instant credibility with police judges.

**S9 — Architecture on Catalyst.** Aditya gives you the diagram (from docs/SYSTEM_DESIGN.md). Include the capability→Catalyst service table: AppSail, Web Client Hosting, Data Store, Authentication, QuickML, SmartBrowz, Cron. Sponsor alignment matters — this slide shows we built ON the platform, not beside it.

**S10 — Responsible AI.** Four checks, big type: ✅ Caste/religion/occupation excluded from every model AND never displayed ✅ Predicts places & patterns, never people ✅ Every score explains its top-3 reasons ✅ Human-in-the-loop decision support. Government judges WILL probe this; the slide answers before they ask.

**S11 — Honest engineering.** Data-quality panel screenshot (% FIRs missing coordinates + fallback behavior) + one line on blind-test methodology. Nobody else will show their system's limits — that's exactly why we do.

**S12 — Impact & roadmap.** 3 quantified impact bullets (with Aditya). Roadmap: Prototype (today) → SCRB data integration pilot → statewide rollout; one line on cost (runs on Catalyst, no exotic infra).

**Design rules:** dark theme consistent with product (near-black `#0B1220`, off-white text, one cyan accent `#22D3EE`) unless the official template forces its own look — template wins. Font: Inter or template default. Max ~25 words/slide outside captions. Compress screenshots (TinyPNG) — hard 5MB limit on the PDF. Export check: fonts embedded, no broken images, opens in a plain PDF viewer.

## 2. Prototype Brief (≤1024 chars) — draft to refine

Count characters in the form before submitting. Working draft (~980 chars):

> NETRA (Networked Evidence, Tracking & Risk Analytics) addresses Challenge 2: transforming fragmented FIR records into actionable intelligence for Karnataka State Police. Built field-for-field on the official SCRB FIR schema, NETRA delivers: (1) AI case linkage that reads FIR narratives (English & Kannada) and connects serial crimes across district borders, validated by blind testing; (2) 7-day hotspot forecasting with patrol recommendations, benchmarked on real open crime data; (3) interactive Karnataka map with drilldowns, DBSCAN hotspots and anomaly alerts; (4) offender network analysis and repeat-offender tracking; (5) case-outcome analytics (chargesheet/false/undetected rates); (6) AI daily briefings in English and Kannada. Role-based access mirrors the police hierarchy (HQ/District/Station). Stack: React, Node/Express and Python ML, deployed fully on Zoho Catalyst (AppSail, Data Store, Authentication, QuickML, SmartBrowz). Ethics by design: no demographic features, explainable outputs, human-in-the-loop.

## 3. Demo video (3 min) — beat sheet you edit to

Aditya records raw screen captures + voiceover; you cut, title, and pace it. Beats:
- 0:00–0:20 — Problem: siloed FIRs, invisible serial crime (2–3 title cards, urgent pace)
- 0:20–0:40 — NETRA intro: login as SP → Command Map reveal (the "wow" establishing shot)
- 0:40–1:40 — ⭐ Linkage: open serial cluster spanning districts → paste a NEW FIR into live match → watch it match "87%, Serial Cluster #3." Slow down here; this is the money shot
- 1:40–2:10 — Forecast heatmap + patrol card; flash the Chicago-benchmark banner
- 2:10–2:35 — Rapid montage: alerts, network graph, outcomes, Kannada briefing PDF
- 2:35–3:00 — Ethics card (4 checks) → Catalyst architecture card → close on logo + one-line impact
Rules: no dead air >2s, captions for every feature name (judges may watch muted), 1080p, upload as **unlisted YouTube** (preferred — no permission bugs) and test in incognito.

## 4. Submission-day QA checklist (Jul 26, morning — not 11 PM)

- [ ] Deck: official template ✓ PDF ✓ ≤5MB ✓ opens clean
- [ ] Brief: ≤1024 chars, pasted, no truncation
- [ ] GitHub repo: PUBLIC (Aditya flips it), README renders, clone-and-run instructions present
- [ ] Video: plays in incognito, audio synced
- [ ] Catalyst deploy link: loads in incognito, demo logins work (get 3 role credentials from Aditya)
- [ ] Form submitted well before 11:59 PM IST — target 6 PM

## 5. 🕵️ SECRET TASK — blind-test author (do NOT show Aditya)

Why: our deck claims the AI finds serial patterns it was never shown. That's only honest if the patterns were planted by someone other than the person who built the AI. That's you.

By **Jul 15**: write 5 fictional serial-crime scenarios in ordinary prose in a private file (NOT in the repo). Each: crime type, distinctive repeated MO details (entry method, tool, target type, time window), 4–8 incidents, 2–3 named Karnataka districts, date spread. Example: *"Night burglar hits ground-floor pharmacies in Tumakuru/Chitradurga/Davanagere between 1–3 AM, angle-grinds the rear shutter, takes only cash and codeine syrups, leaves CCTV cameras spray-painted black. 7 incidents, Feb–Jun 2026."* Make 2 easy, 2 medium, 1 hard (same MO but different wording styles, one partly in Kannada).
Aditya will give you a one-command injection script + a form to fill; you run it yourself. Reveal the answer key only when he reports his results. Then the number goes on Slide 4.

## Assets you collect (nag people early)

| Asset | From | When |
|---|---|---|
| Official template | Portal (Aditya's login) | Jul 12 |
| NCRB stats + impact numbers | Aditya | Jul 17 |
| Architecture diagram export | docs/SYSTEM_DESIGN.md | Jul 17 |
| App screenshots (final UI) | Frontend teammate | Jul 21–22 |
| Blind-test + benchmark numbers | Aditya | Jul 21 |
| Raw video captures + voiceover | Aditya | Jul 22–23 |
| Demo login credentials | Aditya | Jul 25 |
