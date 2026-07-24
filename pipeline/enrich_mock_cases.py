"""Enrich the mock `cases/sample` with a full case dossier — parties (complainant +
accused w/ prior record), forensic/evidence, correct status + districtName — drawn from
the REAL generated child tables (accused/complainants/chargesheets) plus the deterministic
forensic layer. Picks a diverse, demo-worthy spread (crime types, gravity, solved/unsolved,
incl. a serial-cluster member so the Investigator Copilot lights up).

Ethics: complainant/accused carry NAME/AGE/GENDER only — never caste/religion/occupation.

Writes cases/sample back into frontend/src/mocks/seed.json in place.
Run: python3 -m pipeline.enrich_mock_cases
"""
import json
import os

from pipeline.generator.forensic import forensic_for

DATA = "pipeline/data"
REF = "pipeline/reference"
SEED = "frontend/src/mocks/seed.json"
N = 14


def jload(p):
    return json.load(open(p, encoding="utf-8"))


def jsonl(p):
    with open(p, encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)


def main():
    lk = jload(f"{REF}/lookups.json")
    tax = jload(f"{REF}/crime-taxonomy.json")
    districts = jload(f"{REF}/districts.json")["districts"]
    status_name = {s["caseStatusId"]: s["caseStatusName"] for s in lk["caseStatus"]}
    gender_name = {g["genderId"]: g["label"] for g in lk["gender"]}
    submap = {s["crimeSubHeadId"]: s for s in tax["crimeSubHeads"]}
    dmap = {d["districtId"]: d for d in districts}
    priors = {o["offenderId"]: o.get("caseCount", 1) for o in jload(f"{DATA}/offenders.json")}

    complainant_by_case, accused_by_case = {}, {}
    for c in jsonl(f"{DATA}/complainants.jsonl"):
        complainant_by_case.setdefault(c["caseMasterId"], c)
    for a in jsonl(f"{DATA}/accused.jsonl"):
        accused_by_case.setdefault(a["caseMasterId"], []).append(a)
    cs_type = {x["caseMasterId"]: x["cstype"] for x in jsonl(f"{DATA}/chargesheets.jsonl")}

    # Pick a diverse spread: bucket by (subhead, isOpen) and take a few from each.
    want_heinous = {"Murder", "Grievous Hurt", "Robbery"}
    want_cyber = {"Online Financial Fraud", "Cheating & Fraud"}
    picked, seen_types = [], set()
    serial_first = None
    try:
        gt = jload(f"{DATA}/planted_patterns.json")
        serial_first = gt["serialClusters"][0]["memberCaseIds"][0]
    except Exception:
        pass

    for c in jsonl(f"{DATA}/cases.jsonl"):
        sub = submap[c["crimeMinorHeadId"]]["name"]
        key = (sub, c["caseStatusId"] in (2, 3, 4))  # solved-ish
        # prioritise variety, ensure a heinous + a cyber + a solved-with-accused make it in
        if key in seen_types and len(picked) > 4 and sub not in want_heinous and sub not in want_cyber:
            continue
        if c["caseMasterId"] not in accused_by_case and c["caseStatusId"] in (2, 3, 4):
            continue  # solved but no accused record — skip, looks odd
        picked.append(c)
        seen_types.add(key)
        if len(picked) >= N + 4:
            break

    # make sure the serial member is included (for the Investigator Copilot panel)
    if serial_first is not None and not any(c["caseMasterId"] == serial_first for c in picked):
        for c in jsonl(f"{DATA}/cases.jsonl"):
            if c["caseMasterId"] == serial_first:
                picked.insert(0, c)
                break

    sample = []
    for c in picked[:N]:
        sub = submap[c["crimeMinorHeadId"]]
        solved = cs_type.get(c["caseMasterId"]) == "A"
        comp = complainant_by_case.get(c["caseMasterId"])
        accused_recs = accused_by_case.get(c["caseMasterId"], [])
        accused = []
        for a in accused_recs[:3]:
            pc = priors.get(a.get("offenderRef"), 1)
            accused.append({
                "name": a["accusedName"],
                "age": a.get("ageYear"),
                "gender": gender_name.get(a.get("genderId"), ""),
                "priorCases": max(0, pc - 1),
                "historySheeter": pc >= 3,
            })
        primary_accused = accused[0]["name"] if accused else ""
        sample.append({
            "caseMasterId": c["caseMasterId"],
            "crimeNo": c["crimeNo"],
            "caseNo": c["caseNo"],
            "registeredDate": c["crimeRegisteredDate"],
            "districtName": dmap[c["districtId"]]["name"],
            "crimeSubHead": sub["name"],
            "gravity": sub["gravity"],
            "status": status_name[c["caseStatusId"]],
            "language": c.get("language", "en"),
            "briefFacts": c["briefFacts"],
            "latitude": c.get("latitude"),
            "longitude": c.get("longitude"),
            "complainant": ({"name": comp["complainantName"], "age": comp.get("ageYear"),
                             "gender": gender_name.get(comp.get("genderId"), "")} if comp else None),
            "accused": accused,
            "forensic": forensic_for(c["crimeNo"], sub["name"], sub["gravity"], solved,
                                     accused_name=primary_accused),
        })

    seed = jload(SEED)
    seed["cases/sample"] = sample
    with open(SEED, "w", encoding="utf-8") as f:
        json.dump(seed, f, ensure_ascii=False, indent=2)
    solved_n = sum(1 for s in sample if s["status"] in ("Charge Sheeted", "Pending Trial", "Disposed"))
    print(f"enriched cases/sample → {len(sample)} cases ({solved_n} solved, {len(sample)-solved_n} open) in {SEED}")
    for s in sample:
        print(f"  {s['crimeNo']}  {s['crimeSubHead'][:26]:26} {s['status']:20} accused={len(s['accused'])}")


if __name__ == "__main__":
    main()
