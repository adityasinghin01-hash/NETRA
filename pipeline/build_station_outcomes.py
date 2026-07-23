"""Precompute station-level accountability + clearance-by-crime-type for Analytics → Outcomes.

Two views the district table can't give:
  * Station league table — per police station: detection %, undetected %, volume, leading
    crime type. The crime-review-meeting accountability scorecard (underperformers surface).
  * Clearance rate by crime type — which crime types get chargesheeted vs stay undetected.

Chargesheet type A = chargesheeted (detected), B = false, C = undetected (same mapping the
per-district analytics uses). Output: frontend/public/station-outcomes.json
Run: python3 -m pipeline.build_station_outcomes
"""
import json
import os
from collections import Counter, defaultdict

DATA = "pipeline/data"
REF = "pipeline/reference"
OUT = "frontend/public/station-outcomes.json"
MIN_CASES = 40  # below this a station's rate is too noisy to rank


def jsonl(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return [json.loads(l) for l in f]


def main():
    districts = json.load(open(f"{REF}/districts.json", encoding="utf-8"))["districts"]
    dname = {d["districtId"]: d["name"] for d in districts}
    tax = json.load(open(f"{REF}/crime-taxonomy.json", encoding="utf-8"))
    submap = {s["crimeSubHeadId"]: s for s in tax["crimeSubHeads"]}

    units = {u["unitId"]: u for u in jsonl("units.jsonl")}
    cs = {x["caseMasterId"]: x["cstype"] for x in jsonl("chargesheets.jsonl")}
    cases = jsonl("cases.jsonl")

    per = defaultdict(lambda: {"total": 0, "outcome": Counter(), "types": Counter()})
    by_type = defaultdict(lambda: Counter())
    for c in cases:
        sid = c["policeStationId"]
        p = per[sid]
        p["total"] += 1
        sub = submap[c["crimeMinorHeadId"]]
        if sub["crimeHeadId"] != 9:
            p["types"][sub["name"]] += 1
        cst = cs.get(c["caseMasterId"])
        if cst:
            p["outcome"][cst] += 1
            if sub["crimeHeadId"] != 9:
                by_type[sub["name"]][cst] += 1

    stations = []
    for sid, p in per.items():
        if p["total"] < MIN_CASES:
            continue
        oc = p["outcome"]
        concluded = oc["A"] + oc["B"] + oc["C"] or 1
        u = units.get(sid, {})
        top = p["types"].most_common(1)
        stations.append({
            "stationId": sid,
            "station": u.get("unitName", f"Station {sid}"),
            "district": dname.get(u.get("districtId"), "—"),
            "total": p["total"],
            "detectionPct": round(100 * oc["A"] / concluded, 1),
            "undetectedPct": round(100 * oc["C"] / concluded, 1),
            "topType": top[0][0] if top else "—",
        })
    # Worst detection first — the accountability scorecard leads with who needs help.
    stations.sort(key=lambda s: s["detectionPct"])

    clearance = []
    for t, oc in by_type.items():
        concluded = oc["A"] + oc["B"] + oc["C"]
        if concluded < 50:
            continue
        clearance.append({
            "type": t, "total": concluded,
            "clearancePct": round(100 * oc["A"] / concluded, 1),
        })
    clearance.sort(key=lambda x: -x["total"])

    out = {"stations": stations, "clearanceByType": clearance[:12], "minCases": MIN_CASES}
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    sz = os.path.getsize(OUT) / 1024
    print(f"station outcomes: {len(stations)} stations (>={MIN_CASES} cases), "
          f"{len(out['clearanceByType'])} crime types → {OUT} ({sz:.0f} KB)")
    w = stations[0]
    print(f"  lowest detection: {w['station']} ({w['district']}) — {w['detectionPct']}% detected, top {w['topType']}")
    print(f"  clearance range: {clearance[0]['type']} {clearance[0]['clearancePct']}% … "
          f"{min(clearance, key=lambda x: x['clearancePct'])['type']} "
          f"{min(clearance, key=lambda x: x['clearancePct'])['clearancePct']}%")


if __name__ == "__main__":
    main()
