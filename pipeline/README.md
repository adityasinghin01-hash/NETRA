# NETRA Data Pipeline

Generates the synthetic crime dataset NETRA runs on. **Real-inspired, factually
correct, and internally consistent** — built on the exact KSP FIR schema so the
platform could plug into real SCRB data with no remodeling.

> No real crime data is used. KSP's FIR data is confidential; they published only
> the *schema* (ER diagram). Every record here is synthetic, generated to that schema.

## Quick start

```bash
# from the repo root
python3 -m pipeline.generator.generate     # produce the full dataset  → pipeline/data/
python3 -m pipeline.validate               # 24 correctness/realism checks (exits non-zero on failure)
python3 -m pipeline.build_mock_seed         # derive pipeline/mock-seed.json for the frontend
```

Deterministic: a fixed seed (`generator/config.py`) means the dataset is fully
reproducible. Generation takes ~3 seconds. Pure Python standard library — no
external dependencies.

## What gets produced (`pipeline/data/`, git-ignored — reproduce with one command)

| File | Rows (approx) | KSP table |
|---|---|---|
| `cases.jsonl` | 50,000 | CaseMaster |
| `complainants.jsonl` | 50,000 | ComplainantDetails |
| `victims.jsonl` | ~18,500 | Victim |
| `accused.jsonl` | ~62,000 | Accused |
| `act_sections.jsonl` | ~70,000 | ActSectionAssociation |
| `arrests.jsonl` | ~28,500 | ArrestSurrender |
| `chargesheets.jsonl` | ~32,000 | ChargesheetDetails |
| `units.jsonl` | 259 | Unit (HQ → district → 227 stations) |
| `employees.jsonl` | 939 | Employee |
| `courts.json` / `offenders.json` | 31 / 700 | Court / Offenders |
| `planted_patterns.json` | — | ground truth for the known serial clusters & bursts |

Total ~330,000 rows across the schema. (One "FIR" expands to several rows, which is
why import into Catalyst is tiered against the Data Store's free-tier insertion quota.)

`pipeline/sample/` holds small committed samples for quick inspection without
regenerating. `pipeline/mock-seed.json` (committed, ~50 KB) holds mock API
payloads for frontend development.

## What makes it real-inspired & factually correct

- **31 real Karnataka districts** with real approximate centroids; **227 stations**
  named after **real localities** (Cubbon Park, Whitefield, Gokak, Sedam, …).
- **Authentic CrimeNo format** — the exact KSP structure `1 category + 4 district +
  4 station + 4 year + 5 serial` (18 digits), serials running per station/category/year.
- **Real IPC ⇄ BNS transition.** India replaced the IPC with the Bharatiya Nyaya
  Sanhita on **1 July 2024** — the generator cites **IPC** sections before that date
  and **BNS** sections on/after (e.g., murder: IPC 302 → BNS 103(1)). Special Acts
  (NDPS, POCSO, IT Act, Arms, Excise) applied where relevant.
- **Realistic distributions** — property crime dominates (theft, burglary, MV theft);
  heinous offences ~15%; Bengaluru Urban carries the largest share; weekend and
  festival-season upticks; night-time bias for burglary/theft.
- **Realistic outcomes** — chargesheet (A) / false (B) / undetected (C) mix ≈ 76/4/19,
  with property & cyber crime skewing undetected and crimes-against-body/women skewing
  chargesheeted; recent cases skew "under investigation".
- **~20% narratives in Kannada script**; the rest English. Narratives encode
  modus-operandi and are varied in wording (no two linked cases read identically).
- **~6% of cases intentionally lack GPS coordinates** — to exercise NETRA's honest
  data-quality panel and station-level fallback.

## Planted signal (for the analytics to discover)

`generator/planted.py` seeds **12 cross-district serial-crime clusters** (shared
modus operandi, shared offenders, varied wording — the case-linkage AI's target)
and **4 concentrated bursts** (for anomaly/hotspot detection). Ground truth is
written to `data/planted_patterns.json`.

> These are the **known** patterns, used to build and tune the linkage engine.
> They are **separate** from the blind-test patterns, which are authored by someone
> other than the person who built the matching model and scored only after the run —
> see the method note in `docs/DECK_METRICS.md`. Do not confuse the two.

## Ethics by design

Caste / religion / occupation exist on `ComplainantDetails` for schema fidelity
only. They are populated **statistically independently** of crime type, gravity,
and outcome — the data cannot be mined to associate any group with crime — and are
**never rendered** in the UI or used by any model. Caste uses coarse official
category buckets (mostly "Not Recorded", mirroring real FIR data quality), never
sub-caste names. Sensitive offences (rape, POCSO) get neutral, non-graphic,
access-restricted narratives, as such FIRs are actually handled.

## Layout

```
pipeline/
├── reference/          # curated inputs (districts, lookups, crime taxonomy, names/localities)
├── generator/          # config.py · narratives.py · planted.py · generate.py
├── build_mock_seed.py  # derives mock-seed.json from the real data
├── validate.py         # 24 correctness + realism checks
├── sample/             # small committed samples
├── mock-seed.json      # committed mock API payloads for the frontend
└── data/               # generated output (git-ignored; reproduce with the generator)
```

## Feeds which later phases

- **Phase 1 import** → `pipeline/data/*.jsonl` bulk-loaded (tiered) into Catalyst Data Store.
- **Phase 2 analytics** → `analytics/` reads the full dataset to compute hotspots,
  forecasts, linkage clusters, anomalies, risk scores, and offender network edges.
- **Frontend** → develops against `mock-seed.json` until live APIs land.
