"""NETRA blind-test harness for case linkage.

Aditya (NOT the AI's builder) authors 5 secret serial-crime patterns in
pipeline/blindtest/patterns.txt — several short FIR narratives each, same modus
operandi, varied wording. This harness mixes them with 1,500 real distractor FIRs
and, for each pattern, takes one FIR as a "new incoming report" and checks whether its
top nearest-neighbours are its own siblings (not distractors). The builder never sees
the patterns — Aditya shares only the final numbers.

METHOD NOTE (honesty): this harness scores with TF-IDF cosine — the same method as the
BACKEND /match fallback, NOT the primary transformer-embedding linkage the UI uses. So
these numbers are a conservative, model-agnostic check that the DATA has recoverable
signal; they are not a measurement of the deployed embedding model. Any claim citing
them (e.g. "blind-validated 5/5") must say "TF-IDF blind test", not imply the semantic
model was validated.

Usage:
  python3 -m pipeline.blindtest --calibrate   # sanity check on KNOWN patterns
  python3 -m pipeline.blindtest               # the real blind test (Aditya runs this)
"""
import json
import os
import random
import sys
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

DATA = "pipeline/data"
PATTERNS = "pipeline/blindtest/patterns.txt"
N_DISTRACTORS = 1500
TOKEN = r"(?u)[a-zಀ-೿]{2,}"


def distractors(n):
    out = []
    with open(f"{DATA}/cases.jsonl", encoding="utf-8") as f:
        for line in f:
            out.append(json.loads(line)["briefFacts"])
            if len(out) >= n * 6:
                break
    random.seed(1)
    return random.sample(out, min(n, len(out)))


def run(groups, label):
    groups = [g for g in groups if len(g) >= 2]
    flat, owner = [], []
    for gi, g in enumerate(groups):
        for t in g:
            flat.append(t); owner.append(gi)
    dist = distractors(N_DISTRACTORS)
    texts = flat + dist
    X = TfidfVectorizer(lowercase=True, token_pattern=TOKEN).fit_transform(texts)
    S = cosine_similarity(X[: len(flat)], X)

    recovered, precs = 0, []
    for gi in range(len(groups)):
        idxs = [i for i, o in enumerate(owner) if o == gi]
        q, k = idxs[0], len(idxs) - 1
        order = [j for j in np.argsort(-S[q]) if j != q][:k]
        same = sum(1 for j in order if j < len(flat) and owner[j] == gi)
        p = same / k
        precs.append(p)
        if p >= 0.5:
            recovered += 1
    n = len(groups)
    print(f"\n=== BLIND TEST RESULT ({label}) ===")
    print(f"  secret patterns planted : {n}")
    print(f"  patterns RECOVERED      : {recovered} / {n}")
    print(f"  avg precision@k         : {round(sum(precs) / n, 2)}")
    print(f"  distractor FIRs mixed in: {len(dist):,}")
    print("  method                  : TF-IDF cosine (data-separability check, not the embedding model)")
    print("\n→ Share ONLY these numbers with Claude. Keep patterns.txt private.")
    print("  When citing, say 'TF-IDF blind test' — don't imply the semantic model was validated.")


def parse_patterns(path):
    groups, cur = [], []
    for raw in open(path, encoding="utf-8"):
        line = raw.strip()
        if line.startswith("#") or not line:
            continue
        if line.startswith("==="):
            if cur:
                groups.append(cur); cur = []
            continue
        cur.append(line)
    if cur:
        groups.append(cur)
    return groups


def calibrate():
    gt = json.load(open(f"{DATA}/planted_patterns.json", encoding="utf-8"))
    ids = set()
    for cl in gt["serialClusters"]:
        ids.update(cl["memberCaseIds"])
    briefs = {}
    with open(f"{DATA}/cases.jsonl", encoding="utf-8") as f:
        for line in f:
            c = json.loads(line)
            if c["caseMasterId"] in ids:
                briefs[c["caseMasterId"]] = c["briefFacts"]
    groups = [[briefs[m] for m in cl["memberCaseIds"] if m in briefs] for cl in gt["serialClusters"]]
    run(groups, "CALIBRATION on 12 known clusters")


def main():
    if "--calibrate" in sys.argv:
        calibrate(); return
    if not os.path.exists(PATTERNS):
        print(f"❌ {PATTERNS} not found. Copy pipeline/blindtest/patterns.template.txt "
              f"to {PATTERNS} and fill in your 5 secret patterns.")
        return
    run(parse_patterns(PATTERNS), "your secret patterns")


if __name__ == "__main__":
    main()
