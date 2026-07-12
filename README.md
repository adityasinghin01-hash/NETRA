# NETRA 👁️

**N**etworked **E**vidence, **T**racking & **R**isk **A**nalytics

> An AI crime-intelligence platform for the **Karnataka State Police**, built for
> **Challenge 2 of the KSP Datathon 2026**. NETRA turns fragmented FIR records into
> live intelligence — where crime clusters, which crimes are connected, what's coming
> next week, and what to do about it.

**🔴 Live demo:** https://netra-60077866273.development.catalystserverless.in/app/
*(deployed on Zoho Catalyst · demo logins: HQ / District / Station on the sign-in screen)*

> ⚠️ All data is **synthetic** — generated to KSP's official FIR schema. No real crime
> data is used (KSP's FIR data is confidential; only the schema is public).

---

## What it does — 5 pillars

| | Pillar | Capability |
|---|---|---|
| 🗺️ | **See** | Interactive Karnataka map (dark + satellite), 5,000 plotted incidents, district crime choropleth, hotspots |
| 📈 | **Track** | Crime trends over time + automatic anomaly **alerts** |
| 🕵️ | **Connect** ⭐ | **Live case linkage** — paste an FIR (English *or* Kannada), a semantic AI model finds its serial-crime cluster across districts; plus an offender-network graph |
| 📊 | **Judge** | Case-outcome analytics (chargesheet / false / undetected) + a trained **detection-risk** model with explainable drivers |
| 📄 | **Act** | 7-day **hotspot forecast** + patrol plan (trained model); **AI daily briefing** per district (EN/Kannada, PDF) |

Plus: **role-based access** (HQ / District / Station see scoped views) and **case search**
over all 50,000 FIRs, and **ethics by design** (no demographic features; explainable;
human-in-the-loop).

## Proof it works (real, measured — see [`docs/DECK_METRICS.md`](docs/DECK_METRICS.md))

- **Case linkage — blind test: recovered 5/5 secret serial-crime patterns at 96% precision** among 1,500 FIRs (patterns authored independently of the model).
- **Forecasting — validated on 503k real City-of-Chicago crimes:** 84% top-10 hotspot hit-rate, R² 0.94.
- **Detection-risk model:** ROC-AUC 0.71 with explainable feature importances.
- **50,000 FIRs** live in Catalyst Data Store on the exact KSP schema (IPC→BNS transition dated correctly).

## Architecture (100% on Zoho Catalyst)

```
React SPA  ──►  Catalyst Web Client Hosting            (the 6 screens)
   │
   ├─ /server/netra_api  ──►  Catalyst Advanced I/O Function (Express)
   │                              └─►  Catalyst Data Store  (Store + 50k Cases, ZCQL)
   └─ in-browser transformer (transformers.js) for semantic linkage

Offline Python pipeline (scikit-learn / pandas): generates the dataset and trains the
forecast, risk, linkage and network models → precomputed results served by the app.
```

## Tech stack
React 19 · Vite · TypeScript · Tailwind v4 · Leaflet · Recharts · react-force-graph ·
transformers.js — Node/Express on Catalyst Functions — Python · scikit-learn · pandas —
Zoho Catalyst (Web Client Hosting · Advanced I/O Functions · Data Store).

## Run it locally

```bash
# 1. Frontend (dev, uses mock data)
cd frontend && npm install && npm run dev        # http://localhost:5173/app/

# 2. Reproduce the dataset + models (Python 3.9+)
pip install scikit-learn pandas numpy
python3 -m pipeline.generator.generate           # 50k synthetic FIRs
python3 -m pipeline.validate                     # 24 correctness checks
python3 -m pipeline.train_forecast               # trained forecast model + metrics
python3 -m pipeline.train_risk                   # trained risk model + metrics
python3 -m pipeline.benchmark_chicago            # real-data benchmark
python3 -m pipeline.blindtest --calibrate        # linkage blind-test harness

# 3. Deploy to Catalyst (needs `catalyst login`)
bash scripts/deploy-client.sh                    # frontend → Web Client Hosting
catalyst deploy --only functions                 # API → Advanced I/O Function
```

## Repo structure
```
frontend/     React app (6 screens) → Catalyst Web Client Hosting
functions/    netra_api — Express API (ZCQL over Data Store) → Catalyst Function
pipeline/     dataset generator, model training, benchmark, blind test (Python)
docs/         system design, build plan, deck metrics, teammate guides
scripts/      deploy helpers
```

## Team
Built by a team of 3 for KSP Datathon 2026 · Challenge 2.

---
*NETRA (नेत्र) means "eye" in Sanskrit — the watchful eye of Karnataka Police.*
