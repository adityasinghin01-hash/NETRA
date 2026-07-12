# NETRA — Designer's Work Package

You own how NETRA **looks**. You don't need to write code — Aditya + Claude handle
that. Your job is to make NETRA look like a real, world-class police-intelligence
product, because the judges score us from a **video of the screens**. A beautiful,
confident UI is one of our biggest edges.

## First: go look at what already exists

NETRA is already built and live. Open it and click around:

**Live app:** `https://netra-60077866273.development.catalystserverless.in/app/`

There are 5 screens (Login, Command Map, Linkage, Analytics, Briefing). They work
and show real data, but they're a **first draft** — plain, with placeholder boxes
where the map and charts will go. Your job is to make them shine and to design the
parts that don't exist yet.

## The idea (so your design tells the right story)

NETRA reads lakhs of police crime reports (FIRs) and shows officers: where crime
clusters (map), which crimes are the **same criminal across different cities**
(our star feature — "Linkage"), what may happen next week (forecast), and a short
daily briefing (English + Kannada). Users are **police officers**, not analysts —
design for someone with 4 minutes before a meeting, who needs answers fast. The
vibe: a serious, calm "command center," not a flashy consumer app.

## The current look (our starting design system)

Feel free to improve any of this — you're the designer. This is what's built today:

- **Theme:** dark "command center" — deep navy background (`#0B1220`), not pure black
- **Cards/panels:** slightly lighter navy (`#111A2E`) with thin borders
- **Text:** off-white (`#E2E8F0`) headings, grey (`#94A3B8`) secondary
- **Accent (highlights, selections):** cyan (`#22D3EE`)
- **Alerts / crime hotspots:** red (`#F87171`); warnings amber; good/solved green
- **Font:** Inter for text, a monospace font for numbers
- **Feel:** lots of breathing room, calm, no gimmicky animation

If you think a different palette or feel is stronger — propose it. Just keep it
dark, serious, and government-credible.

## Your deliverables

### 1. A NETRA logo / wordmark ⭐
Right now it's just an eye emoji 👁️. Design a proper simple mark + the word "NETRA"
(means "eye" in Sanskrit). Clean, works small, works on dark. This goes on the app,
the login, and the pitch deck.

### 2. Design the Command Map screen
The main screen has a big **grey placeholder box** where the Karnataka map will go.
Design what it should look like:
- How should the map of Karnataka's districts look? (colors for high vs low crime)
- How should a "hotspot" look on the map? (a glowing red circle? pins?)
- The legend, the layer buttons (Incidents / Hotspots / Forecast)
- The side panel with alerts

### 3. Design the Linkage screen (our STAR — spend the most love here)
This is the feature that wins us the competition. It shows groups of connected
serial crimes. Design:
- How a "serial crime cluster" card should look (crime type, cities it spans, how confident)
- The "paste a new report → find its group" box and how the **match result** should
  feel exciting when it appears (this is the big demo moment in our video)
- A small map showing the crimes connected across cities with lines

### 4. Design the charts (Analytics screen)
- How should the "which stations solve cases vs not" bars look?
- Crime-trend line charts, the criminal-network web graph — pick styles, colors

### 5. Design the pitch-deck visuals (with the PPT teammate)
The submission deck must look stunning. You + the PPT teammate: they write the
words, **you make it beautiful** (layout, colors, the architecture diagram, the
screenshots framed nicely). This is huge for scoring.

## How you hand work to us (this is the workflow)

You don't touch code. Instead:
1. Design in **Figma** (free, best) — or **Canva**, or even neatly on paper/tablet
2. Export a picture or share the Figma link
3. Give it to Aditya / drop it in the team chat
4. Aditya + Claude turn your design into the real working screen
5. You review the live result and suggest tweaks — repeat until it's beautiful

Think of yourself as the architect drawing the rooms; we're the builders. Your
drawing is what we build.

## Design references to study (aim for this level)

- Award-winning dashboard UIs on **Dribbble** — search "dark dashboard", "analytics command center", "crime map dashboard"
- **Awwwards** for polish inspiration
- Real intelligence/ops dashboards (Palantir-style command centers) for the serious vibe
- Keep it **accessible**: text must be easy to read on dark, don't rely on color alone

## Timeline (rough)

| By | Deliverable |
|---|---|
| Jul 14 | NETRA logo + your take on the overall look (approve or improve the palette) |
| Jul 17 | Command Map + Linkage screen designs (the two demo stars) |
| Jul 19 | Chart styles + Analytics/Briefing polish |
| Jul 22 | Pitch-deck visual design (with PPT teammate) |
| Jul 24 | Final polish review on the live app before the demo video |

**One sentence:** open the live app, imagine how a world-class version looks, design
that in Figma/Canva, hand us the pictures, we build it. Make NETRA beautiful. 🎨
