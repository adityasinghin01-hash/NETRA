# NETRA — System Design

**Networked Evidence, Tracking & Risk Analytics** · KSP Datathon 2026 · Challenge 2

> One-line architecture: React SPA on Catalyst Web Client Hosting → Express API on Catalyst AppSail → Catalyst Data Store (relational, mirroring KSP's FIR schema), with an offline Python pipeline that precomputes all AI results and a self-hosted embedding service powering live case-linkage matching.

---

## 1. Architecture Overview

```mermaid
flowchart TB
    subgraph Client
        SPA["React + Vite SPA<br/>(5 screens: Login · Command Map ·<br/>Linkage · District Analytics · Briefing)"]
    end

    subgraph Catalyst["Zoho Catalyst (mandatory platform)"]
        WCH["Web Client Hosting<br/>(serves SPA)"]
        AUTH["Catalyst Authentication<br/>(login, sessions)"]
        API["AppSail — Node managed runtime<br/>Express API + RBAC middleware"]
        EMB["AppSail — OCI container<br/>Embedding service<br/>(sentence-transformers, multilingual)"]
        DS[("Data Store<br/>(relational — KSP FIR schema<br/>+ precomputed analytics tables)")]
        QML["QuickML<br/>(LLM serving — daily briefing)"]
        SB["SmartBrowz<br/>(PDF generation)"]
        CRON["Catalyst Cron<br/>(daily briefing refresh)"]
    end

    subgraph Offline["Offline (local machines — not deployed)"]
        GEN["Synthetic FIR generator<br/>(Python + Gemini for narrative text)"]
        PIPE["Analytics pipeline<br/>pandas · scikit-learn · networkx<br/>hotspots · forecasts · linkage clusters ·<br/>anomalies · risk scores · network edges"]
    end

    SPA -->|HTTPS/JSON| API
    SPA --> WCH
    SPA --> AUTH
    API --> DS
    API -->|"live match:<br/>embed query text"| EMB
    API --> QML
    API --> SB
    CRON --> API
    GEN -->|bulk import| DS
    PIPE -->|bulk-write precomputed tables<br/>+ per-case embedding vectors| DS
```

**Key decisions**

| Decision | Rationale |
|---|---|
| Python analytics runs **offline batch**, not as a service | No second live deployment to babysit; results always ready; demo can't be killed by a slow model |
| **One embedding space** — the same sentence-transformer model embeds both the corpus (offline) and live queries (AppSail container) | Cosine similarity across different embedding models is meaningless; this was caught in design review |
| **TF-IDF fallback** implemented in pure JS inside Express | Live match works even if the embedding container is down; also the v1 floor the embeddings must beat |
| Data Store (relational) over NoSQL | KSP's ER diagram **is** relational — our tables mirror it 1:1, which is a credibility feature, and Catalyst rules discourage third-party alternatives |
| Embeddings loaded into AppSail memory at boot | Cosine over ≤50k × 384-dim vectors is a few ms in-process; no vector DB needed |

---

## 2. Component Responsibilities

### 2.1 React SPA (Web Client Hosting)
- **Login** — Catalyst Authentication; role decides landing scope
- **Command Map** — Leaflet + OpenStreetMap; Karnataka district choropleth → station drilldown; layers: incidents, DBSCAN hotspots, 7-day forecast heatmap, patrol suggestions; alert feed; data-quality panel (% FIRs missing coordinates)
- **Linkage** — serial-crime cluster list & detail (member FIRs, shared-MO summary, confidence); **live match box**: paste FIR text → top-k similar cases + cluster match with similarity scores
- **District Analytics** — tabs: Trends (time series + anomaly markers) · Outcomes (chargesheet A / false B / undetected C rates per unit) · Offender Network (force-directed graph of co-accused links)
- **Briefing** — daily AI brief (EN/KN), rendered + PDF download

### 2.2 Express API (AppSail managed runtime)
- Reused from boilerplate: app structure, error handler, request logging, RBAC middleware pattern
- Auth: validates Catalyst Authentication session; maps user → role + jurisdiction
- Serves: case queries with filters, aggregations, all precomputed analytics tables, live match route
- Live match flow: `POST /api/linkage/match` → embed query via embedding service (same model as corpus; TF-IDF fallback) → in-memory cosine against `CaseEmbeddings` → return top-k cases + best cluster

### 2.3 Embedding service (AppSail OCI container)
- `paraphrase-multilingual-MiniLM-L12-v2` (or equivalent multilingual model — must handle Kannada script)
- Single endpoint: `POST /embed { text } → { vector[384] }`
- Same model binary used offline to embed the corpus — **never mix models**

### 2.4 Offline pipeline (local, Python)
1. **Generator**: ~50k FIRs (2021–2026) on KSP schema; Bengaluru-weighted geography; seasonal patterns; planted: hotspot clusters, repeat offenders, serial-MO patterns (defined as semantic attributes — entry method, tool, target, time window); Gemini writes varied `BriefFacts` narratives (~20% in Kannada script); blind-test patterns injected separately by Backend lead
2. **Analytics**: DBSCAN hotspots · grid-cell gradient-boosting forecast · seasonal-decomposition anomaly detection · TF-IDF/embedding clustering for linkage · networkx co-accused graph · explainable risk scores (top-3 reasons each)
3. **Load**: bulk-write all precomputed tables + per-case vectors to Data Store (tiered import to respect quotas; 10k cases minimum viable)

---

## 3. ER Diagram

### 3.1 Core FIR schema (mirrors KSP's official ER document)

Field names are verbatim from the KSP "Police FIR System — ER Diagram" design document.

```mermaid
erDiagram
    CaseMaster {
        int CaseMasterID PK
        varchar CrimeNo "1 cat + 4 district + 4 station + 4 year + 5 serial"
        varchar CaseNo
        date CrimeRegisteredDate
        datetime IncidentFromDate
        datetime IncidentToDate
        datetime InfoReceivedPSDate
        decimal latitude
        decimal longitude
        text BriefFacts "FIR narrative — linkage input"
        int PolicePersonID FK
        int PoliceStationID FK
        int CaseCategoryID FK
        int GravityOffenceID FK
        int CrimeMajorHeadID FK
        int CrimeMinorHeadID FK
        int CaseStatusID FK
        int CourtID FK
    }

    ComplainantDetails {
        int ComplainantID PK
        int CaseMasterID FK
        varchar ComplainantName
        int AgeYear
        int OccupationID FK "never rendered in UI"
        int ReligionID FK "never rendered in UI"
        int CasteID FK "never rendered in UI"
        int GenderID
    }

    Victim {
        int VictimMasterID PK
        int CaseMasterID FK
        varchar VictimName
        int AgeYear
        int GenderID
        varchar VictimPolice
    }

    Accused {
        int AccusedMasterID PK
        int CaseMasterID FK
        varchar AccusedName
        int AgeYear
        int GenderID
        varchar PersonID "A1, A2, A3..."
        int OffenderRef FK "NETRA addition - dedup registry"
    }

    Offenders {
        int OffenderID PK "NETRA addition"
        varchar CanonicalName
        int FirstSeenYear
        int CaseCount
    }

    ArrestSurrender {
        int ArrestSurrenderID PK
        int CaseMasterID FK
        int AccusedMasterID FK
        int ArrestSurrenderTypeID
        date ArrestSurrenderDate
        int ArrestSurrenderStateId FK
        int ArrestSurrenderDistrictId FK
        int PoliceStationID FK
        int IOID FK
        int CourtID FK
    }

    ActSectionAssociation {
        int CaseMasterID FK
        varchar ActID FK
        varchar SectionID FK
        int ActOrderID
        int SectionOrderID
    }

    ChargesheetDetails {
        int CSID PK
        int CaseMasterID FK
        datetime csdate
        char cstype "A=Chargesheet B=False C=Undetected"
        int PolicePersonID FK
    }

    CaseMaster ||--o{ ComplainantDetails : "has"
    CaseMaster ||--o{ Victim : "has"
    CaseMaster ||--o{ Accused : "has"
    CaseMaster ||--o{ ArrestSurrender : "has"
    CaseMaster ||--o{ ActSectionAssociation : "invokes"
    CaseMaster ||--o| ChargesheetDetails : "concludes with"
    Accused }o--|| Offenders : "resolves to"
    Accused ||--o{ ArrestSurrender : "arrested via"
```

### 3.2 Classification & organisation lookups (KSP schema)

```mermaid
erDiagram
    CaseMaster }o--|| CaseCategory : "FIR/UDR/PAR/ZeroFIR"
    CaseMaster }o--|| GravityOffence : "Heinous/NonHeinous"
    CaseMaster }o--|| CrimeHead : "major head"
    CaseMaster }o--|| CrimeSubHead : "minor head"
    CaseMaster }o--|| CaseStatusMaster : "status"
    CaseMaster }o--|| Court : "tried in"
    CaseMaster }o--|| Unit : "registered at"
    CaseMaster }o--|| Employee : "registered by"

    CrimeSubHead }o--|| CrimeHead : "belongs to"
    Act ||--o{ Section : "contains"
    ActSectionAssociation }o--|| Act : "under"
    ActSectionAssociation }o--|| Section : "invokes"

    Unit }o--|| UnitType : "type"
    Unit }o--|| District : "in"
    Unit }o--o| Unit : "ParentUnit hierarchy"
    District }o--|| State : "in"
    Court }o--|| District : "in"

    Employee }o--|| Unit : "posted at"
    Employee }o--|| Rank : "holds"
    Employee }o--|| Designation : "serves as"
    Employee }o--|| District : "posted in"

    CaseCategory { int CaseCategoryID PK }
    GravityOffence { int GravityOffenceID PK }
    CrimeHead { int CrimeHeadID PK }
    CrimeSubHead { int CrimeSubHeadID PK }
    CaseStatusMaster { int CaseStatusID PK }
    Act { varchar ActCode PK }
    Section { varchar SectionCode PK }
    Unit { int UnitID PK }
    UnitType { int UnitTypeID PK }
    District { int DistrictID PK "31 real Karnataka districts + centroids" }
    State { int StateID PK }
    Court { int CourtID PK }
    Employee { int EmployeeID PK }
    Rank { int RankID PK }
    Designation { int DesignationID PK }
```

### 3.3 NETRA precomputed analytics tables (written by the offline pipeline)

```mermaid
erDiagram
    Hotspots {
        int HotspotID PK
        int DistrictID FK
        int CrimeHeadID FK
        decimal centroidLat
        decimal centroidLng
        decimal radiusMeters
        int caseCount
        varchar timeWindow
        json memberCaseIDs
    }

    Forecasts {
        int ForecastID PK
        varchar gridCellID "geohash cell"
        int DistrictID FK
        int CrimeHeadID FK
        date forecastDate
        decimal riskScore
        json topReasons "top-3 plain-language reasons"
        json patrolSuggestion "suggested window + route anchor"
    }

    LinkedCaseClusters {
        int ClusterID PK
        varchar label "e.g. Serial Cluster 3"
        json memberCaseIDs "cross-district FIRs"
        json districtsSpanned
        text sharedMOSummary
        decimal confidence
        varchar method "tfidf | embedding"
    }

    CaseEmbeddings {
        int CaseMasterID PK
        blob vector "384-dim float, loaded to memory at boot"
        varchar modelVersion "must match live service"
    }

    TrendSeries {
        int SeriesID PK
        int DistrictID FK
        int CrimeHeadID FK
        varchar granularity "week | month"
        json points
    }

    Alerts {
        int AlertID PK
        int DistrictID FK
        int CrimeHeadID FK
        datetime detectedAt
        varchar severity
        text message "e.g. vehicle theft +40 pct in 6 weeks"
        json evidence
    }

    RiskScores {
        int ScoreID PK
        int UnitID FK
        decimal score
        json topReasons "explainability - top-3 reasons"
        date computedFor
    }

    NetworkEdges {
        int EdgeID PK
        int OffenderA FK
        int OffenderB FK
        int sharedCaseCount
        json sharedCaseIDs
    }

    Briefings {
        int BriefingID PK
        int DistrictID FK
        date briefingDate
        varchar language "en | kn"
        text content
        varchar pdfUrl "SmartBrowz output"
    }
```

---

## 4. API Contract (v1)

All routes prefixed `/api/v1`, all behind Catalyst Auth session + RBAC scoping (see §5).
Response envelope: `{ success, data, error? }`.

| Method | Route | Purpose | Notes |
|---|---|---|---|
| GET | `/cases` | Filterable case list | `?district=&station=&crimeHead=&gravity=&from=&to=&page=` |
| GET | `/cases/:id` | Full case detail | joins complainants/victims/accused/sections/chargesheet |
| GET | `/stats/summary` | KPI tiles | scoped to viewer's jurisdiction |
| GET | `/stats/trends` | Time series | from `TrendSeries`; `?district=&crimeHead=&granularity=` |
| GET | `/stats/outcomes` | A/B/C rates | per unit/district |
| GET | `/geo/districts` | Choropleth data | counts + GeoJSON refs |
| GET | `/geo/hotspots` | Hotspot layer | `?window=&crimeHead=` |
| GET | `/geo/forecast` | Forecast heatmap + patrol suggestions | `?date=&district=` |
| GET | `/alerts` | Anomaly alert feed | scoped |
| GET | `/linkage/clusters` | Serial-crime clusters | list + detail |
| POST | `/linkage/match` | **Live match** | body `{ text }`; embeds via embedding service (TF-IDF fallback), cosine in-memory, returns top-k cases + best cluster + scores |
| GET | `/network/graph` | Offender network | `?district=` nodes+edges |
| GET | `/risk/units` | Unit risk scores + reasons | scoped |
| GET | `/briefings/today` | Daily brief | `?lang=en|kn`; from cache table |
| POST | `/briefings/generate` | Regenerate brief (QuickML) | falls back to cache on failure |
| GET | `/data-quality` | Honesty panel | % missing coords, fallback level in effect |

## 5. RBAC (police hierarchy)

| Role | Maps to | Data scope |
|---|---|---|
| `hq` | DGP / SCRB HQ | all Karnataka |
| `district` | SP | own district (all its stations) |
| `station` | SHO | own station only |

Scope enforced server-side in middleware (jurisdiction claim from user record), not by the client.

## 6. Ethics & data constraints (enforced by design)

- `OccupationID`, `ReligionID`, `CasteID` exist in the schema (KSP fidelity) but are **excluded from every model's feature set and never rendered by any UI or API response**
- Models predict **places and patterns, never persons**; forecast features are place/time/crime-type only
- Every AI output carries plain-language `topReasons` (explainability) — no black-box numbers anywhere in the UI
- All outputs framed as decision support (human-in-the-loop), stated on the ethics slide

## 7. Quotas, performance, failure modes

- **Data Store free tier = ~5k insertions/month** → claim KSPH26 credits first; bulk-import in tiers; 10k cases = minimum viable demo, 50k = target
- Embedding memory: 50k × 384 × 4B ≈ 75 MB in AppSail process — fine; quantize to float16 if pressure
- Live match p95 target < 800 ms (embed ~100 ms + cosine ~10 ms + query)
- Failure ladder: embedding container down → TF-IDF fallback (flagged in response) · QuickML down → cached briefing · missing coordinates → station-level aggregation (shown in data-quality panel)

## 8. Repo layout (target)

```
NETRA/
├── app.js / server.js          # Express on AppSail (boilerplate, SaaS modules stripped)
├── routes/ controllers/ middleware/   # API v1 + RBAC scoping
├── catalyst/                   # Catalyst project config
├── embedding-service/          # Dockerfile + FastAPI /embed (AppSail OCI)
├── pipeline/                   # Python: generator/, analytics/, load/  (offline)
├── frontend/                   # React + Vite (5 screens) → Web Client Hosting
└── docs/                       # this file + KSP schema reference
```
