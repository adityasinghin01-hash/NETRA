# NETRA — Presentation & Submission Work Package

Everything you need, in plain language. You own what the judges **read and watch** —
the slides, the demo video, and the final submission. In this competition the judging
happens from your materials (no live demo on Jul 26), so **your work is ~half of what
wins us this.** Read this once fully, then work top to bottom.

---

## PART 1 — THE IDEA (what we're building, in simple words)

### The problem
Every time a crime happens in Karnataka, police write a report called an **FIR**
(First Information Report). There are **1,100+ police stations**, so there are
**lakhs** of these reports in a computer. But:
- Police **can't see the big picture** — where crime is rising, what the patterns are.
- A criminal who robs shops in 3 different cities looks like **3 separate small cases**
  to 3 stations. Nobody connects them.
- Police only see **last month's numbers**, never what's coming next.

### What NETRA does — 5 superpowers
NETRA is a smart AI assistant that **reads ALL the reports** and gives police:

1. **SEE 🗺️ (Map)** — a live Karnataka map showing where crime clusters ("hotspots");
   zoom from whole state → district → police station.
2. **TRACK 📈 (Trends & Alerts)** — crime graphs over time + **automatic alerts** when
   something spikes (e.g. "vehicle theft up 40% in Whitefield").
3. **CONNECT 🕵️ (Linkage) — ⭐ OUR STAR** — AI reads the *story* in each report and
   links the **same criminal across different cities** by their method. Works in
   **English AND Kannada**. Magic moment: paste a fresh report → *"87% match with Serial
   Cluster #3."*
4. **JUDGE 📊 (Outcomes)** — per station, how many cases got **solved**, were **false**,
   or stayed **unsolved** — honest accountability.
5. **ACT 📄 (Forecast + Briefing)** — predicts **next week's** hotspots + suggests
   patrols; writes a **1-page daily briefing** per district (English/Kannada, PDF).

### Extra important bits
- **Different logins per rank:** HQ boss = all Karnataka; District officer = their
  district; Station officer = their station.
- **Ethical by design:** never uses caste/religion, always explains *why*, and only
  *helps* officers (a human always makes the final decision).
- **Runs 100% on Zoho Catalyst** — the platform the competition requires.

### Why we can win (these are our selling points — put them in the deck!)
- Built on the police's **real FIR data structure** → "this could plug into real data."
- **Cross-city crime linkage** — almost no other team will have this.
- Every AI claim is **backed by a real number** (see the blind test + benchmark below).
- **Ethics** answered before judges even ask.
- 3 students, ₹0 cost, built in ~2 weeks.

**What NETRA is NOT** (never claim these — judges will pounce):
- Not a chatbot (that's the *other* problem statement).
- Not "predicting who will commit crime" — it predicts *places and patterns*, never people.
- Not using real crime data — all demo data is **synthetic** (realistic but fake).
  Always be honest about this.

---

## PART 2 — THE TEAM (who is doing what)

We are 3 people:

| Person | Role | What they do |
|---|---|---|
| **Aditya (+ Claude AI)** | Tech lead | Builds the **brain** (database + the AI) and writes **all the code**, including the working app screens. |
| **2nd teammate** | Designer | Makes NETRA **beautiful** — the look, the logo, the screen designs, and the deck visuals. |
| **YOU** | **Presentation & submission** | Write the **slides**, the **demo video**, and **submit** everything. Plus one secret job (below). |

You'll **work closely with the Designer** on the pitch deck: you write the words, they
make it gorgeous.

---

## PART 3 — YOUR JOB (in detail — what to do and how)

You have **5 deliverables**. Here they are with deadlines:

| # | Deliverable | Draft by | Final by |
|---|---|---|---|
| 1 | Pitch deck (official template, PDF ≤5MB) | Jul 17 skeleton | Jul 25 |
| 2 | Prototype brief (≤1024 characters) | Jul 22 | Jul 25 |
| 3 | Demo video (~3 min) | Jul 23 rough cut | Jul 25 |
| 4 | 🕵️ Secret blind-test patterns | **Jul 15** | — |
| 5 | Final submission on the portal | — | **Jul 26, by 6 PM** |

**Day-1 task:** download the **official submission template** from the Hack2Skill
portal (Submission section → "download template") and build the deck inside it —
using any other format may get us rejected.

### 3a. The Pitch Deck — slide by slide

Follow the official template's required sections first, then fold in this content. One
clear message per slide. Every claim needs a number. **Real screenshots only** (get
them from Aditya/Designer — no stock photos pretending to be our app).

- **S1 Title** — NETRA logo (from Designer) + tagline *"From lakhs of FIRs to
  Monday-morning decisions."* + team name + "Challenge 2".
- **S2 Problem** — the 3 problems from Part 1, one line each, with 1–2 NCRB crime
  statistics (Aditya gives these).
- **S3 Solution** — one diagram with the 5 superpowers around the NETRA eye. No paragraphs.
- **S4 ⭐ Case Linkage (our star)** — screenshot of the Linkage screen showing a serial
  cluster across 3 cities + the live-match result. Caption: *"9 burglaries. 3 districts.
  3 officers who never spoke. One criminal — found in under a second."* Bottom banner
  (Aditya gives the number): *"Blind test: found 4 of 5 hidden serial patterns."*
- **S5 Forecast & patrol** — forecast-map screenshot. Banner: *"Validated on real public
  crime data (Chicago) — top-10% hotspot accuracy."* (Aditya gives the number.)
- **S6 The dashboard** — 2×2 screenshots: map, alerts, criminal-network graph, outcomes.
- **S7 AI Briefing** — screenshot of the briefing in English + Kannada + the PDF.
- **S8 Built on KSP's real schema** — left: a crop of the police's official data diagram;
  right: our matching table names. Caption: *"Field-for-field faithful — plugs into real
  data."*
- **S9 Architecture on Catalyst** — the diagram (Aditya/Designer give it) + a table
  mapping our features to Catalyst services (shows we used the sponsor's platform properly).
- **S10 Responsible AI** — 4 big ticks: no caste/religion used, predicts places not
  people, every answer explained, human always decides.
- **S11 Honest engineering** — the "data quality" panel screenshot + one line on the
  blind-test method (showing our limits builds trust).
- **S12 Impact & roadmap** — 3 impact points with numbers + a simple roadmap
  (prototype → pilot with real data → statewide) + "runs cheaply on Catalyst".

**Design:** the **Designer** makes it beautiful — you give them the content and
screenshots, they lay it out. Keep words short (max ~25 per slide). Export as PDF,
check it's **under 5 MB** (compress images at tinypng.com).

### 3b. The Prototype Brief (≤1024 characters)
Type this into the submission form. Count characters before submitting. Starter draft
(~980 chars, tweak freely):

> NETRA (Networked Evidence, Tracking & Risk Analytics) addresses Challenge 2:
> turning fragmented FIR records into actionable intelligence for Karnataka State
> Police. Built field-for-field on the official SCRB FIR schema, NETRA delivers:
> (1) AI case linkage that reads FIR narratives (English & Kannada) and connects
> serial crimes across district borders, validated by blind testing; (2) 7-day hotspot
> forecasting with patrol recommendations, benchmarked on real open crime data;
> (3) an interactive Karnataka map with drilldowns, hotspots and anomaly alerts;
> (4) offender-network and repeat-offender analysis; (5) case-outcome analytics
> (chargesheet/false/undetected); (6) AI daily briefings in English and Kannada.
> Role-based access mirrors the police hierarchy (HQ/District/Station). Stack: React,
> Node/Express and Python ML, deployed fully on Zoho Catalyst. Ethics by design:
> no demographic features, explainable outputs, human-in-the-loop.

### 3c. The Demo Video (~3 minutes)
Aditya records the raw screen video + voiceover; **you edit, add titles, and pace it.**
The order (beat sheet):
- 0:00–0:20 — The problem (siloed FIRs, invisible serial crime) — a couple of title cards.
- 0:20–0:40 — Log in → the Command Map appears (the "wow" opening shot).
- 0:40–1:40 — ⭐ Linkage: open a serial cluster across cities → paste a NEW report →
  watch it match "87%, Cluster #3". **Slow down here — this is the money moment.**
- 1:40–2:10 — Forecast map + patrol suggestion; flash the "validated on real data" number.
- 2:10–2:35 — Quick montage: alerts, network graph, outcomes, Kannada briefing PDF.
- 2:35–3:00 — Ethics card → Catalyst architecture card → end on the logo + one impact line.
**Rules:** captions for every feature (judges may watch muted), 1080p, upload as an
**unlisted YouTube** link (most reliable) and test it in a private/incognito window.

### 3d. 🕵️ SECRET TASK — the blind-test (do NOT show Aditya)
**Why:** our best slide claims *"NETRA's AI found serial crimes it was never shown."*
That's only **honest** if the hidden crimes were planted by someone **other than the
person who built the AI** — that's you.

**By Jul 15:** in a private file (NOT in the shared repo), write **5 made-up serial-crime
stories** in plain words. Each: a crime type, a repeated "method" (how they break in,
tools, target, time of day), 4–8 incidents, 2–3 Karnataka districts, rough dates.
Example: *"A burglar hits ground-floor pharmacies in Tumakuru, Chitradurga and
Davanagere between 1–3 AM, cuts the rear shutter, takes only cash and cough syrup,
sprays the CCTV black. 7 incidents, Feb–Jun 2026."* Make 2 easy, 2 medium, 1 hard (one
partly in Kannada). Aditya will give you a simple form + a one-click script to add them
into the data. **Keep the answer key secret** until he reports what his AI found — then
we get an honest score for the slide.

### 3e. Submission-day checklist (Jul 26 morning — NOT 11 PM)
Every item is required; a missing or broken link can **disqualify us**.
- [ ] Deck: official template ✓ PDF ✓ under 5 MB ✓ opens cleanly
- [ ] Brief: ≤1024 characters, pasted, not cut off
- [ ] GitHub repo link — Aditya makes it **public** first; check it opens logged-out
- [ ] Demo video — plays in an incognito window, audio synced
- [ ] Catalyst deployed link — opens in incognito, the 3 demo logins work (get them from Aditya)
- [ ] Submit well before **11:59 PM IST** — aim for **6 PM**.

---

## PART 4 — WHAT YOU NEED FROM YOUR TEAMMATES (and what they need from you)

### You GET from Aditya (chase these early!):
| What | When you need it |
|---|---|
| NCRB crime statistics for the Problem slide | Jul 17 |
| The architecture diagram | Jul 17 |
| Final app **screenshots** | Jul 21–22 |
| The blind-test **number** + benchmark number | Jul 21 |
| Raw screen recordings + voiceover for the video | Jul 22–23 |
| The **3 demo login credentials** (HQ/District/Station) | Jul 25 |
| GitHub repo made **public** | Jul 26 |

### You GET from the Designer:
- The **NETRA logo**
- The **beautifully designed slides** (you give them content, they lay it out)
- **Nicely framed screenshots** for the deck and video

### You GIVE to the Designer:
- The **deck content** (what words go on each slide) so they can design it
- The **official submission template** (so they design within the required format)

### You GIVE to Aditya:
- Nothing needed for his build — **except** you quietly run the blind-test injection
  (his script) and keep the answer key until scoring.

---

## PART 5 — HELPFUL EXTRAS

- **Tools:** Canva or Google Slides for the deck (Designer may prefer Figma — coordinate);
  tinypng.com to shrink images; a screen recorder + a simple editor (CapCut is free and easy)
  for the video.
- **Presentation is ~20–30% of most hackathon scores** — a clear, confident deck and a
  crisp video genuinely move us up. Don't treat it as an afterthought.
- **Tell a story, don't list features.** The winning frame is *"An SP opens NETRA on
  Monday morning and instantly sees what changed in her district."* Use that everywhere.
- **Numbers > adjectives.** "Found 4 of 5 hidden patterns" beats "very accurate."
- **Always disclose** the data is synthetic — honesty scores points with government judges,
  and getting caught hiding it loses everything.
- **Start early.** The deck skeleton on Jul 17 (even with empty screenshot boxes) means
  Jul 25 is calm, not chaos. Record a **backup video by Jul 23** so a Wi-Fi problem on the
  26th can't sink us.

**One sentence:** turn NETRA into a story judges can't ignore — a beautiful deck, a
tight 3-minute video, and a flawless on-time submission. 🎬
