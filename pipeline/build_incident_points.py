"""Build the map's incident-points file — a clean, enriched sample of real FIRs.

Samples cases (that carry coordinates, now land-clipped) from the 50k dataset and
emits one row per incident carrying enough to make a map dot CLICKABLE → show the real
FIR: [lat, lng, crimeHead, crimeNo, districtName, date, crimeType]. Back-compatible with
the Leaflet map (which only reads indices 0-2); deck.gl reads the rest for the popup.

Output: frontend/public/incident-points.json
Run: python3 -m pipeline.build_incident_points
"""
import json
import os
import random

DATA = "pipeline/data"
REF = "pipeline/reference"
OUT = "frontend/public/incident-points.json"
N = 6000
SEED = 7


def jload(p):
    return json.load(open(p, encoding="utf-8"))


def main():
    tax = jload(f"{REF}/crime-taxonomy.json")
    submap = {s["crimeSubHeadId"]: s for s in tax["crimeSubHeads"]}
    dmap = {d["districtId"]: d["name"] for d in jload(f"{REF}/districts.json")["districts"]}

    rows = []
    with open(os.path.join(DATA, "cases.jsonl"), encoding="utf-8") as f:
        for line in f:
            c = json.loads(line)
            if c.get("latitude") is None or c.get("longitude") is None:
                continue
            rows.append(c)

    rng = random.Random(SEED)
    sample = rng.sample(rows, min(N, len(rows)))

    pts = []
    for c in sample:
        sub = submap.get(c["crimeMinorHeadId"], {})
        head = sub.get("crimeHeadId", 9)
        date = (c.get("incidentFromDate") or c.get("crimeRegisteredDate") or "")[:10]
        pts.append([
            round(c["latitude"], 5), round(c["longitude"], 5), head,
            c["crimeNo"], dmap.get(c["districtId"], "—"), date, sub.get("name", "—"),
        ])

    json.dump(pts, open(OUT, "w"), ensure_ascii=False)
    kb = os.path.getsize(OUT) / 1024
    print(f"incident-points: {len(pts)} enriched points → {OUT} ({kb:.0f} KB)")
    print("  sample:", pts[0])


if __name__ == "__main__":
    main()
