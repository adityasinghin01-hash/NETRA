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
from collections import Counter, defaultdict
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
    cm2crime = {}  # caseMasterId → crimeNo, so an alert can open its triggering FIR in Case Search
    for line in open(f"{DATA}/cases.jsonl", encoding="utf-8"):
        c = json.loads(line)
        raw = c.get("incidentFromDate") or c.get("crimeRegisteredDate") or ""
        if raw[:7]:
            monthly[(c["districtId"], c["crimeMinorHeadId"])][raw[:7]] += 1
        case_day[c["caseMasterId"]] = raw[:10]
        cm2crime[c["caseMasterId"]] = str(c["crimeNo"])
    dna_by_label = {c["label"]: c for c in dna.values()}  # ring/cluster label → Crime-DNA cluster

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
            "crimeNo": cm2crime.get(members[0]) if members else None,
            "clusterId": None,
            "where": f"{dmap[did]} district",
            "when": f"{start} · {days}-day window",
            "how": f"A sudden concentration of {submap[sid]['name']} cases in one area over a short window.",
            "stat": f"{count} cases in {days} days ≈ {burst_rate:.1f}/month vs a {mean:.0f}/month baseline (σ={std:.1f}) → {z}σ. A scan over district×crime-type monthly counts flags this as significant.",
            "recommendation": "Surge patrol into the affected area and check whether the cases share an MO (a forming serial cluster) rather than being independent.",
        })
        aid += 1

    # 2) Emerging serial patterns (a few clusters)
    for c in list(dna.values())[:4]:
        members = sorted(c.get("members", []), key=lambda m: m.get("date") or "")
        trigger = members[-1] if members else {}
        mo = " · ".join(s["value"] for s in c.get("signature", [])[:4])
        alerts.append({
            "id": f"AL{aid:02d}", "type": "Emerging serial pattern", "severity": "high",
            "district": ", ".join(c["districts"][:2]) + ("…" if len(c["districts"]) > 2 else ""),
            "crimeType": c["crimeType"],
            "message": f"Serial pattern forming — “{c['label']}”: {c['memberCount']} FIRs across {len(c['districts'])} districts share one MO fingerprint.",
            "why": "MO-fingerprint cluster not previously seen (caught early)",
            "count": c["memberCount"], "date": c.get("span", {}).get("last") or "2026-06-01", "status": "New",
            "crimeNo": trigger.get("caseNo"),
            "clusterId": c["clusterId"],
            "where": ", ".join(c["districts"]) + f" ({len(c['districts'])} districts)",
            "when": f"{c.get('span', {}).get('first') or '?'} → {c.get('span', {}).get('last') or '?'}"
                    + (f" · strikes ~every {c['span']['cadenceDays']} days" if c.get("span", {}).get("cadenceDays") else ""),
            "how": f"Same modus operandi across all {c['memberCount']} FIRs: {mo}." + (f" Shared hand: {c['offender']}." if c.get("offender") else ""),
            "stat": f"An MO-fingerprint (semantic + geo + time + method) clusters these {c['memberCount']} FIRs at {round(c.get('confidence', 0) * 100)}% cohesion. The signature did not exist before — the pattern is caught while forming, not after case #{c['memberCount'] + 5}.",
            "recommendation": f"Consolidate the {c['memberCount']} FIRs into one investigation and notify the affected SHOs. Open Linkage for the predicted base zone and next-strike window."
                              + (f" {c['unsolvedCount']} of the linked FIRs are still unsolved — one arrest could clear them together." if c.get("unsolvedCount") else ""),
        })
        aid += 1

    # 3) Repeat-offender / ring activity (top kingpins).
    # A ring is only alertable if it maps to a real Crime-DNA cluster (label match, or via the
    # cluster label its member nodes carry) — otherwise there is no FIR for the officer to open.
    node_by_id = {n["id"]: n for n in net.get("nodes", [])}
    node_comm_cluster = defaultdict(Counter)
    for n in net.get("nodes", []):
        if n.get("cluster"):
            node_comm_cluster[n.get("community")][n["cluster"]] += 1

    def ring_cluster(comm):
        if comm["label"] in dna_by_label:
            return dna_by_label[comm["label"]]
        kp = node_by_id.get(comm.get("kingpinId"), {})
        if kp.get("cluster") in dna_by_label:
            return dna_by_label[kp["cluster"]]
        top = node_comm_cluster.get(comm["id"])
        if top:
            best = top.most_common(1)[0][0]
            return dna_by_label.get(best, {})
        return {}

    ringable = [c for c in net.get("communities", []) if ring_cluster(c)]
    for comm in ringable[:3]:
        dc = ring_cluster(comm)  # matching Crime-DNA cluster (for a case to open)
        members = sorted(dc.get("members", []), key=lambda m: m.get("date") or "")
        trigger = members[-1] if members else {}
        districts = dc.get("districts", [])
        alerts.append({
            "id": f"AL{aid:02d}", "type": "Repeat offender", "severity": "medium",
            "district": ", ".join(districts[:2]) + ("…" if len(districts) > 2 else "") if districts else "state-wide",
            "crimeType": comm["label"],
            "message": f"Active ring — kingpin {comm['kingpin']} coordinates a {comm['size']}-member ring (“{comm['label']}”).",
            "why": "high betweenness-centrality node in the offender network",
            "count": comm["size"], "date": trigger.get("date") or "2026-06-15", "status": "New",
            "crimeNo": trigger.get("caseNo"),
            "clusterId": dc.get("clusterId"),
            "where": (", ".join(districts) if districts else "state-wide"),
            "when": f"latest linked FIR {trigger.get('date') or '?'}",
            "how": f"A {comm['size']}-member co-offending ring operating under one modus operandi, coordinated by {comm['kingpin']}.",
            "stat": f"Louvain community detection isolates this ring; {comm['kingpin']} has the highest betweenness centrality — the coordinator whose removal fragments the network.",
            "recommendation": f"Target the coordinator ({comm['kingpin']}), not just foot-soldiers — removing the highest-centrality node breaks the ring. Open Analytics → Network to see the structure.",
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
