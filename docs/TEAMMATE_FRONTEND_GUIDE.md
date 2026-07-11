# NETRA — Frontend Owner: Complete Work Package

You own everything the judges **see**. Every AI feature Aditya builds is invisible until your screens make it real. This doc is self-contained: stack, design system, all 5 screens specced, the API shapes you code against, mock-data strategy, and deadlines.

Read `docs/SYSTEM_DESIGN.md` §4 (API contract) alongside this — those response shapes are law. If a shape doesn't work for your UI, say so in the team chat *before* building around something else.

## 0. Ground rules

- Work in `frontend/` on branch `feat/frontend`, PR to `main` in small pieces with screenshots in the PR description
- Build against **mock data first** (§5) — never blocked waiting on APIs
- Exactly **5 screens**. No sixth screen, no matter how cool the idea. Depth beats breadth
- Every screen handles 3 states: loading (skeleton), empty ("no data for this filter"), error (readable message + retry)

## 1. Stack & setup

```bash
cd frontend
npm create vite@latest . -- --template react
npm i react-router-dom leaflet react-leaflet recharts react-force-graph-2d axios
npm i -D tailwindcss @tailwindcss/vite
# component primitives: shadcn/ui (or keep it hand-rolled Tailwind if you prefer — your call)
```

- **React + Vite** (JS or TS — your choice, TS preferred)
- **Leaflet + react-leaflet** — maps, free OpenStreetMap tiles (dark tiles: CartoDB `dark_matter`, free, no key)
- **Recharts** — every chart
- **react-force-graph-2d** — offender network
- Karnataka district boundaries GeoJSON: use the public DataMeet Karnataka districts file (openly licensed); commit it to `frontend/src/assets/karnataka_districts.geojson`

## 2. Design system — "command center"

Judges should think *police intelligence console*, not student dashboard.

| Token | Value |
|---|---|
| Background | `#0B1220` (near-black navy) |
| Surface / cards | `#111A2E`, border `#1E293B`, radius 12px |
| Text | `#E2E8F0` primary · `#94A3B8` secondary |
| Accent (interactive, selections) | `#22D3EE` cyan |
| Alert / hotspot | `#F87171` red · Warning `#FBBF24` amber · OK `#34D399` green |
| Heat ramp (map layers) | transparent → `#FBBF24` → `#F97316` → `#EF4444` |
| Font | Inter (UI) · JetBrains Mono for numbers/IDs |

Rules: dark theme ONLY (no toggle — saves time, looks intentional). Generous spacing. No more than 2 font sizes per card. Numbers get mono font and tabular alignment. Subtle transitions only (150–200ms) — zero gimmick animations. Every AI-generated number renders with an ⓘ affordance that reveals its `topReasons` (explainability is a product feature — make it visible).

## 3. App shell

- Left sidebar (72px, icons + tooltips): Command Map · Linkage · Analytics · Briefing + user/role badge at bottom
- Top bar: jurisdiction context ("Karnataka" / "Mysuru District" / station name per role), global date-range picker, alert bell with count
- Auth: login page → Catalyst Authentication (Aditya wires the actual auth; you build the form + session handling against a mock login endpoint until then)
- Role awareness: `hq` sees state level, `district` lands zoomed to their district, `station` to their station. The API already scopes data — your job is initial map position + labels

## 4. The 5 screens

### 4.1 Login
Centered card on dark background, NETRA wordmark + eye mark, tagline "Crime intelligence for Karnataka Police", email/password, error state. Small footer: "KSP Datathon 2026 prototype — synthetic data only." Keep it 1 evening max.

### 4.2 Command Map ⭐ (default screen, most demo airtime)
Layout: full-bleed Leaflet map; right rail 320px, collapsible.
- Choropleth of districts colored by case count (from `GET /geo/districts`); click district → zoom + drill to station markers
- Layer toggles (top-left pills): Incidents · Hotspots (`GET /geo/hotspots` — translucent red circles sized by radius/caseCount) · **Forecast** (`GET /geo/forecast` — heat-ramp grid cells) · Patrol suggestions (pin + card: "Patrol window 22:00–02:00")
- Right rail: KPI tiles (`GET /stats/summary`: total FIRs, active hotspots, open alerts, detection rate) above live alert feed (`GET /alerts` — severity dot, message, "2h ago", click → map flies to location)
- Bottom-left: **data-quality chip**: "94.2% geocoded · station-level fallback ON" (`GET /data-quality`) — this honesty chip is deliberate, judges see it
- Filters in top bar apply globally: crime head, gravity, date range

### 4.3 Linkage ⭐⭐ (the money screen — polish this hardest)
Two-column: left = cluster list, right = detail.
- Cluster list (`GET /linkage/clusters`): cards — "Serial Cluster #3" · districts spanned as chips · member count · confidence bar · one-line MO summary
- Detail: mini-map with member FIRs connected by arcs across district borders (this visual IS slide 4 of the deck) · timeline strip of incidents · MO summary panel · member FIR table (CrimeNo, date, district, snippet)
- **Live Match panel** (top, always visible): big textarea "Paste FIR narrative…", Analyze button → result: match % with animated count-up, best cluster link, top-5 similar cases with similarity bars (`POST /linkage/match`). Show `method: "embedding" | "tfidf"` as a small badge. This is the demo's money shot — make the reveal feel great (300ms stagger on the results list)

### 4.4 District Analytics (3 tabs)
- **Trends**: Recharts line/area of `GET /stats/trends`, anomaly points marked with amber dots + tooltip explaining the anomaly; crime-head multi-select
- **Outcomes**: stacked bars per station — A (chargesheeted, green) / B (false, slate) / C (undetected, red) from `GET /stats/outcomes`; sort by undetected-rate; "% undetected" headline number
- **Offender Network**: react-force-graph-2d of `GET /network/graph` — node size = case count, edge label = shared cases; click node → side panel with offender case history; search box to find an offender by name

### 4.5 Briefing
Document-style page (the one light-ish surface allowed — like paper): today's brief from `GET /briefings/today`, EN ⇄ ಕನ್ನಡ toggle, date picker for past briefs, "Download PDF" button (SmartBrowz URL from response), "Regenerate" button (`POST /briefings/generate`) with loading state + graceful "serving cached brief" notice on failure.

## 5. Mock data (start here, day 1)

Create `frontend/src/mocks/` with one JSON file per endpoint, shapes copied EXACTLY from SYSTEM_DESIGN §4. Wrap fetching:

```js
// src/api/client.js
const MOCK = import.meta.env.VITE_USE_MOCKS === "true";
export async function api(path, opts) {
  if (MOCK) return mockFor(path, opts);        // loads from src/mocks/*
  return axios(`${BASE_URL}/api/v1${path}`, opts).then(r => r.data);
}
```

Flip `VITE_USE_MOCKS=false` the day real endpoints land — zero refactor. Make mocks *realistic*: 31 real district names, plausible Karnataka coordinates, Kannada text in one briefing mock, a serial cluster spanning Tumakuru/Chitradurga/Davanagere. Aditya will hand you a `mock-seed.json` by **Jul 14** generated from the real generator so your mocks match production data exactly.

## 6. Milestones

| Date | Deliverable |
|---|---|
| **Jul 13** | Repo set up, shell + sidebar + login rendering, mock client working |
| **Jul 15** | Command Map: choropleth + drilldown + KPI rail on mocks |
| **Jul 17** | Linkage screen complete on mocks (incl. live-match panel) |
| **Jul 19** | Analytics tabs + Briefing on mocks → **switch to real APIs as they land** |
| **Jul 21** | All 5 screens on real APIs; screenshot pack to PPT teammate |
| **Jul 22–23** | Polish pass (spacing, empty states, demo flow rehearsal with Aditya) |
| **Jul 24** | Production build deployed to Catalyst Web Client Hosting — freeze except bug fixes |

## 7. Definition of done (per screen)

- Handles loading / empty / error
- Works at 1366×768 and 1920×1080 (judges' laptops + demo video res)
- No console errors; no dead buttons (hide what isn't built)
- Screenshot posted in team chat and PPT teammate has the final version
- The demo path through the screen is smooth: no flicker, no layout jump — the video is recorded from YOUR build
