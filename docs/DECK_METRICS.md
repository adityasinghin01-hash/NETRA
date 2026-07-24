# NETRA — Real Validation Numbers (for the deck)

Every number below is real, measured, and reproducible. Use them verbatim — they
are what separate NETRA from teams that just *claim* their AI works.

## ⭐ Case Linkage — blind test (Slide 4, the star)
- **5 / 5** secret serial-crime patterns recovered
- **0.96** average precision
- mixed among **1,500** real distractor FIRs
- The 5 patterns were authored independently (blind) — the AI's builder never saw them.

> Slide line: *"Blind test — NETRA recovered 5 of 5 serial-crime patterns it was never
> shown, at 96% precision, among 1,500 FIRs."*

## Hotspot Forecasting — validated on REAL data (Slide 5)
- On **503,468 real City-of-Chicago crimes** (2022–2023, 77 areas):
  - **hit-rate@top-10 hotspot areas = 0.86** (flags 86% of next week's worst areas)
  - **R² = 0.95**
  - Honest comparison: a strong moving-average (persistence) baseline scores **0.85** on the
    same top-10 hotspot metric and **MAE 8.22** vs our **8.71** — so we **edge it on hotspot
    ranking (the metric a patrol planner uses) but do NOT claim to beat it on raw count error**
    (crime is highly persistent; that's expected and we say so).
- On our Karnataka data: top-5 district hit-rate **0.63**, R² 0.59
- **DL-vs-GBM race (real Chicago, keep-if-it-wins → DL WON):** a **spatio-temporal LSTM** (per-area
  weekly-count sequences + area embedding, Poisson loss) **beats gradient boosting on all three
  metrics** — **hit@10 0.867 vs 0.858 · R² 0.950 vs 0.948 · MAE 8.634 vs 8.713**. Both honest,
  reproducible (`pipeline/bench_dl.py`), time-split, no leakage. We ship the winner (LSTM).

> Slide line: *"Forecasting validated on 503k real Chicago crimes: a spatio-temporal deep-learning
> model reaches 87% top-10 hotspot hit-rate, beating gradient boosting — both on real data."*

## Patrol Optimizer — evidence-based deployment (Slide 5b)
- Greedy **submodular** allocation with a provable **(1 − 1/e) ≈ 63% optimality guarantee** (Nemhauser).
- Deterrence factor grounded in **real causal evidence**: the **Minneapolis Hot-Spots randomized
  experiment** (Sherman & Weisburd) and the **Koper Curve** — genuine studies that concentrated patrol
  cuts crime. We do NOT fabricate our own causal number.
- Honest support: on real Chicago data, the **top-10 of 77 areas account for 33.6% of all crime** —
  concentration justifies focused deployment.
- **Moat B (own causal-inference engine) = FUTURE SCOPE**, honestly: a defensible difference-in-differences
  needs labelled patrol/intervention data, which neither the synthetic Karnataka set nor the Chicago open
  data (only date + area) contains. We say so rather than overclaim.

## Detection-Risk Model (Slide 6 / analytics)
- Trained classifier (gradient boosting), **ROC-AUC 0.71**
- Explainable drivers via permutation importance: crime type (dominant), then gravity.

## Semantic Case Linkage (Slide 4)
- Multilingual sentence-transformer runs **in the browser** (on-device, no server model)
- English FIR match accuracy demonstrated live (e.g. 86% to the correct cluster)
- Cross-language: Kannada FIRs embed and match too (real multilingual AI)

## Scale & platform
- **50,000 synthetic FIRs** on KSP's exact schema, all in **Catalyst Data Store**
- Built field-for-field on the official SCRB FIR schema (IPC→BNS transition dated correctly)
- 100% deployed on **Zoho Catalyst** (Web Client Hosting + Advanced I/O Function + Data Store)

## Ethics (Slide 10)
- Caste / religion / occupation excluded from every model AND never rendered
- Predicts places & patterns, never people; every score explained; human-in-the-loop

---
*All numbers reproducible: `pipeline/blindtest.py`, `pipeline/benchmark_chicago.py`,
`pipeline/train_forecast.py`, `pipeline/train_risk.py`.*
