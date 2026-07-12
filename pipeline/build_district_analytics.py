"""Precompute per-district analytics so every screen can scope to any jurisdiction.

For each of the 31 districts: monthly FIR trend, case-outcome breakdown (A/B/C),
detection rate, and the leading crime types. Served as a static file the frontend
loads when a District/Station officer is signed in (HQ uses the state-wide data).

Output: frontend/public/district-analytics.json
Run: python3 -m pipeline.build_district_analytics
"""
import json
import os
from collections import Counter, defaultdict

DATA = "pipeline/data"
REF = "pipeline/reference"
OUT = "frontend/public/district-analytics.json"


def jsonl(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return [json.loads(l) for l in f]


def main():
    districts = json.load(open(f"{REF}/districts.json", encoding="utf-8"))["districts"]
    tax = json.load(open(f"{REF}/crime-taxonomy.json", encoding="utf-8"))
    submap = {s["crimeSubHeadId"]: s for s in tax["crimeSubHeads"]}
    dname = {d["districtId"]: d["name"] for d in districts}

    cs = {x["caseMasterId"]: x["cstype"] for x in jsonl("chargesheets.jsonl")}
    cases = jsonl("cases.jsonl")

    months = sorted({c["crimeRegisteredDate"][:7] for c in cases})
    per = defaultdict(lambda: {
        "monthly": Counter(), "types": Counter(), "outcome": Counter(), "total": 0,
        "heinous": 0,
    })
    for c in cases:
        did = c["districtId"]
        p = per[did]
        p["total"] += 1
        p["monthly"][c["crimeRegisteredDate"][:7]] += 1
        sub = submap[c["crimeMinorHeadId"]]
        if sub["crimeHeadId"] != 9:
            p["types"][sub["name"]] += 1
        if c["gravityOffenceId"] == 1:
            p["heinous"] += 1
        cst = cs.get(c["caseMasterId"])
        if cst:
            p["outcome"][cst] += 1

    out = {"months": months, "districts": {}}
    for did, p in per.items():
        oc = p["outcome"]
        concluded = oc["A"] + oc["B"] + oc["C"] or 1
        top = p["types"].most_common(6)
        tt = sum(p["types"].values()) or 1
        out["districts"][dname[did]] = {
            "total": p["total"], "heinous": p["heinous"],
            "counts": [p["monthly"].get(m, 0) for m in months],
            "outcome": {"chargesheeted": oc["A"], "false": oc["B"], "undetected": oc["C"],
                        "undetectedPct": round(100 * oc["C"] / concluded, 1),
                        "detectionPct": round(100 * oc["A"] / concluded, 1)},
            "topCrimes": [{"type": t, "count": n, "pct": round(100 * n / tt, 1)} for t, n in top],
        }

    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    sz = os.path.getsize(OUT) / 1024
    print(f"per-district analytics: {len(out['districts'])} districts, {len(months)} months → {OUT} ({sz:.0f} KB)")
    m = out["districts"]["Mysuru"]
    print(f"  e.g. Mysuru: {m['total']} FIRs, detection {m['outcome']['detectionPct']}%, "
          f"top crime {m['topCrimes'][0]['type']} ({m['topCrimes'][0]['pct']}%)")


if __name__ == "__main__":
    main()
