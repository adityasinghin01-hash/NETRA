# NETRA — Frontend Owner: Complete Work Package

You own everything the judges **see**. Every AI feature Aditya builds is invisible until your screens make it real. This doc is self-contained: the idea, stack, design system, all 5 screens specced with every button, the API shapes you code against, mock-data strategy, and deadlines.

## THE IDEA — what you're building and why each screen exists

**NETRA in one line:** an AI crime-intelligence engine that turns Karnataka Police's FIR records into decisions — where crime clusters, which crimes are connected, what happens next week, and what to do about it.

**The problem:** Karnataka has 1,100+ police stations filing FIRs (First Information Reports — the document that opens every case) into siloed records. A serial burglar hitting 3 districts is worked as 3 unrelated cases by 3 officers who never talk. Crime spikes get noticed weeks late in manual monthly reports. Police leadership sees last month's totals, never next week's risk.

**NETRA's 5 pillars → your 5 screens:**
1. **See** (→ Command Map): live Karnataka map, drilldowns, algorithmic hotspots, honest data-quality indicator
2. **Track** (→ Command Map alerts + Analytics/Trends): time trends with automatic anomaly alerts
3. **Connect ⭐ THE HEADLINE** (→ Linkage): AI reads every FIR's free-text narrative (English AND Kannada) and links serial crimes across district borders by modus operandi. The demo money-shot lives on your Linkage screen: paste a new FIR → "87% match with Serial Cluster #3" in under a second
4. **Judge** (→ Analytics/Outcomes): per-station case outcomes — chargesheeted (A) / false (B) / undetected (C)
5. **Act** (→ Command Map forecast layer + Briefing): 7-day hotspot forecast with patrol windows, and an AI-written daily brief per district (EN/Kannada, PDF)

**Users are police, not analysts.** Three roles see scoped views: `hq` (DGP-level, all Karnataka), `district` (SP, one district), `station` (SHO, one station). Design instinct: an SP with 4 minutes before a review meeting, not a data scientist exploring.

**Why the polish bar is high:** submission is judged from a 3-minute screen-recorded video of YOUR build. The AI can be brilliant, but judges only see your pixels. Two screens carry the demo: Command Map (establishing wow) and Linkage (the climax).

**Ethics rule that binds the UI:** caste/religion/occupation fields exist in the database but must NEVER be rendered anywhere. Victim/complainant age and gender in aggregate only. Every AI number must be explainable — that's the ⓘ → top-3 reasons pattern.

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

**Complete control inventory:**
| Control | Type | Behavior |
|---|---|---|
| Email | text input | validation on blur (format only) |
| Password | password input | eye icon toggles visibility |
| **Sign in** | primary button (cyan, full-width) | disabled until both fields non-empty; spinner while authenticating; shake + inline error "Invalid credentials" on failure |
| Demo role hints | 3 small chips: "HQ · District · Station" | (demo-only) click fills credentials for that role — makes the video and judge-testing effortless |

### 4.2 Command Map ⭐ (default screen, most demo airtime)
Layout: full-bleed Leaflet map; right rail 320px, collapsible.
- Choropleth of districts colored by case count (from `GET /geo/districts`); click district → zoom + drill to station markers
- Layer toggles (top-left pills): Incidents · Hotspots (`GET /geo/hotspots` — translucent red circles sized by radius/caseCount) · **Forecast** (`GET /geo/forecast` — heat-ramp grid cells) · Patrol suggestions (pin + card: "Patrol window 22:00–02:00")
- Right rail: KPI tiles (`GET /stats/summary`: total FIRs, active hotspots, open alerts, detection rate) above live alert feed (`GET /alerts` — severity dot, message, "2h ago", click → map flies to location)
- Bottom-left: **data-quality chip**: "94.2% geocoded · station-level fallback ON" (`GET /data-quality`) — this honesty chip is deliberate, judges see it
- Filters in top bar apply globally: crime head, gravity, date range

**Complete control inventory:**
| Control | Type | Behavior |
|---|---|---|
| Layer toggles: Incidents / Hotspots / Forecast / Patrol | 4 pill toggles (top-left, multi-on) | toggle map layers; active = cyan fill; Forecast ON auto-shows a legend (heat ramp + "next 7 days") |
| Date range | dropdown in top bar (7d / 30d / 90d / 12m / custom) | custom opens dual date picker; refetches all data on change |
| Crime head filter | multi-select dropdown w/ search | filters map + KPIs + alerts; selected shown as removable chips |
| Gravity filter | segmented control: All / Heinous / Non-heinous | same refetch |
| District (choropleth region) | clickable map region | hover = tooltip (name, case count); click = zoom + drill to stations; `hq` only (others locked to their scope) |
| Station marker | clickable map marker | click = popover: station name, case count, top crime head, **"View analytics →"** link (routes to Analytics scoped to it) |
| Hotspot circle | clickable map overlay | click = card: window, case count, dominant crime, **"Show cases"** (list drawer), ⓘ reasons |
| Patrol pin | clickable map pin | click = patrol card: suggested window, anchor location, based-on ⓘ |
| ⟵ Back to state view | ghost button (appears after drilldown) | resets zoom + selection |
| KPI tiles (×4) | clickable cards | click routes to relevant screen (e.g. "Open alerts" → alert feed focused) |
| Alert row | clickable list item | click = map flies to alert location + highlights; **"Details"** expands evidence inline |
| Alert bell (top bar) | icon button + count badge | opens right-rail alert feed if collapsed |
| Data-quality chip | clickable chip (bottom-left) | click = popover explaining % geocoded, fallback mode, method |
| Rail collapse | icon button (chevron) | collapses/expands 320px right rail |
| Map zoom | Leaflet default +/− | keep; position bottom-right |
| Sidebar nav (×4) + user badge | icon buttons | route to screens; user badge opens menu: role shown, **Logout** |

### 4.3 Linkage ⭐⭐ (the money screen — polish this hardest)
Two-column: left = cluster list, right = detail.
- Cluster list (`GET /linkage/clusters`): cards — "Serial Cluster #3" · districts spanned as chips · member count · confidence bar · one-line MO summary
- Detail: mini-map with member FIRs connected by arcs across district borders (this visual IS slide 4 of the deck) · timeline strip of incidents · MO summary panel · member FIR table (CrimeNo, date, district, snippet)
- **Live Match panel** (top, always visible): big textarea "Paste FIR narrative…", Analyze button → result: match % with animated count-up, best cluster link, top-5 similar cases with similarity bars (`POST /linkage/match`). Show `method: "embedding" | "tfidf"` as a small badge. This is the demo's money shot — make the reveal feel great (300ms stagger on the results list)

**Complete control inventory:**
| Control | Type | Behavior |
|---|---|---|
| FIR narrative | large textarea (Live Match panel) | placeholder: "Paste a new FIR narrative (English or ಕನ್ನಡ)…"; char count; **Clear** ✕ icon |
| **Analyze** | primary button (cyan) | disabled <30 chars; "Analyzing…" spinner state; on result: % count-up animation, cluster link, top-5 list staggers in |
| Try an example | ghost button beside Analyze | fills textarea with a prepared example FIR (one EN, one KN — cycles). Makes judge-testing one click |
| Match result → cluster link | inline link in result | selects that cluster in the list + opens detail |
| Similar-case row (×5) | clickable row w/ similarity bar | click = case peek drawer (CrimeNo, date, district, narrative snippet, "why similar" ⓘ) |
| method badge | static badge: "semantic model" / "keyword fallback" | tooltip explains which engine answered |
| Cluster search | text input above cluster list | filters by label/district |
| Sort clusters | dropdown: Confidence / Size / Districts spanned / Newest | re-sorts list |
| Cluster card | clickable card | selects → loads detail pane (map + timeline + FIR table) |
| District chips (on cards & detail) | non-clickable chips | visual only — shows span, e.g. "Tumakuru · Chitradurga · Davanagere" |
| Confidence ⓘ | icon button on detail | popover: how confidence is computed, method, blind-test note |
| Timeline incident dot | clickable dot on timeline strip | highlights that FIR in table + on mini-map |
| Member FIR row | clickable table row | expands narrative inline; **"Open on map"** link |
| Mini-map arcs | hoverable | hover arc = highlights the two connected FIRs |
| Export cluster | ghost button (detail header) | downloads cluster summary as PDF (SmartBrowz URL) — stub until API lands, hide if not ready |

### 4.4 District Analytics (3 tabs)
- **Trends**: Recharts line/area of `GET /stats/trends`, anomaly points marked with amber dots + tooltip explaining the anomaly; crime-head multi-select
- **Outcomes**: stacked bars per station — A (chargesheeted, green) / B (false, slate) / C (undetected, red) from `GET /stats/outcomes`; sort by undetected-rate; "% undetected" headline number
- **Offender Network**: react-force-graph-2d of `GET /network/graph` — node size = case count, edge label = shared cases; click node → side panel with offender case history; search box to find an offender by name

**Complete control inventory:**
| Control | Type | Behavior |
|---|---|---|
| Tab bar: Trends / Outcomes / Network | 3 tabs | switch views; active = cyan underline; state preserved per tab |
| District selector | dropdown (top of screen) | `hq` picks any district; `district`/`station` locked (shown as static label) |
| *Trends tab* | | |
| Crime head multi-select | dropdown w/ chips | overlays one line per selected head (max 4, distinct colors + legend) |
| Granularity | segmented: Week / Month | refetch series |
| Anomaly dot | clickable amber dot on chart | tooltip: what spiked, by how much, vs baseline; **"View on map"** link |
| Chart hover | crosshair + tooltip | values at date across all series |
| Download chart | icon button | exports PNG of chart (html2canvas) — nice-to-have, cut if tight |
| *Outcomes tab* | | |
| Sort by | dropdown: Undetected % / False % / Chargesheet % / Volume | re-orders station bars |
| Stacked-bar segment | clickable | drill: cases behind that segment in a drawer table |
| Year selector | dropdown 2021–2026 | refetch |
| A/B/C legend | clickable legend chips | toggle segment visibility |
| *Network tab* | | |
| Offender search | text input w/ autocomplete | selects + centers graph on match |
| Min shared cases | slider (1–5) | filters edges; live count "showing N links" |
| Node (offender) | click / drag | click = side panel: alias'd name, case count, districts, case list (each row → case peek); drag = physics |
| Edge | hover | tooltip: N shared cases; click = list them |
| Reset view | ghost button | re-centers, clears selection |
| Side panel case row | clickable | case peek drawer (same component as Linkage screen — build once, reuse) |

### 4.5 Briefing
Document-style page (the one light-ish surface allowed — like paper): today's brief from `GET /briefings/today`, EN ⇄ ಕನ್ನಡ toggle, date picker for past briefs, "Download PDF" button (SmartBrowz URL from response), "Regenerate" button (`POST /briefings/generate`) with loading state + graceful "serving cached brief" notice on failure.

**Complete control inventory:**
| Control | Type | Behavior |
|---|---|---|
| Language toggle | segmented: EN / ಕನ್ನಡ | swaps brief content; persists choice in localStorage |
| Date picker | calendar dropdown (default today) | loads that day's brief; dates without briefs disabled |
| District selector | dropdown (`hq` only; others locked) | loads that district's brief |
| **Download PDF** | primary button | opens SmartBrowz PDF URL in new tab; disabled + tooltip if not yet generated |
| Regenerate | ghost button w/ sparkle icon | POST generate; skeleton over document while loading; on failure: amber toast "AI busy — serving cached brief" (never an error page) |
| "AI-generated" ⓘ | inline info icon in doc header | popover: generated from which data window, human-review disclaimer |
| Section anchors | right-side mini table of contents | Incidents / Hotspots / Alerts / Recommendations — scrolls to section |
| Print | icon button | `window.print()` with print stylesheet (cheap win, judges love it) |

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
