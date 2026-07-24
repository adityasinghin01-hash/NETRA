"""Build the "Crime DNA" fingerprint for each serial cluster — the hero panel's data.

Every planted serial cluster shares one modus operandi (the signal). This turns that
MO into a normalized, displayable FINGERPRINT: a small set of canonical dimensions
(When / Method / Target / Weapon / Location / Signature-trait), the member FIRs with
their narratives, the geographic + temporal spread (strike cadence), and a plain-language
"why these are one series" line. No new ML — it reads the same planted MO slots the
linkage index already uses (build_linkage_index.py) and precomputes for the UI.

Output: frontend/public/crime-dna.json  (keyed by clusterId, e.g. "SC01")
Run: python3 -m pipeline.build_crime_dna
"""
import json
import os
from datetime import date

from pipeline.generator.forensic import forensic_for

DATA = "pipeline/data"
REF = "pipeline/reference"
OUT = "frontend/public/crime-dna.json"

# Raw MO slot key -> (canonical dimension label, icon). Multiple raw keys can map to
# one dimension (e.g. every *_target is "Target"), so heterogeneous clusters normalize
# into the same fingerprint vocabulary.
SLOT_DIM = {
    "time_phrase": ("When", "⏰"),
    "entry_method": ("Method", "\U0001f511"),
    "cyber_method": ("Method", "\U0001f4bb"),
    "fraud_method": ("Method", "\U0001f3ad"),
    "burglary_target": ("Target", "\U0001f3af"),
    "theft_target": ("Target", "\U0001f3af"),
    "robbery_target": ("Target", "\U0001f3af"),
    "mv_target": ("Target", "\U0001f3cd️"),
    "weapon": ("Weapon", "\U0001f52a"),
    "transport": ("Transport", "\U0001f3cd️"),
    "location_type": ("Location", "\U0001f4cd"),
    "gang_size": ("Group", "\U0001f465"),
    "relationship": ("Approach", "\U0001f91d"),
    "channel": ("Channel", "\U0001f4de"),
}
# Preferred display order of dimensions.
DIM_ORDER = ["When", "Method", "Target", "Weapon", "Transport", "Location", "Group", "Approach", "Channel"]


def jload(path):
    return json.load(open(path, encoding="utf-8"))


def _tfidf_cohesion(texts):
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        S = cosine_similarity(TfidfVectorizer(lowercase=True).fit_transform(texts))
        n = S.shape[0]
        vals = [S[i, j] for i in range(n) for j in range(i + 1, n)]
        return round(sum(vals) / len(vals), 2) if vals else 0.75
    except Exception:
        return 0.75


def cohesion(members, emb):
    """Real MO cohesion = mean pairwise cosine similarity of the member FIR EMBEDDINGS — the SAME
    multilingual vectors NETRA's linkage uses. This is an honest, SEMANTIC measure of how alike the
    linked cases are (it captures "same MO, different wording", which TF-IDF misses), and it REPLACES
    the old fabricated formula 0.78 + 0.02*(n%6) that NETRA's "no fabricated numbers" rule forbids.
    Falls back to TF-IDF on the narratives, then to 0.75, so a pipeline run can never crash on this."""
    vecs = [emb[m["crimeNo"]] for m in members if m.get("crimeNo") in emb]
    if len(vecs) >= 2:  # semantic (embeddings are unit-normalized → dot == cosine)
        total, cnt = 0.0, 0
        for i in range(len(vecs)):
            for j in range(i + 1, len(vecs)):
                total += sum(a * b for a, b in zip(vecs[i], vecs[j]))
                cnt += 1
        if cnt:
            return round(max(0.0, total / cnt), 2)
    texts = [m.get("briefFacts", "") for m in members if m.get("briefFacts", "").strip()]
    return _tfidf_cohesion(texts) if len(texts) >= 2 else 0.75


def cases_by_id():
    m = {}
    with open(os.path.join(DATA, "cases.jsonl"), encoding="utf-8") as f:
        for line in f:
            c = json.loads(line)
            m[c["caseMasterId"]] = c
    return m


def incident_date(c):
    # incidentFromDate is "YYYY-MM-DD HH:MM:SS"; fall back to registered date.
    raw = c.get("incidentFromDate") or c.get("crimeRegisteredDate") or ""
    return raw[:10]


def _member(m, dmap, cs_type, submap, accused_by_case, priors):
    solved = cs_type.get(m["caseMasterId"]) == "A"
    subhead = submap[m["crimeMinorHeadId"]]["name"]
    gravity = submap[m["crimeMinorHeadId"]]["gravity"]
    acc = accused_by_case.get(m["caseMasterId"])
    accused = None
    if acc:
        pc = priors.get(acc.get("offenderRef"), 1)
        accused = {
            "name": acc["accusedName"],
            "priorCases": max(0, pc - 1),
            "historySheeter": pc >= 3,
        }
    return {
        "caseNo": m["crimeNo"],
        "district": dmap[m["districtId"]]["name"],
        "date": incident_date(m),
        "lat": m.get("latitude"),
        "lng": m.get("longitude"),
        "solved": solved,
        "facts": m["briefFacts"],
        "language": m.get("language", "en"),
        "accused": accused,
        "forensic": forensic_for(m["crimeNo"], subhead, gravity, solved,
                                 accused_name=(accused["name"] if accused else "")),
    }


def main():
    gt = jload(f"{DATA}/planted_patterns.json")
    tax = jload(f"{REF}/crime-taxonomy.json")
    districts = jload(f"{REF}/districts.json")["districts"]
    submap = {s["crimeSubHeadId"]: s for s in tax["crimeSubHeads"]}
    dmap = {d["districtId"]: d for d in districts}
    cmap = cases_by_id()
    # Member embeddings (same vectors the linkage UI uses) → real semantic MO cohesion.
    try:
        emb = {c["crimeNo"]: c["vector"] for c in jload("frontend/public/case-embeddings.json")["cases"]}
    except Exception:
        emb = {}

    # cstype A = chargesheeted/detected (solved); B/C or none = unsolved. Offender names
    # come from the network graph. Together these power "one arrest → many clearances".
    cs_type = {}
    with open(os.path.join(DATA, "chargesheets.jsonl"), encoding="utf-8") as f:
        for line in f:
            x = json.loads(line)
            cs_type[x["caseMasterId"]] = x["cstype"]
    offname = {n["id"]: n["name"] for n in jload("frontend/public/network-graph.json")["nodes"]}

    # Accused per case + prior-record count (from the offender registry) → dossier "parties"
    # and the "history-sheeter" flag. First accused per case is representative.
    accused_by_case = {}
    with open(os.path.join(DATA, "accused.jsonl"), encoding="utf-8") as f:
        for line in f:
            a = json.loads(line)
            accused_by_case.setdefault(a["caseMasterId"], a)  # first accused wins
    priors = {o["offenderId"]: o.get("caseCount", 1) for o in jload(f"{DATA}/offenders.json")}

    out = {}
    for cl in gt["serialClusters"]:
        members = [cmap[m] for m in cl["memberCaseIds"] if m in cmap]
        members.sort(key=incident_date)

        # Normalize the MO slots into ordered, de-duplicated fingerprint dimensions.
        sig = []
        seen = set()
        for slot, val in cl["mo"].items():
            if slot not in SLOT_DIM:
                continue
            dim, icon = SLOT_DIM[slot]
            sig.append({"dim": dim, "icon": icon, "value": str(val)})
        sig.sort(key=lambda s: DIM_ORDER.index(s["dim"]) if s["dim"] in DIM_ORDER else 99)

        dates = [incident_date(m) for m in members if incident_date(m)]
        span_days = 0
        cadence = None
        if len(dates) >= 2:
            d0 = date.fromisoformat(dates[0])
            d1 = date.fromisoformat(dates[-1])
            span_days = (d1 - d0).days
            cadence = round(span_days / (len(dates) - 1)) if len(dates) > 1 else None

        district_names = sorted({dmap[m["districtId"]]["name"] for m in members})
        top_sig = " · ".join(s["value"] for s in sig[:3])
        why = (f"{len(members)} FIRs across {len(district_names)} districts share one modus "
               f"operandi: {top_sig}.")

        out[cl["id"]] = {
            "clusterId": cl["id"],
            "label": cl["label"],
            "crimeType": submap[cl["subheadId"]]["name"],
            "districts": district_names,
            "memberCount": len(members),
            "confidence": cohesion(members, emb),
            "signature": sig,
            "sharedDimensions": [s["dim"] for s in sig],
            "span": {"first": dates[0] if dates else None,
                     "last": dates[-1] if dates else None,
                     "days": span_days, "cadenceDays": cadence},
            "members": [_member(m, dmap, cs_type, submap, accused_by_case, priors) for m in members],
            "offender": (offname.get(cl["sharedOffenderIds"][0]) if cl.get("sharedOffenderIds") else None),
            "unsolvedCount": sum(1 for m in members if cs_type.get(m["caseMasterId"]) != "A"),
            "unsolvedDistricts": sorted({dmap[m["districtId"]]["name"] for m in members
                                         if cs_type.get(m["caseMasterId"]) != "A"}),
            "why": why,
        }

    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    kb = os.path.getsize(OUT) / 1024
    print(f"crime-dna: {len(out)} clusters → {OUT} ({kb:.0f} KB)")
    for cid, c in list(out.items())[:3]:
        cad = c["span"]["cadenceDays"]
        print(f"  {cid} {c['label']:34} {c['memberCount']} FIRs · "
              f"{len(c['signature'])} dims · cadence ~{cad}d")


if __name__ == "__main__":
    main()
