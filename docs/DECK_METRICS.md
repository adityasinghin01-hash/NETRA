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
  - **hit-rate@top-10 hotspot areas = 0.84** (flags 84% of next week's worst areas)
  - **R² = 0.94**
- On our Karnataka data: top-5 district hit-rate **0.63**, R² 0.59
- Model: gradient boosting (HistGradientBoostingRegressor), time-based split, no leakage.

> Slide line: *"Forecasting validated on 503k real Chicago crimes: 84% top-10 hotspot
> accuracy, R² 0.94."*

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
