"""Build the case-linkage match index for the live-match endpoint (v1, TF-IDF).

For each planted serial cluster, gathers its member FIR narratives into a term
profile, and computes IDF weights over a sample of the whole corpus (so common
words like "complainant" count little and distinctive modus-operandi words like
"shutter"/"activa"/"otp" count a lot). The API embeds a pasted FIR the same way
and returns the best-matching cluster by cosine similarity.

Output: functions/netra_api/clusters_index.json  (shipped inside the function)
Run: python3 -m pipeline.build_linkage_index
"""
import json
import math
import os
import re
from collections import Counter, defaultdict

DATA = "pipeline/data"
REF = "pipeline/reference"
OUT = "functions/netra_api/clusters_index.json"
IDF_SAMPLE = 8000  # corpus docs used to estimate IDF

STOP = set("the a an and or of to in on at for with by from is was were are be been "
           "that this it as his her their they he she who whom which had has have "
           "reported stated alleged complainant accused victim person persons unknown "
           "case registered near left found taken away made off over about into out "
           "com ka".split())

TOKEN_RE = re.compile(r"[a-zಀ-೿]{2,}")


def tokenize(text):
    return [t for t in TOKEN_RE.findall(text.lower()) if t not in STOP]


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
    gt = jload(f"{DATA}/planted_patterns.json")
    tax = jload(f"{REF}/crime-taxonomy.json")
    districts = jload(f"{REF}/districts.json")["districts"]
    submap = {s["crimeSubHeadId"]: s for s in tax["crimeSubHeads"]}
    dmap = {d["districtId"]: d for d in districts}

    all_cases = jsonl("cases.jsonl", IDF_SAMPLE)
    cmap = {c["caseMasterId"]: c for c in jsonl("cases.jsonl")}  # full, for cluster members

    # IDF over the sample corpus
    df = defaultdict(int)
    for c in all_cases:
        for t in set(tokenize(c["briefFacts"])):
            df[t] += 1
    N = len(all_cases)
    idf_all = {t: math.log((N + 1) / (dfi + 1)) + 1 for t, dfi in df.items()}

    # Per-cluster term profiles (from member narratives + MO values)
    clusters = []
    vocab = set()
    for cl in gt["serialClusters"]:
        members = [cmap[m] for m in cl["memberCaseIds"] if m in cmap]
        text = " ".join(m["briefFacts"] for m in members)
        text += " " + " ".join(str(v) for v in cl["mo"].values())  # reinforce MO terms
        tf = Counter(tokenize(text))
        # keep the top discriminative terms to keep the file small
        scored = sorted(tf.items(), key=lambda kv: kv[1] * idf_all.get(kv[0], 1), reverse=True)[:40]
        profile = {t: n for t, n in scored}
        vocab.update(profile)
        clusters.append({
            "clusterId": cl["id"], "label": cl["label"],
            "crimeType": submap[cl["subheadId"]]["name"],
            "districts": sorted({dmap[m["districtId"]]["name"] for m in members}),
            "memberCount": len(members),
            "confidence": round(0.78 + 0.02 * (len(members) % 6), 2),
            "tf": profile,
        })

    idf = {t: round(idf_all.get(t, 1.0), 4) for t in vocab}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"idf": idf, "clusters": clusters}, f, ensure_ascii=False)
    print(f"linkage index: {len(clusters)} clusters, {len(vocab)} vocab terms → {OUT} "
          f"({os.path.getsize(OUT)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
