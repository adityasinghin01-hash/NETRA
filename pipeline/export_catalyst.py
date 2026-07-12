"""Export the dataset to CSVs for Catalyst Data Store bulk import.

Catalyst tables are created in the web console (no API). To minimise that manual
step we use just TWO tables:

  1. Store  (rkey Text, rvalue Text[large])  — every dashboard/API payload as one
     row each (geo/districts, stats/summary, linkage/clusters, ...). This single
     small table makes the WHOLE app live on Data Store. Derived from
     pipeline/mock-seed.json so it's guaranteed consistent with what the UI shows.

  2. Cases  (flattened FIR columns)          — the 50k browsable case rows, added
     for depth / real case search & detail. Not required for the dashboard MVP.

Run: python3 -m pipeline.export_catalyst    (regenerates mock-seed first)
"""
import csv
import json
import os
import subprocess

DATA = "pipeline/data"
REF = "pipeline/reference"
OUT = "pipeline/data/catalyst"
EXPORT_N = 50_000  # cases exported to Cases.csv


def jsonl(name, limit=None):
    rows = []
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        for i, line in enumerate(f):
            if limit and i >= limit:
                break
            rows.append(json.loads(line))
    return rows


def jload(path):
    return json.load(open(path, encoding="utf-8"))


def main():
    os.makedirs(OUT, exist_ok=True)

    # Refresh mock-seed so Store matches the latest data, then use it as the source.
    subprocess.run(["python3", "-m", "pipeline.build_mock_seed"], check=True)
    seed = jload("pipeline/mock-seed.json")

    # Catalyst 'Text' columns cap at 10,000 chars, so keep every payload under a
    # safety limit. trends is the only bloated one — trim to top-3 districts /
    # last 36 months (it isn't rendered yet; shapes realign when we build the chart).
    LIMIT = 9500
    if seed.get("stats/trends"):
        t = seed["stats/trends"][:3]
        for s in t:
            s["points"] = s["points"][-36:]
        seed["stats/trends"] = t
    if seed.get("linkage/clusters"):
        for c in seed["linkage/clusters"]:
            c["sampleNarratives"] = c.get("sampleNarratives", [])[:2]
            c["memberCaseNos"] = c.get("memberCaseNos", [])[:8]

    # ---- Store.csv : one row per API payload ----
    with open(f"{OUT}/Store.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["rkey", "rvalue"])
        for key, val in seed.items():
            if key == "_meta":
                continue
            payload = json.dumps(val, ensure_ascii=False)
            if len(payload) > LIMIT:
                raise SystemExit(f"❌ payload '{key}' is {len(payload)} chars > {LIMIT} "
                                 f"(Catalyst Text max 10,000). Trim it before importing.")
            w.writerow([key, payload])

    # ---- Cases.csv : flattened 50k rows (for the Cases table) ----
    districts = jload(f"{REF}/districts.json")["districts"]
    lookups = jload(f"{REF}/lookups.json")
    tax = jload(f"{REF}/crime-taxonomy.json")
    dmap = {d["districtId"]: d for d in districts}
    submap = {s["crimeSubHeadId"]: s for s in tax["crimeSubHeads"]}
    headmap = {h["crimeHeadId"]: h["crimeGroupName"] for h in tax["crimeHeads"]}
    catmap = {c["caseCategoryId"]: c["lookupValue"] for c in lookups["caseCategories"]}
    statusmap = {s["caseStatusId"]: s["caseStatusName"] for s in lookups["caseStatus"]}
    unit_name = {u["unitId"]: u["unitName"] for u in jsonl("units.jsonl")}

    cases = jsonl("cases.jsonl", EXPORT_N)
    case_ids = {c["caseMasterId"] for c in cases}
    cs = {x["caseMasterId"]: x["cstype"] for x in jsonl("chargesheets.jsonl") if x["caseMasterId"] in case_ids}

    fields = ["crimeNo", "registeredDate", "incidentDate", "districtName", "stationName",
              "latitude", "longitude", "crimeHead", "crimeSubHead", "gravity", "category",
              "status", "cstype", "briefFacts", "language", "clusterRef"]
    with open(f"{OUT}/Cases.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for c in cases:
            sub = submap[c["crimeMinorHeadId"]]
            w.writerow({
                "crimeNo": c["crimeNo"], "registeredDate": c["crimeRegisteredDate"],
                "incidentDate": c["incidentFromDate"], "districtName": dmap[c["districtId"]]["name"],
                "stationName": unit_name.get(c["policeStationId"], ""),
                "latitude": c["latitude"] if c["latitude"] is not None else "",
                "longitude": c["longitude"] if c["longitude"] is not None else "",
                "crimeHead": headmap[c["crimeMajorHeadId"]], "crimeSubHead": sub["name"],
                "gravity": sub["gravity"], "category": catmap[c["caseCategoryId"]],
                "status": statusmap[c["caseStatusId"]], "cstype": cs.get(c["caseMasterId"], ""),
                "briefFacts": c["briefFacts"], "language": c["language"],
                "clusterRef": c.get("clusterRef") or "",
            })

    for name in ("Store.csv", "Cases.csv"):
        sz = os.path.getsize(f"{OUT}/{name}")
        n = sum(1 for _ in open(f"{OUT}/{name}", encoding="utf-8")) - 1
        print(f"{name:12} {n:>7,} rows  {sz/1024:>8.0f} KB")
    print(f"→ {OUT}/   (Store = whole dashboard; Cases = 50k for depth)")


if __name__ == "__main__":
    main()
