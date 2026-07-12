"""Validate the generated NETRA dataset for correctness and realism.

Run: python3 -m pipeline.validate
Exits non-zero if any hard check fails.
"""
import json
import os
from collections import Counter, defaultdict
from datetime import date

DATA = "pipeline/data"
REF = "pipeline/reference"
BNS_CUTOFF = date(2024, 7, 1)

fails, warns = [], []


def check(cond, msg):
    (print(f"  ✓ {msg}") if cond else fails.append(msg))
    if not cond:
        print(f"  ✗ FAIL: {msg}")


def warn(cond, msg):
    if not cond:
        warns.append(msg)
        print(f"  ! WARN: {msg}")
    else:
        print(f"  ✓ {msg}")


def load_jsonl(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return [json.loads(l) for l in f]


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


print("Loading…")
cases = load_jsonl("cases.jsonl")
comps = load_jsonl("complainants.jsonl")
vics = load_jsonl("victims.jsonl")
acc = load_jsonl("accused.jsonl")
acts = load_jsonl("act_sections.jsonl")
arrests = load_jsonl("arrests.jsonl")
cs = load_jsonl("chargesheets.jsonl")
units = load_jsonl("units.jsonl")
emps = load_jsonl("employees.jsonl")
offenders = load_json(f"{DATA}/offenders.json")
gt = load_json(f"{DATA}/planted_patterns.json")
districts = load_json(f"{REF}/districts.json")["districts"]
tax = load_json(f"{REF}/crime-taxonomy.json")

dmap = {d["districtId"]: d for d in districts}
submap = {s["crimeSubHeadId"]: s for s in tax["crimeSubHeads"]}
unit_ids = {u["unitId"] for u in units}
emp_ids = {e["employeeId"] for e in emps}
case_ids = {c["caseMasterId"] for c in cases}

print(f"\n[1] Volume & integrity  (cases={len(cases):,})")
check(len(cases) == 50000, "exactly 50,000 cases")
check(len({c["caseMasterId"] for c in cases}) == len(cases), "case IDs unique")
check(len({c["crimeNo"] for c in cases}) == len(cases), "CrimeNo unique")
check(all(c["policeStationId"] in unit_ids for c in cases), "every case → valid station")
check(all(c["policePersonId"] in emp_ids for c in cases), "every case → valid officer")
check(all(x["caseMasterId"] in case_ids for x in comps), "complainants → valid cases")
check(all(x["caseMasterId"] in case_ids for x in acc), "accused → valid cases")
check(all(x["caseMasterId"] in case_ids for x in arrests), "arrests → valid cases")

print("\n[2] CrimeNo format  (1 cat + 4 district + 4 station + 4 year + 5 serial = 18)")
bad_fmt = [c["crimeNo"] for c in cases if not (len(c["crimeNo"]) == 18 and c["crimeNo"].isdigit())][:3]
check(not bad_fmt, f"all CrimeNo are 18 digits (sample bad: {bad_fmt})")
# district segment matches the case's district code
seg_ok = all(c["crimeNo"][1:5] == dmap[c["districtId"]]["districtCode"] for c in cases)
check(seg_ok, "CrimeNo district segment matches districtCode")
# year segment matches registration year
yr_ok = all(c["crimeNo"][9:13] == c["crimeRegisteredDate"][:4] for c in cases)
check(yr_ok, "CrimeNo year segment matches registration year")
# category digit matches caseCategoryId mapping (FIR=1,UDR=3,PAR=4,ZeroFIR=8)
catdig = {1: "1", 2: "3", 3: "4", 4: "8"}
cat_ok = all(c["crimeNo"][0] == catdig[c["caseCategoryId"]] for c in cases)
check(cat_ok, "CrimeNo category digit matches case category")

print("\n[3] Geography")
present = [c for c in cases if c["latitude"] is not None]
frac = len(present) / len(cases)
warn(0.90 <= frac <= 0.97, f"geocoded fraction = {frac:.1%} (target ~94%, rest exercise data-quality panel)")
oob = [c["caseMasterId"] for c in present
       if not (11.5 <= c["latitude"] <= 18.6 and 73.8 <= c["longitude"] <= 78.8)][:5]
check(not oob, f"all coordinates within Karnataka bounds (sample oob: {oob})")

print("\n[4] IPC → BNS transition (1 July 2024)")
act_by_case = defaultdict(list)
for a in acts:
    act_by_case[a["caseMasterId"]].append(a)
ipc_after = 0
bns_before = 0
for c in cases:
    reg = date.fromisoformat(c["crimeRegisteredDate"])
    sub = submap[c["crimeMinorHeadId"]]
    if sub["actCode"] != "IPC":
        continue  # special acts (NDPS/POCSO/IT) unaffected
    secs = [a["sectionId"] for a in act_by_case[c["caseMasterId"]]]
    is_bns = secs == sub["bns"]
    is_ipc = secs == sub["ipc"]
    if reg >= BNS_CUTOFF and is_ipc:
        ipc_after += 1
    if reg < BNS_CUTOFF and is_bns:
        bns_before += 1
check(ipc_after == 0, f"no IPC sections used on/after 1 Jul 2024 (violations: {ipc_after})")
check(bns_before == 0, f"no BNS sections used before 1 Jul 2024 (violations: {bns_before})")

print("\n[5] Language / Kannada")
kn = [c for c in cases if c["language"] == "kn"]
warn(0.10 <= len(kn) / len(cases) <= 0.25, f"Kannada share = {len(kn)/len(cases):.1%}")
# Kannada cases must actually contain Kannada script (Unicode block U+0C80–U+0CFF)
def has_kannada(s):
    return any("ಀ" <= ch <= "೿" for ch in s)
kn_ok = all(has_kannada(c["briefFacts"]) for c in kn)
check(kn_ok, "every 'kn' case contains Kannada script")
en_clean = all(not has_kannada(c["briefFacts"]) for c in cases if c["language"] == "en")
check(en_clean, "no Kannada script leaks into 'en' cases")

print("\n[6] Dates & temporal")
regs = [date.fromisoformat(c["crimeRegisteredDate"]) for c in cases]
check(min(regs) >= date(2021, 1, 1) and max(regs) <= date(2026, 6, 30), "all dates within 2021-01-01 … 2026-06-30")
# incident precedes/equals registration
inc_ok = all(c["incidentFromDate"][:10] <= c["crimeRegisteredDate"] for c in cases)
check(inc_ok, "incident date ≤ registration date for all cases")

print("\n[7] Gravity & outcomes")
grav_ok = all(
    (c["gravityOffenceId"] == 1) == (submap[c["crimeMinorHeadId"]]["gravity"] == "Heinous")
    for c in cases)
check(grav_ok, "gravity flag matches crime sub-head classification")
cst = Counter(x["cstype"] for x in cs)
warn(cst["A"] > cst["C"] > cst["B"], f"chargesheet mix realistic A>C>B: A={cst['A']} C={cst['C']} B={cst['B']}")

print("\n[8] Distribution realism")
by_dist = Counter(c["districtId"] for c in cases)
top = by_dist.most_common(1)[0]
warn(dmap[top[0]]["name"] == "Bengaluru Urban", f"top district = {dmap[top[0]]['name']} ({top[1]:,} cases)")
by_head = Counter(submap[c["crimeMinorHeadId"]]["name"] for c in cases)
warn(by_head.most_common(1)[0][0] == "Theft (Ordinary)", f"top crime = {by_head.most_common(1)[0]}")

print("\n[9] Planted serial clusters (linkage ground truth)")
for cl in gt["serialClusters"]:
    members = [c for c in cases if c["caseMasterId"] in set(cl["memberCaseIds"])]
    got_districts = {c["districtId"] for c in members}
    same_sub = all(c["crimeMinorHeadId"] == cl["subheadId"] for c in members)
    multi = len(got_districts) >= 2
    ok = len(members) == len(cl["memberCaseIds"]) and same_sub and multi
    check(ok, f"{cl['id']} {cl['label']}: {len(members)} cases across {len(got_districts)} districts")
# member narratives should be varied (not identical) despite shared MO
sample_cl = gt["serialClusters"][0]
briefs = [next(c["briefFacts"] for c in cases if c["caseMasterId"] == mid) for mid in sample_cl["memberCaseIds"]]
warn(len(set(briefs)) >= max(2, len(briefs) // 2), f"{sample_cl['id']} narratives varied: {len(set(briefs))}/{len(briefs)} unique")

print("\n[10] Offender network")
linked = [a for a in acc if a.get("offenderRef")]
warn(len(linked) > 3000, f"accused linked to repeat-offender registry: {len(linked):,}")
top_off = max(offenders, key=lambda o: o["caseCount"])
warn(top_off["caseCount"] >= 5, f"top repeat offender appears in {top_off['caseCount']} cases")

print("\n" + "=" * 60)
if fails:
    print(f"❌ {len(fails)} HARD CHECK(S) FAILED:")
    for m in fails:
        print(f"   - {m}")
else:
    print("✅ ALL HARD CHECKS PASSED")
if warns:
    print(f"⚠️  {len(warns)} warning(s) (soft/realism):")
    for m in warns:
        print(f"   - {m}")
print("=" * 60)
raise SystemExit(1 if fails else 0)
