# NETRA — Designer's Work Package

Everything you need, in plain language. You make NETRA **look** world-class. You do
**not** write code — Aditya + Claude do that. Read this once fully, then start.

---

## PART 1 — THE IDEA (what we're building, in simple words)

### The problem
Every time a crime happens in Karnataka, police write a report called an **FIR**
(First Information Report). There are **1,100+ police stations**, so there are
**lakhs** of these reports sitting in a computer. But:
- Police **can't see the big picture** — where crime is rising, what the patterns are.
- A criminal who robs shops in 3 different cities looks like **3 separate small cases**
  to 3 different police stations. Nobody connects them.
- Police only look at **last month's numbers** — never what's coming next.

### What NETRA does
NETRA is a smart AI assistant that **reads ALL the reports** and gives police
**5 superpowers**:

1. **SEE 🗺️ (Map)** — a live map of Karnataka showing where crimes cluster
   ("hotspots"). You can zoom in: whole state → one district → one police station.

2. **TRACK 📈 (Trends & Alerts)** — graphs of crime over time, and **automatic
   alerts** when something suddenly spikes (e.g. "vehicle theft up 40% in Whitefield").

3. **CONNECT 🕵️ (Linkage) — ⭐ THIS IS OUR STAR FEATURE** — the AI reads the
   *story* written in each report and figures out which crimes are the **same
   criminal across different cities** (by their "method"). It works in **English AND
   Kannada**. The magic moment: an officer pastes a fresh new report and NETRA
   instantly says *"87% match — this belongs to Serial Cluster #3."*

4. **JUDGE 📊 (Outcomes)** — for each police station, how many cases got **solved**
   (chargesheeted), were **false**, or stayed **unsolved** (undetected). Honest
   accountability that bosses want.

5. **ACT 📄 (Forecast + Briefing)** — predicts **next week's** likely hotspots and
   suggests where to send patrols; and writes a **1-page daily briefing** for each
   district (English or Kannada, downloadable as a PDF).

### Extra important bits
- **Different logins for different ranks:** HQ boss sees all Karnataka, a District
  officer sees only their district, a Station officer sees only their station.
- **Built ethically:** NETRA never uses caste or religion, always explains *why* it
  says something, and only *helps* officers decide (a human always makes the final call).

### Why we can win
Built on the police's **real data structure**, the cross-city linkage is something
**almost no other team will have**, every claim is backed by a number, and it all
runs on **Zoho Catalyst** (the platform the competition requires).

---

## PART 2 — THE TEAM (who is doing what)

We are 3 people. Here's the whole picture so you know where you fit:

| Person | Role | What they do |
|---|---|---|
| **Aditya (+ Claude AI)** | Tech lead | Builds the **brain** (the database, the AI that connects crimes and forecasts) and writes **all the code**, including turning YOUR designs into real working screens. |
| **YOU** | **Designer** | Make NETRA **beautiful**. Design the look, the logo, the screens, and the pitch-deck visuals. Hand your designs to Aditya to build. |
| **3rd teammate** | Presentation | Writes the **pitch deck** (slides), the demo **video**, and submits everything to the competition. |

You and the presentation teammate will **work together** on the pitch deck: they
write the words, you make it gorgeous.

---

## PART 3 — YOUR JOB (in detail — what to do and how)

**First step, today:** open the live app and click every screen —
`https://netra-60077866273.development.catalystserverless.in/app/`
It already works and shows real data, but it's a **plain first draft** with empty
boxes where the map and charts go. Your job is to make it shine and design the
missing parts.

### The current look (you may improve any of it)
- **Dark "command center"** theme: deep navy background (`#0B1220`, not pure black)
- Cards: slightly lighter navy (`#111A2E`) with thin borders
- Text: off-white headings, grey secondary text
- Highlight color: **cyan** (`#22D3EE`); alerts/hotspots **red**; good/solved **green**
- Font: Inter for text, a monospace font for numbers
- Feeling: calm, serious, lots of space, no flashy animation — think "government
  control room," not a flashy app. If you have a stronger idea, propose it — just keep
  it dark, serious, and trustworthy.

### Your deliverables (in order of importance)

**1. NETRA logo / wordmark ⭐**
Right now it's just an eye emoji 👁️. Design a proper simple mark + the word "NETRA"
("NETRA" means *eye* in Sanskrit). Must look good small, and on a dark background.
Used on the app, the login screen, and the pitch deck. → *How:* Figma or Canva, export
as PNG (transparent background) + SVG if you can.

**2. Command Map screen design**
The main screen has a big **grey placeholder box** where the Karnataka map goes.
Design what it should look like:
- The Karnataka district map — what colours show high vs low crime?
- What does a "hotspot" look like — a glowing red circle? pins?
- The buttons to switch map layers (Incidents / Hotspots / Forecast)
- The map legend, and the side panel that lists alerts

**3. Linkage screen design — spend the MOST time here (it's our star) ⭐⭐**
This is the feature that wins the competition, and it's the highlight of our video.
Design:
- How a "serial crime cluster" card looks (crime type, which cities it spans, a
  confidence % badge)
- The "paste a new report → find its group" box, and how the **match result** should
  appear so it feels **exciting and impressive** (this is our big demo moment)
- A small map showing crimes in different cities connected by lines

**4. Chart styles (Analytics screen)**
- The "which stations solve cases vs not" bars (solved/false/unsolved)
- Crime-trend line graphs
- The criminal-network "web" graph (dots = criminals, lines = they worked together)
Pick the colours and style for each.

**5. Briefing screen polish**
Make the daily-briefing page look like a clean, official one-page document, with a
nice English ⇄ ಕನ್ನಡ (Kannada) toggle.

**6. Pitch-deck visuals (with the presentation teammate)**
The slides must look **stunning** — this is a big part of the score. They write the
words; you design the layout, colours, framed screenshots, and the architecture
diagram. Aim for a clean, premium, tech look.

### How you hand your work to us (the workflow)
You never touch code. Instead:
1. Design it in **Figma** (free, best for this) — or **Canva**, or even neatly on
   paper/tablet if that's faster for you.
2. Export a **picture** (PNG) or share the **Figma link**.
3. Send it to Aditya / drop it in the team chat.
4. Aditya + Claude turn your design into the real working screen.
5. You look at the live result and suggest tweaks. Repeat until it's beautiful.

Think: **you draw the rooms, we build them.**

---

## PART 4 — WHAT YOU NEED FROM YOUR TEAMMATES (and what they need from you)

### You GET from Aditya (ask him for these):
- The **live app link** (above) and **screenshots** of the current screens to redesign over
- The **list of what each screen must show** (it's in this doc + he can explain)
- Once you design something → he **builds it** and sends back the live version to review

### You GET from the presentation teammate:
- The **deck outline / content** (what words go on each slide) so you can design around it
- The **official submission template** the competition requires (so the deck fits their format)

### You GIVE to the presentation teammate:
- The **NETRA logo**
- **Beautifully designed slides** (they fill in final words)
- **Nicely framed screenshots** of the app for the deck and video

### You GIVE to Aditya:
- Your **screen designs / mockups** → he builds them into the real app

---

## PART 5 — HELPFUL EXTRAS

- **Best free tools:** Figma (design), Canva (quick slides), Coolors.co (colour ideas),
  unDraw / Lucide icons (free icons — keep them all one style).
- **Study these for inspiration** (aim for this level): Dribbble — search *"dark
  dashboard," "analytics command center," "crime map dashboard"*; Awwwards for polish;
  Palantir-style ops dashboards for the serious "intelligence" vibe.
- **Rules that keep it professional:**
  - Text must be **easy to read** on the dark background (don't use dim grey for
    important words).
  - **Never use colour alone** to mean something — add a label or icon too (some
    people are colour-blind; judges notice this).
  - Keep **one icon style** throughout (don't mix filled and outline).
  - Lots of **empty space** looks more premium than cramming things in.
- **Remember the user is a police officer** with little time — clarity beats
  decoration. Beautiful *and* instantly understandable.
- **Deadline that matters:** the demo **video** is filmed around **Jul 23–24**, so the
  screens need to look their best by **Jul 22**. Final submission is **Jul 26**.

**One sentence:** open the live app, imagine the world-class version, design it in
Figma/Canva, hand us the pictures, we build it — make NETRA beautiful. 🎨
