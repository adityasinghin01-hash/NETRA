"""Cases at risk of going cold — a prescriptive worklist of OPEN FIRs the model flags
as likely to end UNDETECTED, so an IO can intervene BEFORE they die.

An "open" case has no chargesheet yet (still under investigation). Cold-risk blends how
long it has sat open with its crime type's historical undetected rate. Turns a statistic
into a ranked to-do list (state-wide + per district).

Output: frontend/public/cold-cases.json  { state:[...], districts:{name:[...]} }
Run: python3 -m pipeline.build_coldcases
"""
import json
import os
from collections import Counter, defaultdict
from datetime import date

DATA = "pipeline/data"
REF = "pipeline/reference"
OUT = "frontend/public/cold-cases.json"
END = date(2026, 6, 30)


def main():
    tax = json.load(open(f"{REF}/crime-taxonomy.json", encoding="utf-8"))
    submap = {s["crimeSubHeadId"]: s["name"] for s in tax["crimeSubHeads"]}
    dmap = {d["districtId"]: d["name"] for d in json.load(open(f"{REF}/districts.json", encoding="utf-8"))["districts"]}

    cs_type = {}
    with open(f"{DATA}/chargesheets.jsonl", encoding="utf-8") as f:
        for line in f:
            x = json.loads(line)
            cs_type[x["caseMasterId"]] = x["cstype"]

    # Historical undetected rate per sub-head: fraction of resolved cases closed 'B' (undetected).
    tot = Counter()
    undet = Counter()
    cases = [json.loads(l) for l in open(f"{DATA}/cases.jsonl", encoding="utf-8")]
    for c in cases:
        cst = cs_type.get(c["caseMasterId"])
        if cst:
            tot[c["crimeMinorHeadId"]] += 1
            if cst == "B":
                undet[c["crimeMinorHeadId"]] += 1
    rate = {sh: (undet[sh] / tot[sh]) if tot[sh] else 0.2 for sh in tot}

    # Open cases = no chargesheet yet.
    open_cases = [c for c in cases if c["caseMasterId"] not in cs_type]
    max_days = max((END - date.fromisoformat(c["crimeRegisteredDate"])).days for c in open_cases) or 1

    scored = []
    for c in open_cases:
        days = (END - date.fromisoformat(c["crimeRegisteredDate"])).days
        r = rate.get(c["crimeMinorHeadId"], 0.2)
        risk = 0.55 * (days / max_days) + 0.45 * r
        scored.append({
            "crimeNo": c["crimeNo"], "district": dmap[c["districtId"]],
            "type": submap.get(c["crimeMinorHeadId"], "—"),
            "registered": c["crimeRegisteredDate"], "daysOpen": days,
            "risk": round(risk, 3),
            "reason": f"open {days}d · {submap.get(c['crimeMinorHeadId'],'—')} historically {round(r*100)}% undetected",
        })
    scored.sort(key=lambda x: -x["risk"])

    by_dist = defaultdict(list)
    for s in scored:
        if len(by_dist[s["district"]]) < 10:
            by_dist[s["district"]].append(s)

    out = {"state": scored[:25], "districts": by_dist}
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"cold-cases: {len(open_cases)} open · top {len(out['state'])} state → {OUT} ({os.path.getsize(OUT)/1024:.0f} KB)")
    for s in scored[:3]:
        print(f"  risk {s['risk']} · {s['crimeNo']} · {s['district']} · {s['reason']}")


if __name__ == "__main__":
    main()
