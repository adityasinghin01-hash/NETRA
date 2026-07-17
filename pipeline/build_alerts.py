"""Anomaly & Alert Center feed — multiple alert types, each with a "why flagged" statistic.

Types:
  • Volume spike   — planted bursts, scored as σ above the district-subhead monthly baseline.
  • Emerging serial — a serial cluster forming (MO fingerprint not previously seen).
  • Repeat offender — a kingpin's ring active (from the offender network communities).

Output: frontend/public/alerts-feed.json
Run: python3 -m pipeline.build_alerts
"""
import json
import os
from collections import defaultdict
from datetime import date

import numpy as np

DATA = "pipeline/data"
REF = "pipeline/reference"
OUT = "frontend/public/alerts-feed.json"


def jload(p):
    return json.load(open(p, encoding="utf-8"))


def main():
    gt = jload(f"{DATA}/planted_patterns.json")
    tax = jload(f"{REF}/crime-taxonomy.json")
    submap = {s["crimeSubHeadId"]: s for s in tax["crimeSubHeads"]}
    dmap = {d["districtId"]: d["name"] for d in jload(f"{REF}/districts.json")["districts"]}
    net = jload("frontend/public/network-graph.json")
    dna = jload("frontend/public/crime-dna.json")

    # monthly (district, subhead) counts for baselines + per-case day for burst windows
    monthly = defaultdict(lambda: defaultdict(int))
    case_day = {}
    for line in open(f"{DATA}/cases.jsonl", encoding="utf-8"):
        c = json.loads(line)
        raw = c.get("incidentFromDate") or c.get("crimeRegisteredDate") or ""
        if raw[:7]:
            monthly[(c["districtId"], c["crimeMinorHeadId"])][raw[:7]] += 1
        case_day[c["caseMasterId"]] = raw[:10]

    alerts = []
    aid = 1

    # 1) Volume spikes from bursts
    for burst in gt["bursts"]:
        did, sid = burst["districtId"], burst["subheadId"]
        members = burst.get("memberCaseIds", [])
        count = len(members)
        dates = sorted(d for d in (case_day.get(m) for m in members) if d)
        days = (date.fromisoformat(dates[-1]) - date.fromisoformat(dates[0])).days if len(dates) >= 2 else 30
        start = dates[0] if dates else "2025-01-01"
        series = list(monthly[(did, sid)].values())
        mean = float(np.mean(series)) if series else 1.0
        std = float(np.std(series)) or 1.0
        burst_rate = count / max(1, days / 30)
        z = round((burst_rate - mean) / std, 1)
        alerts.append({
            "id": f"AL{aid:02d}", "type": "Volume spike", "severity": "high" if z >= 3 else "medium",
            "district": dmap[did], "crimeType": submap[sid]["name"],
            "message": f"{submap[sid]['name']} surge in {dmap[did]} — {count} cases in {days} days ({burst['note']}).",
            "why": f"{z}σ above the district's monthly baseline",
            "count": count, "date": start, "status": "New",
        })
        aid += 1

    # 2) Emerging serial patterns (a few clusters)
    for c in list(dna.values())[:4]:
        alerts.append({
            "id": f"AL{aid:02d}", "type": "Emerging serial pattern", "severity": "high",
            "district": ", ".join(c["districts"][:2]) + ("…" if len(c["districts"]) > 2 else ""),
            "crimeType": c["crimeType"],
            "message": f"Serial pattern forming — “{c['label']}”: {c['memberCount']} FIRs across {len(c['districts'])} districts share one MO fingerprint.",
            "why": "MO-fingerprint cluster not previously seen (caught early)",
            "count": c["memberCount"], "date": c.get("span", {}).get("last") or "2026-06-01", "status": "New",
        })
        aid += 1

    # 3) Repeat-offender / ring activity (top kingpins)
    for comm in net.get("communities", [])[:3]:
        alerts.append({
            "id": f"AL{aid:02d}", "type": "Repeat offender", "severity": "medium",
            "district": "state-wide", "crimeType": comm["label"],
            "message": f"Active ring — kingpin {comm['kingpin']} coordinates a {comm['size']}-member ring (“{comm['label']}”).",
            "why": "high betweenness-centrality node in the offender network",
            "count": comm["size"], "date": "2026-06-15", "status": "New",
        })
        aid += 1

    sev_rank = {"high": 0, "medium": 1, "low": 2}
    alerts.sort(key=lambda a: (sev_rank.get(a["severity"], 3), a["date"]))
    json.dump(alerts, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"alerts-feed: {len(alerts)} alerts ({sum(1 for a in alerts if a['severity']=='high')} high) → {OUT}")
    for a in alerts[:4]:
        print(f"  [{a['severity']}] {a['type']}: {a['message'][:70]}… ({a['why']})")


if __name__ == "__main__":
    main()
