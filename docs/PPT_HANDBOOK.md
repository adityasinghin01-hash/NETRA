# NETRA — Presentation & Submission Handbook

**For: the presentation teammate. This is your only file.** It replaces the older
`TEAMMATE_PPT_GUIDE` and `PPT_FINAL_DAY_BRIEF` — everything from both is folded in here.

You own what the judges **read and watch**: the deck, the demo video, and the submission.
Judging happens from your materials (no live demo on Jul 26), so this is roughly **half of
what wins this**.

**Contents**
- **Part 1 — The deck**, slide by slide (S1–S12) ← start here
- **Part 2 — The prototype brief** (≤1024 characters, ready to paste)
- **Part 3 — The demo video** (~3 min beat sheet)
- **Part 4 — What you still need from Aditya**
- **Part 5 — Do NOT show these**
- **Part 6 — Submission-day checklist**

---

# PART 1 — THE DECK

Build one slide at a time, top to bottom. Each slide gives you: the heading, the
sub-headings, the exact words, the numbers, which screenshot to place, and — where a chart
or diagram is needed — a ready-to-paste prompt to generate it.

**Before slide 1:** download the **official Hack2Skill submission template** from the
portal (Submission → "download template") and build inside it. Using another format can
get us rejected. If the template's required section order differs from below, **the
template wins** — fold this content into its sections.

### Rules that apply to every slide
- **One message per slide.** Max ~25 words of body text.
- **Every claim carries a number.** "Found 5 of 5" beats "very accurate".
- **Real screenshots only** — all provided in `deck-assets/`. Never a stock photo posing as our app.
- **Always disclose the data is synthetic.** With government judges, honesty scores; getting caught hiding it loses everything.
- Export PDF, **under 5 MB**. Our screenshots are 2× retina (~6 MB total) — compress at tinypng.com or place at 1×.

### Words we never use
"Predicts criminals" · "identifies suspects" · "surveillance" · "real crime data" · "chatbot".
We predict **places and patterns, never people**, on **synthetic** data.

---

## S1 — Title

**Heading:** NETRA
**Sub-heading:** Networked Evidence, Tracking & Risk Analytics
**Tagline (use verbatim):** *From lakhs of FIRs to Monday-morning decisions.*

**Also on slide:** team name · "Challenge 2 — KSP Datathon 2026" · the NETRA logo (from the Designer).
**Footer strip (small):** *Prototype · synthetic data generated to KSP's official FIR schema.*

**Image:** logo only. No screenshot — let the title breathe.

---

## S2 — The Problem

**Heading:** Lakhs of FIRs. Almost no intelligence.
**Sub-headings + copy (three blocks, one line each):**

1. **Siloed** — 1,100+ police stations file FIRs into one database that nobody can see across.
2. **Invisible serial crime** — one offender hitting 3 districts looks like 3 unrelated small cases to 3 officers who never speak.
3. **Always looking backwards** — officers see last month's counts, never next week's risk.

**Data to add:** 1–2 NCRB statistics on Karnataka case volume / pendency. **Owner: Aditya** — do not invent these; leave the box empty until he sends them.

**Diagram to generate** — paste into any diagram tool (or ask Aditya to render the mermaid):
```
flowchart LR
  A["Station A<br/>burglary FIR"] --> X["🚫 no shared view"]
  B["Station B<br/>burglary FIR"] --> X
  C["Station C<br/>burglary FIR"] --> X
  X --> R["3 small unsolved cases<br/>1 offender nobody sees"]
```
**Style:** dark background (#0b1220), cyan/amber accents, no photos.

---

## S3 — The Solution

**Heading:** One platform. Five capabilities.
**Sub-heading:** Built field-for-field on KSP's official FIR schema.

**Layout:** the NETRA eye in the centre, five labelled nodes around it. **Chart type: radial/hub diagram, NOT a bar chart.**

| Icon | Pillar | One line |
|---|---|---|
| 🗺️ | **SEE** | Live Karnataka map — where crime clusters, state → district → station |
| 📈 | **TRACK** | Trends over time + automatic anomaly alerts |
| 🕵️ | **CONNECT** ⭐ | Links the same offender across districts by *method* — English & Kannada |
| 📊 | **JUDGE** | Case outcomes: chargesheeted / false / undetected |
| 📄 | **ACT** | 7-day forecast + patrol windows + daily briefing PDF |

**Generation prompt (for an AI diagram/image tool):**
> A dark navy (#0b1220) radial hub-and-spoke diagram. Centre: a glowing cyan stylised eye labelled "NETRA". Five evenly spaced nodes around it labelled SEE, TRACK, CONNECT, JUDGE, ACT, each with a thin cyan connector line to the centre. Minimal, technical, no photographs, no clip-art. 16:9.

**Emphasise CONNECT visually** — thicker connector, brighter node. It is our differentiator.

---

## S4 — ⭐ Case Linkage (the star slide — spend the most time here)

**Heading:** One offender. Three districts. Found in under a second.
**Sub-heading:** AI reads the *narrative*, not keywords — and works in English and ಕನ್ನಡ.

**Image:** `deck-assets/S4-linkage-star.png` — full-bleed or large. It shows the serial-cluster
list, the satellite route map, predicted base zone, next-strike window and the Crime DNA panel.

**Caption under the image (verbatim):**
> *8 burglaries. 3 districts. 3 officers who never spoke. One shared method — surfaced automatically.*

**The proof banner (this is the single most valuable claim in the deck — use verbatim):**
> **Blind test: NETRA recovered 5 of 5 hidden serial-crime patterns at 0.96 precision, mixed among 1,500 decoy FIRs.**
> The patterns were written by a teammate and never shown to the person who built the AI.

**Three call-outs to place around the screenshot:**
- **Crime DNA** — the modus-operandi fingerprint shared across the series (time of night, entry method, target, tools).
- **Predicted base zone** — Rossmo geographic profiling. **A place, not a person.**
- **Next strike window** — projected from the series' own cadence.

**Speaker note (if presenting):** "Cohesion % = how tightly the member FIRs share one MO. It is a measured cosine similarity, not a confidence we made up."

---

## S5 — Forecasting & Patrol

**Heading:** Next week's hotspots — validated on real data.
**Sub-heading:** We tested on 503,468 real crimes, not just our own synthetic set.

**Image:** `deck-assets/S5-analytics-trends.png` (trend + forecast projection + Crime Clock heatmap).

**Numbers block — use exactly, including the honest caveat:**
- Validated on **503,468 real City-of-Chicago crimes** (2022–23, 77 areas)
- Spatio-temporal **LSTM: top-10 hotspot hit-rate 0.867 · R² 0.950**
- Beats gradient boosting (0.858 / 0.948) — **both trained and tested on real data**
- **Honest line (keep it in):** a moving-average baseline scores 0.85 on the same metric and slightly better raw error (MAE 8.22 vs 8.71). *We win on hotspot ranking — the metric a patrol planner actually uses — and we do not claim to beat it on raw count error.*

**Patrol optimizer block:**
- Greedy **submodular allocation** with a provable **(1 − 1/e) ≈ 63% optimality guarantee**
- Deterrence grounded in the **Minneapolis Hot-Spots RCT** and the **Koper Curve** — real published studies, not a number we invented
- On Chicago, the **top 10 of 77 areas hold 33.6% of all crime** — which is what justifies concentrating patrols

**Chart to generate (optional, only if there's room):**
> **Type: grouped horizontal bar, 2 groups × 3 metrics.** Compare LSTM vs Gradient Boosting on hit@10 (0.867 / 0.858), R² (0.950 / 0.948), and MAE (8.634 / 8.713 — label "lower is better").
> Dark background, two series only: cyan (#0891b2) for LSTM, orange (#d95926) for GBM. Value labels on each bar. No 3D, no gradients. **Y-axis must start at 0.**

---

## S6 — The Working Product

**Heading:** Not slides — a working system.
**Sub-heading:** Deployed and live on Zoho Catalyst.

**Layout: 2×2 screenshot grid** (pick the four strongest):

| Position | File | Label under it |
|---|---|---|
| Top-left | `S6-command-map.png` | **Command Map** — 5,000 incidents, hotspot density, drill-down |
| Top-right | `S6e-offender-network.png` | **Offender network** — rings, kingpins, predicted emerging ties |
| Bottom-left | `S6b-alerts.png` | **Anomaly alerts** — each with a *why*, and a lifecycle to work |
| Bottom-right | `S6f-case-outcomes.png` | **Case outcomes** — chargesheeted / false / undetected |

**Spares if you need them:** `S6c-case-search.png` (semantic "Smart MO" search), `S6d-documents.png` (document centre).

**One line at the bottom:** *Every number on every screen is computed from the data — nothing on these screens is mocked-up art.*

---

## S7 — AI Daily Briefing

**Heading:** Every SP's Monday morning, written for them.
**Sub-heading:** English and ಕನ್ನಡ · one page · exports to PDF.

**Image:** `deck-assets/S7-briefing.png`

**Three bullets:**
- Auto-written per district from that district's own numbers — never a template with blanks filled in
- **Kannada is first-class**, not an afterthought — the same briefing, natively
- Exports as a police-letterhead PDF, plus a fax-ready monochrome sheet for stations still on fax

**Footer line:** *Decision support — verify against ground reports before acting (human-in-the-loop).*

---

## S8 — Built on KSP's Real Schema

**Heading:** This plugs into real data on day one.
**Sub-heading:** Field-for-field faithful to KSP's official FIR ER model.

**Layout: two columns.**
- **Left:** a crop of KSP's official ER diagram (from the schema PDF).
- **Right:** our matching table names from `docs/SYSTEM_DESIGN.md §3` (Aditya supplies the crop).

**Caption:** *We did not invent a convenient schema. We mirrored theirs — so this is an integration, not a rebuild.*

**Honesty line (required):** *All demo records are synthetic, generated **to** that schema. KSP's real FIR data is confidential; only the schema is public.*

---

## S9 — Architecture on Catalyst

**Heading:** Runs entirely on Zoho Catalyst.
**Sub-heading:** Sovereign by design — FIR text never leaves the device.

**Diagram to generate — this is the real deployed architecture (do NOT copy the older target diagram in SYSTEM_DESIGN.md, which describes AppSail):**
```
flowchart TB
  subgraph Client["Browser (officer's machine)"]
    SPA["React SPA"]
    EMB["Sentence-transformer<br/>runs IN-BROWSER<br/>(FIR text never leaves device)"]
  end
  subgraph Catalyst["Zoho Catalyst"]
    WCH["Web Client Hosting<br/>(serves the app)"]
    FN["Advanced I/O Function<br/>netra_api (Express)"]
    DS[("Data Store<br/>KSP FIR schema +<br/>precomputed analytics")]
    QML["QuickML<br/>GLM-4.7 + Qwen VLM"]
  end
  subgraph Offline["Offline (not deployed)"]
    PIPE["Python pipeline<br/>pandas · scikit-learn · networkx<br/>clusters · forecasts · risk · network"]
  end
  SPA --> WCH
  SPA --> FN
  FN --> DS
  FN --> QML
  PIPE -->|bulk write| DS
```

**Services table (shows we used the sponsor platform properly):**

| Catalyst service | What we use it for |
|---|---|
| Web Client Hosting | Serves the React app |
| Advanced I/O Function | `netra_api` — Express API, RBAC scoping, LLM proxy |
| Data Store | Relational — mirrors KSP's FIR schema + precomputed analytics tables |
| QuickML | Sovereign LLM serving (GLM-4.7 text, Qwen VLM for scanned-document OCR) |

**Sovereignty line (accurate — do not overstate):** *Semantic matching runs in the browser via transformers.js, so FIR narratives are never sent to any external inference API. Model **weights** are still fetched from the open-weights host on first load — documented honestly in `docs/SOVEREIGN-MODEL.md`.*

---

## S10 — Responsible AI

**Heading:** The constraints came first.
**Sub-heading:** Not a compliance slide — these are enforced in code.

**Four big ticks (icon + one line each):**
- ✅ **No caste, religion or occupation** in any model. The fields exist in the schema for fidelity, but are excluded from every feature set and never rendered by any screen or API response.
- ✅ **Places and patterns, never people.** Forecast features are place / time / crime-type only. The geographic profile predicts an area — a *zone, not a person*.
- ✅ **Every output explains itself.** Each alert carries a "why flagged" statistic; each AI answer carries citations and a reasoning trace. No black-box numbers.
- ✅ **A human always decides.** Every screen and every exported document is labelled decision support, human-in-the-loop.

**Closing line:** *An officer can always ask "why did it say that?" — and get an answer.*

---

## S11 — Honest Engineering

**Heading:** We tested it like we expect to be doubted.
**Sub-heading:** Showing the limits is what makes the numbers believable.

**Three blocks:**
1. **Blind test** — 5 patterns authored by a teammate, hidden among 1,500 decoy FIRs, never shown to the AI's builder. **Result: 5/5 recovered, 0.96 precision.**
2. **Benchmarked against a strong baseline on real data** — and we publish where the baseline wins (raw count error). A team that only reports wins is hiding something.
3. **Known limits stated in the repo** — `docs/SECURITY-NOTES.md` and `docs/SOVEREIGN-MODEL.md` record what is accepted, unfinished, or constrained by the platform.

**Optional image:** the data-quality panel screenshot (Aditya can capture) — it shows geocoding coverage, e.g. "94.1% geocoded", rather than hiding gaps.

---

## S12 — Impact & Roadmap

**Heading:** From prototype to statewide.
**Sub-heading:** Built by 3 students, ₹0 infrastructure cost, in ~2 weeks.

**Impact — three numbers:**
- **One arrest can close a series** — the Linkage screen names how many unsolved FIRs a single arrest could clear.
- **Patrol where it matters** — the top 10 of 77 areas held 33.6% of crime on real data; concentration is measurable, not a hunch.
- **Minutes, not weeks** — connecting cross-district serial crime goes from "nobody noticed" to under a second.

**Roadmap — a simple 3-step horizontal timeline (chart type: milestone timeline, not a Gantt):**

| Now | Next | Then |
|---|---|---|
| **Prototype** — synthetic data on KSP's schema, deployed on Catalyst | **Pilot** — one district, real FIR data behind KSP's firewall, officer feedback loop | **Statewide** — all districts, live ingestion, briefing to every SP each morning |

**Final line:** *NETRA doesn't replace an officer's judgement. It makes sure nothing reaches them too late.*

---

# PART 2 — THE PROTOTYPE BRIEF (≤ 1024 characters)

Type this into the submission form. **Count the characters before submitting** — the form
truncates silently. Draft below is ~980 chars; tweak freely but re-count after editing.

> NETRA (Networked Evidence, Tracking & Risk Analytics) addresses Challenge 2:
> turning fragmented FIR records into actionable intelligence for Karnataka State
> Police. Built field-for-field on the official SCRB FIR schema, NETRA delivers:
> (1) AI case linkage that reads FIR narratives (English & Kannada) and connects
> serial crimes across district borders, validated by blind testing; (2) 7-day hotspot
> forecasting with patrol recommendations, benchmarked on real open crime data;
> (3) an interactive Karnataka map with drilldowns, hotspots and anomaly alerts;
> (4) offender-network and repeat-offender analysis; (5) case-outcome analytics
> (chargesheet/false/undetected); (6) AI daily briefings in English and Kannada.
> Role-based access mirrors the police hierarchy (HQ/District/Station). Stack: React,
> Node/Express and Python ML, deployed fully on Zoho Catalyst. Ethics by design:
> no demographic features, explainable outputs, human-in-the-loop.

---

# PART 3 — THE DEMO VIDEO (~3 minutes)

Aditya records the raw screen capture + voiceover; **you edit, add titles, and pace it.**

| Time | Beat |
|---|---|
| 0:00–0:20 | **The problem** — siloed FIRs, invisible serial crime. Title cards, no UI yet. |
| 0:20–0:40 | Log in → the **Command Map** appears. This is the "wow" opening shot. |
| 0:40–1:40 | ⭐ **Linkage** — open a serial cluster spanning districts → paste a NEW narrative → watch it match. **Slow down here. This is the money moment.** |
| 1:40–2:10 | **Forecast + patrol window**; flash the "validated on 503k real Chicago crimes" number. |
| 2:10–2:35 | Quick montage: alerts → offender network → case outcomes → Kannada briefing PDF. |
| 2:35–3:00 | Ethics card → Catalyst architecture card → end on the logo + one impact line. |

**Rules**
- **Captions on every feature** — judges may watch muted.
- 1080p minimum. Unlisted YouTube link is the most reliable delivery; **test it in an incognito window**.
- When demonstrating the Copilot, **name the series explicitly** (see Part 5).
- Record a **backup take early**. A Wi-Fi failure on the 26th must not be able to sink us.

**Tools:** CapCut (free, easy) for editing; tinypng.com to compress deck images.

---

# PART 4 — What you still need from Aditya (chase these today)

| Item | For | Status |
|---|---|---|
| NCRB statistics (Karnataka volume/pendency) | S2 | ⏳ not yet supplied |
| KSP ER-diagram crop | S8 | ⏳ not yet supplied |
| Data-quality panel screenshot | S11 (optional) | ⏳ not yet supplied |
| 3 demo logins (HQ / District / Station) | submission form | ⏳ not yet supplied |
| Repo made **public** | submission link | ⏳ still private |
| Raw screen recordings + voiceover | demo video | ⏳ pending |

**Already delivered — don't ask again:** all 9 app screenshots (`deck-assets/`), every
validation number above, the architecture diagram source (S9), the prototype brief draft.

---

# PART 5 — Do NOT show these in the deck or video

Known rough edges. Not dishonest to omit — but do not walk a judge into them:
- The Copilot loses series context on follow-ups. **In the video, always name the series explicitly** ("draw the link chart for the shutter-cutting burglar"), never "…for this series".
- Diagram nodes truncate FIR numbers to the last 6 digits, so different FIRs can display the same `FIR ..300001`. **Don't crop tight on link-chart node labels.**
- The trend chart's lower four district lines overlap; readable, but don't zoom into that region.

---

# PART 6 — Submission-day checklist (morning of Jul 26 — not 11 PM)

Every item is required. A missing or broken link can disqualify us.

- [ ] Deck: official template · PDF · **< 5 MB** · opens cleanly on another machine
- [ ] Prototype brief: **≤ 1024 characters**, pasted, not truncated (Part 2)
- [ ] GitHub repo **public** + opens in incognito
- [ ] Demo video: plays in incognito, audio synced, **captions on** (judges may watch muted)
- [ ] Catalyst link opens in incognito; all 3 logins work
- [ ] **Submit by 6 PM IST.** Deadline is 11:59 PM — that buffer is for disasters, not for us.

---

# Why this matters

Presentation is **20–30% of most hackathon scores**. A clear deck and a crisp video
genuinely move us up the table; treating them as an afterthought is how good builds lose.

Three habits that decide it:
- **Tell a story, don't list features.** The winning frame is *"An SP opens NETRA on Monday
  morning and instantly sees what changed in her district."* Use it everywhere.
- **Numbers beat adjectives.** "Recovered 5 of 5 hidden patterns" beats "very accurate".
- **Always disclose the synthetic data.** Honesty scores with government judges — and being
  caught hiding it loses everything.
