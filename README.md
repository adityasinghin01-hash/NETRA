# NETRA 👁️

**N**etworked **E**vidence, **T**racking & **R**isk **A**nalytics

> *The watchful eye of Karnataka Police — turning fragmented crime records into actionable intelligence.*

NETRA is an AI-driven crime analytics & visualization platform built for **Challenge 2 of the Karnataka State Police Datathon 2026** ([Hack2Skill](https://hack2skill.com/event/datathon2026)). It transforms siloed FIR data into interactive dashboards, geospatial hotspot maps, and predictive insights for proactive policing.

## What it does

- 🗺️ **Geospatial crime maps** — state → district → police-station drilldowns with hotspot detection (clustering on FIR lat/long)
- 📈 **Trend & anomaly alerts** — time-series analysis of crime registrations with early-warning signals
- 🕸️ **Network & link analysis** — repeat-offender tracking and criminal association graphs across cases
- 🎯 **Predictive risk scoring** — data-driven risk indicators per region and crime head
- 📊 **Interactive dashboards** — case-outcome analytics (chargesheet / false-case / undetected rates), heinous-crime trends, socio-economic correlations
- 🔐 **Role-based secure access** — JWT auth with per-role views (HQ, district, station)

## Data model

Schema mirrors the official **KSP Police FIR System ER diagram** (CaseMaster, Accused, Victim, ArrestSurrender, CrimeHead/SubHead, Act/Section, Unit hierarchy, …) so the platform can plug into real SCRB data. Demo runs on synthetic FIR data generated to that exact schema.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React (Vite), Leaflet + OpenStreetMap, Recharts |
| Backend / API | Node.js, Express, MongoDB (Mongoose) |
| Analytics / ML | Python — pandas, scikit-learn (clustering, anomaly detection), networkx |
| Auth & security | JWT, helmet, rate limiting, role-based access |
| Deploy | Render |

## Team

Built by a team of 3 for KSP Datathon 2026. Prototype submission: **26 July 2026**.

---

*NETRA (नेत्र) means "eye" in Sanskrit.*
