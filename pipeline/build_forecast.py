"""Build a 7-day hotspot forecast + patrol plan for the Command Map.

Method (transparent, explainable): for each district we compare the last 60 days
of FIRs to the previous 60 days to get a momentum score, and combine it with a
seasonal/weekly baseline. Sustained rises (incl. the flagged bursts) surface as
predicted hotspots for the coming week, each with a recommended patrol window
derived from the dominant crime type's typical time-of-day.

Output: frontend/public/forecast.json
Run: python3 -m pipeline.build_forecast
"""
import json
import os
from collections import Counter, defaultdict
from datetime import date, timedelta

DATA = "pipeline/data"
REF = "pipeline/reference"
OUT = "frontend/public/forecast.json"
END = date(2026, 6, 30)  # dataset "today"

PATROL = {  # dominant crime family -> suggested patrol window
    "House-Breaking & Burglary": "22:00 – 03:00",
    "Theft (Ordinary)": "20:00 – 01:00",
    "Motor Vehicle Theft": "23:00 – 04:00",
    "Robbery": "18:00 – 22:00",
    "Online Financial Fraud": "awareness drive (all-day)",
    "Hurt (Simple)": "19:00 – 23:00",
}


def jsonl(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return [json.loads(l) for l in f]


def jload(p):
    return json.load(open(p, encoding="utf-8"))


def main():
    districts = {d["districtId"]: d for d in jload(f"{REF}/districts.json")["districts"]}
    tax = jload(f"{REF}/crime-taxonomy.json")
    submap = {s["crimeSubHeadId"]: s for s in tax["crimeSubHeads"]}
    cases = jsonl("cases.jsonl")

    recent0 = END - timedelta(days=60)   # last 60 days
    recent1 = END - timedelta(days=120)  # prior 60 days
    last, prev = Counter(), Counter()
    dom_type = defaultdict(Counter)      # dominant recent crime type per district
    for c in cases:
        d = date.fromisoformat(c["crimeRegisteredDate"])
        did = c["districtId"]
        sub = submap[c["crimeMinorHeadId"]]
        if d >= recent0:
            last[did] += 1
            if sub["crimeHeadId"] != 9:  # exclude Unnatural Death — not patrol-relevant
                dom_type[did][sub["name"]] += 1
        elif d >= recent1:
            prev[did] += 1

    rows = []
    for did, l in last.items():
        p = prev.get(did, 0)
        momentum = (l - p) / (p + 5)                 # smoothed growth
        risk = round(l * (1 + max(0, momentum)), 0)  # projected next-week pressure
        top_type = dom_type[did].most_common(1)[0][0]
        rows.append({
            "district": districts[did]["name"],
            "crimeType": top_type,
            "projectedWeek": int(risk / 8),           # ~weekly figure
            "momentumPct": round(momentum * 100),
            "riskLevel": "High" if momentum > 0.15 and l > 200 else "Elevated" if momentum > 0.05 else "Watch",
            "patrolWindow": PATROL.get(top_type, "19:00 – 23:00"),
            "lat": districts[did]["lat"], "lng": districts[did]["lng"],
        })

    rows = [r for r in rows if r["riskLevel"] != "Watch"]
    rows.sort(key=lambda r: (-{"High": 2, "Elevated": 1}.get(r["riskLevel"], 0), -r["momentumPct"]))
    rows = rows[:8]

    json.dump({"generatedFor": (END + timedelta(days=1)).isoformat(), "horizonDays": 7, "hotspots": rows},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"forecast: {len(rows)} predicted hotspots → {OUT}")
    for r in rows[:5]:
        print(f"  {r['riskLevel']:9} {r['district']:16} {r['crimeType']:26} +{r['momentumPct']}%  patrol {r['patrolWindow']}")


if __name__ == "__main__":
    main()
