"""Train a REAL detection-risk model + explainable drivers.

Supervised task: from features known at registration (crime type, gravity, district,
whether the FIR has GPS coordinates, case category, season, time-of-day), predict
whether a case will end UNDETECTED (chargesheet type C) vs DETECTED (type A).
Aggregating the model's predicted undetected-probability per district gives a
"detection-risk score"; permutation importance gives the explainable top drivers.

Outputs: frontend/public/risk-scores.json  +  metrics printed.
Run: python3 -m pipeline.train_risk
"""
import json
import os
import numpy as np
import pandas as pd
from datetime import datetime
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.inspection import permutation_importance

DATA = "pipeline/data"
REF = "pipeline/reference"
OUT = "frontend/public/risk-scores.json"

FEAT_LABEL = {
    "crimeHead": "crime type", "hasCoords": "missing location data",
    "district": "district", "gravity": "offence gravity",
    "category": "case category", "month": "season", "hour": "time of day",
}


def jsonl(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return [json.loads(l) for l in f]


def main():
    districts = {d["districtId"]: d["name"] for d in json.load(open(f"{REF}/districts.json", encoding="utf-8"))["districts"]}
    tax = json.load(open(f"{REF}/crime-taxonomy.json", encoding="utf-8"))
    head_of_sub = {s["crimeSubHeadId"]: s["crimeHeadId"] for s in tax["crimeSubHeads"]}

    cs = {x["caseMasterId"]: x["cstype"] for x in jsonl("chargesheets.jsonl")}
    rows = []
    for c in jsonl("cases.jsonl"):
        cst = cs.get(c["caseMasterId"])
        if cst not in ("A", "C"):
            continue  # only concluded detected/undetected cases
        try:
            hour = datetime.fromisoformat(c["incidentFromDate"]).hour
        except Exception:
            hour = 12
        rows.append({
            "crimeHead": head_of_sub[c["crimeMinorHeadId"]],
            "gravity": c["gravityOffenceId"],
            "district": c["districtId"],
            "category": c["caseCategoryId"],
            "hasCoords": 0 if c["latitude"] is None else 1,
            "month": int(c["crimeRegisteredDate"][5:7]),
            "hour": hour,
            "y": 1 if cst == "C" else 0,  # undetected = 1
        })
    df = pd.DataFrame(rows)
    FEATS = ["crimeHead", "gravity", "district", "category", "hasCoords", "month", "hour"]
    cat_idx = [0, 1, 2, 3]  # categorical feature positions

    X_tr, X_te, y_tr, y_te = train_test_split(df[FEATS], df["y"], test_size=0.25, random_state=7, stratify=df["y"])
    clf = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.06, max_depth=6,
                                         categorical_features=cat_idx, random_state=7)
    clf.fit(X_tr, y_tr)
    proba = clf.predict_proba(X_te)[:, 1]
    acc = accuracy_score(y_te, clf.predict(X_te))
    auc = roc_auc_score(y_te, proba)

    # explainable drivers (permutation importance on a test sample)
    samp = X_te.sample(min(6000, len(X_te)), random_state=1)
    pi = permutation_importance(clf, samp, y_te.loc[samp.index], n_repeats=5, random_state=1, scoring="roc_auc")
    drivers = sorted(
        [{"factor": FEAT_LABEL[FEATS[i]], "importance": round(float(pi.importances_mean[i]), 4)}
         for i in range(len(FEATS))],
        key=lambda d: -d["importance"])
    top_reasons = [d["factor"] for d in drivers[:3] if d["importance"] > 0]

    # per-district detection-risk score = avg predicted undetected-probability (scaled 0-100)
    df["risk"] = clf.predict_proba(df[FEATS])[:, 1]
    dr = df.groupby("district")["risk"].mean()
    lo, hi = dr.min(), dr.max()
    dist_rows = sorted(
        [{"district": districts[d], "riskScore": round(100 * (v - lo) / (hi - lo + 1e-9)),
          "undetectedProb": round(float(v), 3)} for d, v in dr.items()],
        key=lambda r: -r["riskScore"])

    out = {"model": "HistGradientBoostingClassifier",
           "metrics": {"accuracy": round(acc, 3), "auc": round(auc, 3)},
           "drivers": drivers, "topReasons": top_reasons, "districts": dist_rows}
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)

    print(f"=== Detection-risk model ({len(df):,} concluded cases) ===")
    print(f"  accuracy {acc:.3f} · ROC-AUC {auc:.3f}")
    print("  top drivers:", ", ".join(f"{d['factor']} ({d['importance']:.3f})" for d in drivers[:4]))
    print("  highest-risk districts:", ", ".join(f"{r['district']} {r['riskScore']}" for r in dist_rows[:4]))


if __name__ == "__main__":
    main()
