"""NETRA synthetic FIR dataset generator.

Produces a realistic, factually-consistent synthetic crime dataset on the KSP
FIR schema. Deterministic (fixed seed) and reproducible. Streams normalized
tables as JSONL into pipeline/data/, ready for tiered import into Catalyst
Data Store.

Run:  python3 -m pipeline.generator.generate      (from repo root)
"""
import json
import math
import os
import random
from datetime import date, timedelta, datetime

from pipeline.generator import config as C
from pipeline.generator import narratives as N
from pipeline.generator import planted as P

REF = "pipeline/reference"
STATE_ID = 1  # Karnataka


def load(name):
    with open(os.path.join(REF, name), encoding="utf-8") as f:
        return json.load(f)


def wsample(rng, items, weights):
    return rng.choices(items, weights=weights, k=1)[0]


def rand_date(rng, start, end):
    days = (end - start).days
    return start + timedelta(days=rng.randint(0, days))


def weighted_date(rng):
    """Sample a registration date with weekend + festival-season uplift."""
    while True:
        d = rand_date(rng, C.START_DATE, C.END_DATE)
        w = 1.0
        if d.weekday() >= 4:            # Fri/Sat/Sun
            w *= C.WEEKEND_UPLIFT
        w *= C.FESTIVAL_MONTHS.get(d.month, 1.0)
        if rng.random() <= w / 1.3:     # accept/reject to shape the distribution
            return d


HOUR_BY_PHRASE = {
    "late at night": (22, 27), "past midnight": (24, 28), "around midnight": (23, 26),
    "in the early hours": (3, 6), "at dawn": (4, 7),
    "during the afternoon": (13, 17), "during the noon hours": (11, 15),
    "in the evening": (18, 22),
}


def incident_datetime(rng, reg_date, mo):
    """Incident precedes registration by a realistic reporting delay."""
    delay = rng.choices([0, 1, 2, 3, 7, 14], weights=[40, 25, 12, 10, 8, 5])[0]
    inc_date = reg_date - timedelta(days=delay)
    tp = mo.get("time_phrase")
    lo, hi = HOUR_BY_PHRASE.get(tp, (8, 20))
    hour = rng.randrange(lo, hi) % 24
    return datetime(inc_date.year, inc_date.month, inc_date.day, hour, rng.randrange(0, 60))


def person_name(rng, names, gender):
    first = rng.choice(names["firstNamesMale"] if gender == "M" else names["firstNamesFemale"])
    return f"{first} {rng.choice(names['surnames'])}"


def jitter_coord(rng, lat, lng, spread):
    return round(lat + rng.gauss(0, spread), 6), round(lng + rng.gauss(0, spread), 6)


def main():
    rng = random.Random(C.SEED)
    os.makedirs(C.OUTPUT_DIR, exist_ok=True)

    districts = load("districts.json")["districts"]
    lookups = load("lookups.json")
    taxonomy = load("crime-taxonomy.json")
    names = load("names.json")

    dmap = {d["districtId"]: d for d in districts}
    subheads = taxonomy["crimeSubHeads"]
    submap = {s["crimeSubHeadId"]: s for s in subheads}
    cats = lookups["caseCategories"]
    catmap = {c["lookupValue"]: c for c in cats}
    gravmap = {g["lookupValue"]: g["gravityOffenceId"] for g in lookups["gravityOffence"]}

    # ---- Build Units (stations + district offices + state HQ) ----
    units, employees, courts = [], [], []
    station_by_district = {}
    unit_id = 1
    emp_id = 1
    # State HQ
    units.append({"unitId": unit_id, "unitCode": "0000", "unitName": "State Police Headquarters",
                  "typeId": 1, "parentUnit": None, "stateId": STATE_ID, "districtId": None,
                  "latitude": 12.9791, "longitude": 77.5913, "active": 1})
    hq_id = unit_id
    unit_id += 1

    for d in districts:
        did = d["districtId"]
        # District office
        dist_office_id = unit_id
        units.append({"unitId": unit_id, "unitCode": f"D{did:03d}",
                      "unitName": f"{d['name']} District Police Office", "typeId": 2,
                      "parentUnit": hq_id, "stateId": STATE_ID, "districtId": did,
                      "latitude": d["lat"], "longitude": d["lng"], "active": 1})
        unit_id += 1
        # Court (one per district)
        courts.append({"courtId": did, "courtName": f"{d['name']} District & Sessions Court",
                       "districtId": did, "stateId": STATE_ID, "active": 1})
        # SP for the district
        sp_gender = "M" if rng.random() < 0.85 else "F"
        employees.append({"employeeId": emp_id, "districtId": did, "unitId": dist_office_id,
                          "rankId": 3, "designationId": 3, "kgid": f"KA{emp_id:06d}",
                          "firstName": person_name(rng, names, sp_gender), "genderId": 1 if sp_gender == "M" else 2,
                          "appointmentDate": f"{rng.randint(2000, 2015)}-06-01"})
        district_sp = emp_id
        emp_id += 1
        # Stations from real localities
        locs = names["localitiesByDistrict"].get(str(did)) or names["genericLocalities"]
        stations = []
        for i, loc in enumerate(locs, start=1):
            slat, slng = jitter_coord(rng, d["lat"], d["lng"], 0.03 if d["region"] == "Bengaluru" else 0.08)
            st = {"unitId": unit_id, "unitCode": f"{i:04d}", "unitName": f"{loc} Police Station",
                  "typeId": 5, "parentUnit": dist_office_id, "stateId": STATE_ID, "districtId": did,
                  "latitude": slat, "longitude": slng, "active": 1}
            units.append(st)
            # Officers for the station: 1 Inspector (SHO), 2 SIs, 1 ASI
            station_officers = []
            for rank_id, desig in [(5, 5), (6, 6), (6, 6), (7, 7)]:
                g = "M" if rng.random() < 0.9 else "F"
                employees.append({"employeeId": emp_id, "districtId": did, "unitId": unit_id,
                                  "rankId": rank_id, "designationId": desig, "kgid": f"KA{emp_id:06d}",
                                  "firstName": person_name(rng, names, g), "genderId": 1 if g == "M" else 2,
                                  "appointmentDate": f"{rng.randint(2005, 2022)}-06-01"})
                station_officers.append(emp_id)
                emp_id += 1
            stations.append({"unit": st, "officers": station_officers, "sp": district_sp})
            unit_id += 1
        station_by_district[did] = stations

    # ---- Repeat-offender pool ----
    offenders = []
    for oid in range(1, C.N_REPEAT_OFFENDERS + 1):
        g = "M" if rng.random() < 0.93 else "F"
        offenders.append({"offenderId": oid, "canonicalName": person_name(rng, names, g),
                          "genderId": 1 if g == "M" else 2, "firstSeenYear": None, "caseCount": 0})

    # ---- Weighted samplers ----
    dist_ids = [d["districtId"] for d in districts]
    dist_w = [d["weight"] for d in districts]
    sub_ids = [s["crimeSubHeadId"] for s in subheads]
    sub_w = [s["weight"] for s in subheads]

    # ---- Build case specs: planted first, then random fill ----
    specs = []            # each: dict(districtId, subheadId, reg_date, mo_override, cluster, offender_ids)
    ground_truth = {"serialClusters": [], "bursts": []}

    def cluster_offenders(k):
        return [rng.randint(1, C.N_REPEAT_OFFENDERS) for _ in range(k)]

    for cl in P.SERIAL_CLUSTERS:
        shared = cluster_offenders(rng.choice([1, 2]))
        members = []
        for _ in range(cl["n"]):
            did = rng.choice(cl["districts"])
            reg = cl["start"] + timedelta(days=rng.randint(0, cl["days"]))
            reg = min(reg, C.END_DATE)
            specs.append({"districtId": did, "subheadId": cl["subheadId"], "reg_date": reg,
                          "mo_override": cl["mo"], "cluster": cl["id"], "offender_ids": shared})
            members.append(len(specs) - 1)   # temp index; resolved to caseMasterId later
        ground_truth["serialClusters"].append({"id": cl["id"], "label": cl["label"],
                                                "subheadId": cl["subheadId"], "districts": cl["districts"],
                                                "mo": cl["mo"], "sharedOffenderIds": shared,
                                                "_spec_idx": members})

    for b in P.BURSTS:
        members = []
        for _ in range(b["count"]):
            reg = b["start"] + timedelta(days=rng.randint(0, b["days"]))
            reg = min(reg, C.END_DATE)
            specs.append({"districtId": b["districtId"], "subheadId": b["subheadId"], "reg_date": reg,
                          "mo_override": None, "cluster": None, "offender_ids": None})
            members.append(len(specs) - 1)
        ground_truth["bursts"].append({"id": b["id"], "note": b["note"], "districtId": b["districtId"],
                                       "subheadId": b["subheadId"], "_spec_idx": members})

    # Random fill
    while len(specs) < C.N_CASES:
        did = wsample(rng, dist_ids, dist_w)
        sid = wsample(rng, sub_ids, sub_w)
        specs.append({"districtId": did, "subheadId": sid, "reg_date": weighted_date(rng),
                      "mo_override": None, "cluster": None, "offender_ids": None})

    # ---- Open output writers ----
    def writer(name):
        return open(os.path.join(C.OUTPUT_DIR, name), "w", encoding="utf-8")

    f_cases = writer("cases.jsonl")
    f_comp = writer("complainants.jsonl")
    f_vic = writer("victims.jsonl")
    f_acc = writer("accused.jsonl")
    f_as = writer("act_sections.jsonl")
    f_arr = writer("arrests.jsonl")
    f_cs = writer("chargesheets.jsonl")

    def emit(fh, obj):
        fh.write(json.dumps(obj, ensure_ascii=False) + "\n")

    # CrimeNo serial counters keyed by (unitCode, categoryDigit, year)
    serial = {}
    ids = {"case": 0, "comp": 0, "vic": 0, "acc": 0, "arr": 0, "cs": 0}
    spec_to_caseid = {}
    kn_count = 0
    status_counter = {}
    cstype_counter = {"A": 0, "B": 0, "C": 0}

    STATUSES = lookups["caseStatus"]

    def choose_status(rng, subhead, reg_date):
        # Recent cases skew open; property/cyber skew undetected; body/women skew chargesheeted.
        fam = N.FAMILY_BY_SUBHEAD[subhead["crimeSubHeadId"]]
        recent = (C.END_DATE - reg_date).days < 120
        if recent and rng.random() < 0.6:
            return "Under Investigation"
        base = {s["caseStatusName"]: s["weight"] for s in STATUSES}
        if fam in ("theft", "burglary", "mv_theft", "cyber", "cbt"):
            base["Closed - Undetected"] *= 2.4          # hard-to-detect property/cyber crime
            base["Charge Sheeted"] *= 0.7
        if fam in ("violence", "woman_assault", "cruelty", "restricted", "dowry"):
            base["Charge Sheeted"] *= 1.5               # known-accused offences
            base["Closed - Undetected"] *= 0.3
        names_, weights_ = list(base.keys()), list(base.values())
        return wsample(rng, names_, weights_)

    for idx, sp in enumerate(specs):
        did = sp["districtId"]
        d = dmap[did]
        subhead = submap[sp["subheadId"]]
        fam = N.FAMILY_BY_SUBHEAD[subhead["crimeSubHeadId"]]
        reg_date = sp["reg_date"]
        station = rng.choice(station_by_district[did])
        st_unit = station["unit"]

        # MO + narrative
        mo = N.pick_mo(subhead["crimeSubHeadId"], rng)
        if sp["mo_override"]:
            mo.update(sp["mo_override"])
        kannada = rng.random() < C.KANNADA_FRACTION
        brief = N.render(subhead["crimeSubHeadId"], mo, kannada, rng)
        if kannada:
            kn_count += 1

        # Category (UDR sub-heads are UDR category; else weighted FIR/PAR/ZeroFIR)
        if subhead.get("caseCategory") == "UDR":
            cat = catmap["UDR"]
        else:
            cat = wsample(rng, [c for c in cats if c["lookupValue"] != "UDR"],
                          [c["weight"] for c in cats if c["lookupValue"] != "UDR"])

        year = reg_date.year
        skey = (st_unit["unitCode"], cat["crimeNoDigit"], year)
        serial[skey] = serial.get(skey, 0) + 1
        seq = serial[skey]
        crime_no = f"{cat['crimeNoDigit']}{d['districtCode']}{st_unit['unitCode']}{year}{seq:05d}"
        case_no = f"{year}{seq:05d}"

        # Sections: IPC before BNS cutoff, BNS on/after
        use_bns = reg_date >= C.BNS_CUTOFF
        sections = subhead["bns"] if use_bns else subhead["ipc"]
        act_code = "BNS" if use_bns and subhead["actCode"] == "IPC" else subhead["actCode"]

        # Coordinates (some intentionally missing → data-quality panel)
        if rng.random() < C.GEOCODED_FRACTION:
            spread = 0.012 if d["region"] == "Bengaluru" else 0.03
            lat, lng = jitter_coord(rng, st_unit["latitude"], st_unit["longitude"], spread)
        else:
            lat, lng = None, None

        inc_dt = incident_datetime(rng, reg_date, mo)
        officer = rng.choice(station["officers"])
        io = rng.choice(station["officers"])
        status = choose_status(rng, subhead, reg_date)
        status_id = next(s["caseStatusId"] for s in STATUSES if s["caseStatusName"] == status)
        status_counter[status] = status_counter.get(status, 0) + 1

        ids["case"] += 1
        case_id = ids["case"]
        spec_to_caseid[idx] = case_id

        emit(f_cases, {
            "caseMasterId": case_id, "crimeNo": crime_no, "caseNo": case_no,
            "crimeRegisteredDate": reg_date.isoformat(),
            "incidentFromDate": inc_dt.isoformat(sep=" "),
            "incidentToDate": inc_dt.isoformat(sep=" "),
            "infoReceivedPSDate": reg_date.isoformat(),
            "latitude": lat, "longitude": lng, "briefFacts": brief,
            "policePersonId": officer, "policeStationId": st_unit["unitId"], "districtId": did,
            "caseCategoryId": cat["caseCategoryId"], "gravityOffenceId": gravmap[subhead["gravity"]],
            "crimeMajorHeadId": subhead["crimeHeadId"], "crimeMinorHeadId": subhead["crimeSubHeadId"],
            "caseStatusId": status_id, "courtId": did, "language": "kn" if kannada else "en",
            "clusterRef": sp["cluster"],
        })

        # Act-sections
        for oi, sec in enumerate(sections, start=1):
            ids_key = ids  # noqa
            emit(f_as, {"caseMasterId": case_id, "actId": act_code, "sectionId": sec,
                        "actOrderId": 1, "sectionOrderId": oi})

        # Complainant (1) — demographics populated INDEPENDENTLY of crime (ethics)
        cg = rng.choice(["M", "F"])
        ids["comp"] += 1
        emit(f_comp, {"complainantId": ids["comp"], "caseMasterId": case_id,
                      "complainantName": person_name(rng, names, cg),
                      "ageYear": rng.randint(18, 70),
                      "occupationId": wsample(rng, [o["occupationId"] for o in names["occupations"]],
                                              [o["weight"] for o in names["occupations"]]),
                      "religionId": wsample(rng, [r["religionId"] for r in names["religions"]],
                                            [r["weight"] for r in names["religions"]]),
                      "casteId": wsample(rng, [c["casteId"] for c in names["castes"]],
                                         [c["weight"] for c in names["castes"]]),
                      "genderId": 1 if cg == "M" else 2})

        # Victims (body / women / children / UDR crimes have a distinct victim)
        if fam in ("violence", "kidnap", "woman_assault", "cruelty", "restricted", "dowry",
                   "udr_accident", "udr_suicide", "robbery"):
            vg = "F" if fam in ("woman_assault", "cruelty", "dowry", "restricted") else rng.choice(["M", "F"])
            ids["vic"] += 1
            emit(f_vic, {"victimMasterId": ids["vic"], "caseMasterId": case_id,
                         "victimName": person_name(rng, names, vg),
                         "ageYear": rng.randint(5, 75) if fam not in ("dowry",) else rng.randint(19, 35),
                         "genderId": 1 if vg == "M" else 2, "victimPolice": "0"})

        # Accused: undetected/open property crime often "unknown"; else named, sometimes repeat offenders
        undetected = status == "Closed - Undetected"
        if undetected and fam in ("theft", "burglary", "mv_theft", "cyber"):
            n_acc = 0  # accused not traced
        else:
            n_acc = rng.choices([0, 1, 2, 3], weights=[10, 55, 25, 10])[0]
        case_accused = []
        for ai in range(n_acc):
            use_pool = sp["offender_ids"] is not None or rng.random() < C.REPEAT_OFFENDER_CASE_FRACTION
            if sp["offender_ids"]:
                off = offenders[sp["offender_ids"][ai % len(sp["offender_ids"])] - 1]
            elif use_pool:
                off = offenders[rng.randint(0, C.N_REPEAT_OFFENDERS - 1)]
            else:
                off = None
            if off is not None:
                off["caseCount"] += 1
                if off["firstSeenYear"] is None or year < off["firstSeenYear"]:
                    off["firstSeenYear"] = year
                aname, ag = off["canonicalName"], off["genderId"]
            else:
                agc = "M" if rng.random() < 0.9 else "F"
                aname, ag = person_name(rng, names, agc), (1 if agc == "M" else 2)
            ids["acc"] += 1
            emit(f_acc, {"accusedMasterId": ids["acc"], "caseMasterId": case_id,
                         "accusedName": aname, "ageYear": rng.randint(18, 55), "genderId": ag,
                         "personId": f"A{ai + 1}", "offenderRef": off["offenderId"] if off else None})
            case_accused.append((ids["acc"], off))

        # Chargesheet + arrests for concluded cases
        if status in ("Charge Sheeted", "Pending Trial", "Disposed"):
            cstype = "A"
        elif status == "Closed - Undetected":
            cstype = "C"
        elif status == "Closed - False":
            cstype = "B"
        else:
            cstype = None
        if cstype:
            cstype_counter[cstype] += 1
            ids["cs"] += 1
            cs_date = reg_date + timedelta(days=rng.randint(20, 180))
            cs_date = min(cs_date, C.END_DATE)
            emit(f_cs, {"csid": ids["cs"], "caseMasterId": case_id, "csdate": cs_date.isoformat(),
                        "cstype": cstype, "policePersonId": io})
            if cstype == "A":
                for acc_id, off in case_accused:
                    if rng.random() < 0.85:
                        ids["arr"] += 1
                        adate = reg_date + timedelta(days=rng.randint(0, 90))
                        adate = min(adate, C.END_DATE)
                        emit(f_arr, {"arrestSurrenderId": ids["arr"], "caseMasterId": case_id,
                                     "accusedMasterId": acc_id, "arrestSurrenderTypeId": 1,
                                     "arrestSurrenderDate": adate.isoformat(),
                                     "arrestSurrenderStateId": STATE_ID, "arrestSurrenderDistrictId": did,
                                     "policeStationId": st_unit["unitId"], "ioId": io, "courtId": did})

    for fh in (f_cases, f_comp, f_vic, f_acc, f_as, f_arr, f_cs):
        fh.close()

    # Resolve ground-truth spec indices to caseMasterIds
    for cl in ground_truth["serialClusters"]:
        cl["memberCaseIds"] = [spec_to_caseid[i] for i in cl.pop("_spec_idx")]
    for b in ground_truth["bursts"]:
        b["memberCaseIds"] = [spec_to_caseid[i] for i in b.pop("_spec_idx")]

    # Write reference-derived tables + offenders + ground truth
    with writer("units.jsonl") as f:
        for u in units:
            emit(f, u)
    with writer("employees.jsonl") as f:
        for e in employees:
            emit(f, e)
    with open(os.path.join(C.OUTPUT_DIR, "courts.json"), "w", encoding="utf-8") as f:
        json.dump(courts, f, ensure_ascii=False, indent=1)
    with open(os.path.join(C.OUTPUT_DIR, "offenders.json"), "w", encoding="utf-8") as f:
        json.dump(offenders, f, ensure_ascii=False, indent=1)
    with open(os.path.join(C.OUTPUT_DIR, "planted_patterns.json"), "w", encoding="utf-8") as f:
        json.dump(ground_truth, f, ensure_ascii=False, indent=1)

    # Summary
    print("=" * 60)
    print("NETRA dataset generated")
    print("=" * 60)
    print(f"Cases:         {ids['case']:>8,}")
    print(f"Complainants:  {ids['comp']:>8,}")
    print(f"Victims:       {ids['vic']:>8,}")
    print(f"Accused:       {ids['acc']:>8,}")
    print(f"Arrests:       {ids['arr']:>8,}")
    print(f"Chargesheets:  {ids['cs']:>8,}")
    print(f"Units:         {len(units):>8,}  Employees: {len(employees):,}  Courts: {len(courts)}")
    print(f"Offenders:     {C.N_REPEAT_OFFENDERS:>8,}  (repeat pool)")
    print(f"Kannada cases: {kn_count:>8,}  ({100*kn_count/ids['case']:.1f}%)")
    tot_cs = sum(cstype_counter.values()) or 1
    print(f"Chargesheet mix: A={cstype_counter['A']} ({100*cstype_counter['A']/tot_cs:.0f}%)  "
          f"B={cstype_counter['B']} ({100*cstype_counter['B']/tot_cs:.0f}%)  "
          f"C={cstype_counter['C']} ({100*cstype_counter['C']/tot_cs:.0f}%)")
    print(f"Serial clusters: {len(ground_truth['serialClusters'])}  Bursts: {len(ground_truth['bursts'])}")
    print("Output → pipeline/data/")


if __name__ == "__main__":
    main()
