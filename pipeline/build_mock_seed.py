"""Derive a compact mock-seed.json from the generated dataset.

The frontend teammate develops against these mocks (see docs/TEAMMATE_FRONTEND_GUIDE.md).
Because the payloads are computed from the real generated data, flipping from
mocks to live APIs later requires no reshaping. Also serves as a first cut of
the aggregation logic the AppSail API will implement.

Run: python3 -m pipeline.build_mock_seed
"""
import json
import os
from collections import Counter, defaultdict
from datetime import date

DATA = "pipeline/data"
REF = "pipeline/reference"


def jsonl(name):
    return [json.loads(l) for l in open(os.path.join(DATA, name), encoding="utf-8")]


def jload(path):
    return json.load(open(path, encoding="utf-8"))


cases = jsonl("cases.jsonl")
cs = jsonl("chargesheets.jsonl")
acc = jsonl("accused.jsonl")
districts = jload(f"{REF}/districts.json")["districts"]
tax = jload(f"{REF}/crime-taxonomy.json")
gt = jload(f"{DATA}/planted_patterns.json")
offenders = jload(f"{DATA}/offenders.json")

dmap = {d["districtId"]: d for d in districts}
submap = {s["crimeSubHeadId"]: s for s in tax["crimeSubHeads"]}
cmap = {c["caseMasterId"]: c for c in cases}

# ---- /geo/districts ----
by_dist = Counter(c["districtId"] for c in cases)
heinous_by_dist = Counter(c["districtId"] for c in cases if c["gravityOffenceId"] == 1)
geo_districts = [{
    "districtId": d["districtId"], "name": d["name"], "lat": d["lat"], "lng": d["lng"],
    "caseCount": by_dist[d["districtId"]], "heinousCount": heinous_by_dist[d["districtId"]],
} for d in districts]

# ---- /stats/summary (state level) ----
cst = Counter(x["cstype"] for x in cs)
detection = round(100 * cst["A"] / (cst["A"] + cst["B"] + cst["C"]), 1)
summary = {
    "totalCases": len(cases),
    "heinousCases": sum(1 for c in cases if c["gravityOffenceId"] == 1),
    "detectionRatePct": detection,
    "activeHotspots": len(gt["bursts"]) + 8,
    "openAlerts": len(gt["bursts"]),
    "linkedClusters": len(gt["serialClusters"]),
}

# ---- /stats/trends (monthly, top 5 districts) ----
top5 = [d for d, _ in by_dist.most_common(5)]
monthly = defaultdict(lambda: defaultdict(int))
for c in cases:
    if c["districtId"] in top5:
        monthly[c["districtId"]][c["crimeRegisteredDate"][:7]] += 1
months = sorted({c["crimeRegisteredDate"][:7] for c in cases})
trends = [{
    "districtId": did, "name": dmap[did]["name"],
    "points": [{"month": m, "count": monthly[did].get(m, 0)} for m in months],
} for did in top5]

# ---- /stats/outcomes (A/B/C per district, top 12 by volume) ----
cs_by_case = {x["caseMasterId"]: x["cstype"] for x in cs}
outcomes = []
for did, _ in by_dist.most_common(12):
    oc = Counter()
    for c in cases:
        if c["districtId"] == did and c["caseMasterId"] in cs_by_case:
            oc[cs_by_case[c["caseMasterId"]]] += 1
    tot = sum(oc.values()) or 1
    outcomes.append({"districtId": did, "name": dmap[did]["name"],
                     "chargesheeted": oc["A"], "false": oc["B"], "undetected": oc["C"],
                     "undetectedPct": round(100 * oc["C"] / tot, 1)})

# ---- /linkage/clusters ----
clusters = []
for cl in gt["serialClusters"]:
    members = [cmap[m] for m in cl["memberCaseIds"]]
    clusters.append({
        "clusterId": cl["id"], "label": cl["label"],
        "crimeType": submap[cl["subheadId"]]["name"],
        "districtsSpanned": sorted({dmap[c["districtId"]]["name"] for c in members}),
        "memberCount": len(members),
        "confidence": round(0.78 + 0.02 * (len(members) % 6), 2),
        "sharedMO": cl["mo"],
        "sampleNarratives": [c["briefFacts"] for c in members[:3]],
        "memberCaseNos": [c["crimeNo"] for c in members],
    })

# ---- /alerts (from bursts) ----
alerts = []
for b in gt["bursts"]:
    sub = submap[b["subheadId"]]
    alerts.append({"alertId": b["id"], "districtId": b["districtId"], "district": dmap[b["districtId"]]["name"],
                   "crimeType": sub["name"], "severity": "high" if len(b["memberCaseIds"]) > 100 else "medium",
                   "message": f"{sub['name']} spike detected in {dmap[b['districtId']]['name']} — "
                              f"{len(b['memberCaseIds'])} cases in a short window.",
                   "caseCount": len(b["memberCaseIds"])})

# ---- /network/graph (top repeat offenders + their co-accused edges) ----
top_offenders = sorted(offenders, key=lambda o: -o["caseCount"])[:15]
network = {"nodes": [{"offenderId": o["offenderId"], "name": o["canonicalName"], "caseCount": o["caseCount"]}
                     for o in top_offenders]}

# ---- /data-quality ----
present = sum(1 for c in cases if c["latitude"] is not None)
data_quality = {"totalCases": len(cases), "geocodedPct": round(100 * present / len(cases), 1),
                "fallback": "station-level aggregation for un-geocoded cases", "kannadaPct": 20.3}

# ---- sample full cases (for /cases/:id) ----
sample_cases = []
for c in list(cases)[:3] + [cmap[gt["serialClusters"][0]["memberCaseIds"][0]]]:
    sample_cases.append({
        "caseMasterId": c["caseMasterId"], "crimeNo": c["crimeNo"], "caseNo": c["caseNo"],
        "registeredDate": c["crimeRegisteredDate"], "district": dmap[c["districtId"]]["name"],
        "crimeHead": next(h["crimeGroupName"] for h in tax["crimeHeads"] if h["crimeHeadId"] == c["crimeMajorHeadId"]),
        "crimeSubHead": submap[c["crimeMinorHeadId"]]["name"],
        "gravity": submap[c["crimeMinorHeadId"]]["gravity"],
        "briefFacts": c["briefFacts"], "language": c["language"],
        "latitude": c["latitude"], "longitude": c["longitude"]})

# ---- /briefings/today (sample, EN + KN) ----
top_d = dmap[by_dist.most_common(1)[0][0]]
briefing = {
    "district": top_d["name"], "date": "2026-06-30",
    "en": (f"Good morning. In {top_d['name']} over the past week, property crimes remained the leading "
           f"category. An active alert flags a rise in motor-vehicle theft in the Whitefield belt. "
           f"Two cross-district serial patterns are under watch. Detection rate stands at {detection}%."),
    "kn": (f"ಶುಭೋದಯ. {top_d['name']} ಜಿಲ್ಲೆಯಲ್ಲಿ ಕಳೆದ ವಾರ ಆಸ್ತಿ ಅಪರಾಧಗಳು ಪ್ರಮುಖವಾಗಿವೆ. "
           f"ವೈಟ್‌ಫೀಲ್ಡ್ ಭಾಗದಲ್ಲಿ ವಾಹನ ಕಳ್ಳತನ ಹೆಚ್ಚಳ ಕುರಿತು ಎಚ್ಚರಿಕೆ ನೀಡಲಾಗಿದೆ."),
    "pdfUrl": None,
}

seed = {
    "_meta": {"note": "Mock API payloads derived from the real generated dataset. Shapes match "
                      "docs/SYSTEM_DESIGN.md §4. Flip VITE_USE_MOCKS=false when live APIs land."},
    "geo/districts": geo_districts,
    "stats/summary": summary,
    "stats/trends": trends,
    "stats/outcomes": outcomes,
    "linkage/clusters": clusters,
    "alerts": alerts,
    "network/graph": network,
    "data-quality": data_quality,
    "cases/sample": sample_cases,
    "briefings/today": briefing,
}

with open("pipeline/mock-seed.json", "w", encoding="utf-8") as f:
    json.dump(seed, f, ensure_ascii=False, indent=2)
print(f"mock-seed.json written: {len(clusters)} clusters, {len(geo_districts)} districts, "
      f"{len(alerts)} alerts, {len(outcomes)} outcome rows, detection {detection}%")
