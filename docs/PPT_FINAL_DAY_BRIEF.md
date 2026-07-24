# NETRA — Final-Day Brief (submission Jul 26, 6 PM target)

`TEAMMATE_PPT_GUIDE.md` is still the plan — slide order, video beat sheet, prototype
brief text, tone rules. **Nothing in it changes.** This file is only *where we actually
are* on the last day, so nobody re-derives it.

---

## 🔴 Two blockers — Aditya owns both, do them FIRST

| # | Blocker | Why it matters |
|---|---|---|
| 1 | **GitHub repo is PRIVATE** | The submission checklist requires a public repo link. A judge clicking a 404 is a scoring disaster. Make it public and verify it opens **logged out** (incognito). |
| 2 | **`main` is behind what's deployed** | The live site runs branch `integrate/polish-frontend`. `main` does not have the frontend polish, the live alert bell, or the chart fixes. If judges read the repo they see older code than the demo. Merge to `main` before making it public. |

Deployed link is healthy: `https://netra-60077866273.development.catalystserverless.in/app/` → HTTP 200.

---

## ✅ Already done — use these, don't re-make them

### The numbers (from `DECK_METRICS.md` — every one measured & reproducible)

Quote these **verbatim**. They are the difference between "our AI works" and proof.

- **Case linkage blind test (Slide 4, the star):** recovered **5 of 5** hidden serial
  patterns at **0.96 precision**, mixed among **1,500** distractor FIRs. The patterns were
  authored independently — the person who built the AI never saw them.
- **Forecasting (Slide 5):** validated on **503,468 real City-of-Chicago crimes**
  (2022–23, 77 areas). Spatio-temporal **LSTM: hit-rate@top-10 = 0.867, R² = 0.950**,
  beating gradient boosting (0.858 / 0.948) on real data.
  **Say the honest part too:** a moving-average baseline scores 0.85 on the same metric
  and slightly better raw error (MAE 8.22 vs 8.71) — we win on *hotspot ranking*, which is
  what a patrol planner uses, and we do not claim to beat it on count error.
- **Patrol optimizer:** greedy submodular allocation, provable **(1 − 1/e) ≈ 63%**
  optimality guarantee. Deterrence grounded in the **Minneapolis Hot-Spots RCT** and the
  **Koper Curve** — real studies, not a number we invented. On Chicago, the top-10 of 77
  areas hold **33.6%** of all crime, which is what justifies concentration.
- **Detection-risk model:** gradient boosting, **ROC-AUC 0.71**, drivers via permutation
  importance.

### Screenshots — `deck-assets/` in the repo root

Freshly captured **today** at 2× retina, from the current build, with the floating
copilot button hidden so nothing overlaps content.

| File | Slide | What it shows |
|---|---|---|
| `S4-linkage-star.png` | **S4 ⭐** | Serial clusters + satellite route, predicted base, next-strike window, Crime DNA |
| `S5-analytics-trends.png` | S5 | Monthly FIR trends + forecast projection, Crime Clock heatmap |
| `S6-command-map.png` | S6 | Karnataka 3D density map, stat row, live alerts |
| `S6b-alerts.png` | S6 | Anomaly & Alert Center with "why flagged" + lifecycle |
| `S6c-case-search.png` | S6 | FIR register search + Smart MO semantic search |
| `S6e-offender-network.png` | S6 | Organized-crime rings, kingpins, predicted emerging ties |
| `S6f-case-outcomes.png` | S6 | Chargesheet / false / undetected analytics |
| `S6d-documents.png` | S6 | Document centre |
| `S7-briefing.png` | S7 | Daily briefing (EN/KN) + PDF export |

⚠️ **They total ~11 MB at 2×.** The deck must be **under 5 MB** — run them through
tinypng.com, or drop to 1× when placing. Do not ship the raw files.

---

## ⏳ Still outstanding

| What | Owner | Note |
|---|---|---|
| Deck built in the **official Hack2Skill template** | PPT teammate | Non-negotiable format — wrong template risks rejection |
| Prototype brief ≤ **1024 characters** | PPT teammate | Draft is in the main guide §3b (~980 chars) — count before pasting |
| Demo video ~3 min | PPT teammate (Aditya records raw) | Beat sheet in main guide §3c. Unlisted YouTube, test in incognito |
| 3 demo logins (HQ / District / Station) | Aditya | Needed on the submission form |
| Architecture diagram | Aditya / Designer | Slide 9 |
| NCRB statistics for the problem slide | Aditya | Slide 2 |

---

## Known rough edges — do NOT put these on a slide

Honest internal list so nobody accidentally demos a weak spot:

- The Copilot loses series context on follow-ups ("draw the link chart for **this series**"
  after a named query answers "I don't hold that in the records"). **In the video, always
  name the series explicitly.**
- Diagram nodes truncate FIR numbers to the last 6 digits, so different FIRs can render as
  the same `FIR ..300001`. Avoid a tight crop of a link chart's node labels.
- The line chart's lower four district series still overlap; colours are now distinguishable
  but it is not small-multiples clean.

See `netra-deferred-issues` for the full list.

---

## Submission-day checklist (morning of Jul 26 — not 11 PM)

- [ ] Repo **public** + opens logged-out
- [ ] `main` merged so the repo matches the live demo
- [ ] Deck: official template · PDF · **< 5 MB** · opens cleanly
- [ ] Brief: ≤ 1024 chars, not truncated
- [ ] Video: plays in incognito, audio synced, captions on
- [ ] Catalyst link opens in incognito, all 3 logins work
- [ ] **Submit by 6 PM IST** (deadline 11:59 PM — do not use the buffer)

Always disclose the data is synthetic. With government judges honesty scores; getting
caught hiding it loses everything.
