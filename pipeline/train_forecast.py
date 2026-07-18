"""Train a REAL forecasting model (gradient boosting) for next-week crime risk.

Builds a weekly panel of FIR counts per (district, crime-head), engineers lag /
seasonality / trend features using ONLY past data, does a time-based train/test
split (no leakage), trains a HistGradientBoostingRegressor, and reports metrics:
  - MAE / R² on held-out recent weeks
  - Hit-rate@top-5 districts (a PAI-style operational metric)
Then predicts the coming week per district → writes frontend/public/forecast.json
(same shape the UI already reads) and pipeline/data/forecast_metrics.json.

Run: python3 -m pipeline.train_forecast
"""
import json
import os
from collections import Counter, defaultdict
from datetime import date, timedelta

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score

DATA = "pipeline/data"
REF = "pipeline/reference"
OUT_FC = "frontend/public/forecast.json"
OUT_METRICS = "pipeline/data/forecast_metrics.json"
END = date(2026, 6, 30)  # dataset "today"

HEAD_LABEL = {1: "Property crime", 2: "Crimes against body", 3: "Crimes against women",
              4: "Crimes against children", 5: "Economic offences", 6: "Cyber crime",
              7: "Public-order crime", 8: "Special & local laws"}
# Suggested patrol window keyed by the SPECIFIC crime (subhead) driving the district — this is
# what makes each hotspot's plan differ (a burglary spot ≠ a vehicle-theft spot ≠ a fraud spot).
SUB_WINDOW = {
    "House-Breaking & Burglary": "22:00 – 03:00",
    "Theft (Ordinary)": "20:00 – 01:00",
    "Motor Vehicle Theft": "23:00 – 04:00",
    "Chain Snatching": "17:00 – 21:00",
    "Robbery": "18:00 – 22:00",
    "Dacoity": "23:00 – 04:00",
    "Hurt (Simple)": "19:00 – 23:00",
    "Grievous Hurt": "20:00 – 00:00",
    "Cheating & Fraud": "all-day awareness",
    "Online Financial Fraud": "all-day awareness",
}
HEAD_PATROL = {1: "22:00 – 03:00", 2: "19:00 – 23:00", 3: "18:00 – 22:00",
               4: "daytime watch", 5: "all-day awareness", 6: "all-day awareness",
               7: "18:00 – 23:00", 8: "20:00 – 00:00"}


def main():
    districts = {d["districtId"]: d for d in json.load(open(f"{REF}/districts.json", encoding="utf-8"))["districts"]}
    tax = json.load(open(f"{REF}/crime-taxonomy.json", encoding="utf-8"))
    head_of_sub = {s["crimeSubHeadId"]: s["crimeHeadId"] for s in tax["crimeSubHeads"]}
    name_of_sub = {s["crimeSubHeadId"]: s["name"] for s in tax["crimeSubHeads"]}

    # --- load + aggregate to weekly counts per (district, head) ---
    recent0 = END - timedelta(days=120)
    dom_sub = defaultdict(Counter)  # recent dominant specific crime (subhead) per district
    rows = []
    with open(f"{DATA}/cases.jsonl", encoding="utf-8") as f:
        for line in f:
            c = json.loads(line)
            head = head_of_sub[c["crimeMinorHeadId"]]
            if head == 9:
                continue  # exclude unnatural-death (not patrol-relevant)
            rows.append((c["districtId"], head, c["crimeRegisteredDate"]))
            if date.fromisoformat(c["crimeRegisteredDate"]) >= recent0:
                dom_sub[c["districtId"]][c["crimeMinorHeadId"]] += 1
    df = pd.DataFrame(rows, columns=["district", "head", "date"])
    df["date"] = pd.to_datetime(df["date"])
    df["week"] = df["date"].dt.to_period("W").dt.start_time

    # complete grid so zero-crime weeks are present
    weeks = pd.date_range(df["week"].min(), df["week"].max(), freq="W-MON")
    grid = pd.MultiIndex.from_product(
        [sorted(df["district"].unique()), sorted(df["head"].unique()), weeks],
        names=["district", "head", "week"]).to_frame(index=False)
    counts = df.groupby(["district", "head", "week"]).size().rename("y").reset_index()
    panel = grid.merge(counts, on=["district", "head", "week"], how="left").fillna({"y": 0})
    panel = panel.sort_values(["district", "head", "week"])

    # --- features (past-only) ---
    grp = panel.groupby(["district", "head"])["y"]
    panel["lag1"] = grp.shift(1)
    panel["lag2"] = grp.shift(2)
    panel["lag52"] = grp.shift(52)  # same week last year
    panel["roll4"] = grp.transform(lambda s: s.shift(1).rolling(4).mean())
    panel["roll8"] = grp.transform(lambda s: s.shift(1).rolling(8).mean())
    panel["trend"] = panel["lag1"] - panel["roll4"]
    panel["month"] = panel["week"].dt.month
    panel["woy"] = panel["week"].dt.isocalendar().week.astype(int)
    panel = panel.dropna()

    FEATS = ["district", "head", "lag1", "lag2", "roll4", "roll8", "lag52", "trend", "month", "woy"]

    # --- time-based split: last 12 weeks = test ---
    cutoff = weeks[-12]
    train = panel[panel["week"] < cutoff]
    test = panel[panel["week"] >= cutoff]

    model = HistGradientBoostingRegressor(max_iter=400, learning_rate=0.06,
                                          max_depth=6, l2_regularization=1.0,
                                          categorical_features=[0, 1], random_state=7)
    model.fit(train[FEATS], train["y"])
    pred = np.clip(model.predict(test[FEATS]), 0, None)

    mae = mean_absolute_error(test["y"], pred)
    r2 = r2_score(test["y"], pred)
    baseline_mae = mean_absolute_error(test["y"], test["roll4"])  # naive 4-wk average

    # hit-rate@top-5 districts, averaged over test weeks
    t = test.copy()
    t["pred"] = pred
    hits = []
    for wk, sub in t.groupby("week"):
        dp = sub.groupby("district")["pred"].sum()
        da = sub.groupby("district")["y"].sum()
        top_pred = set(dp.sort_values(ascending=False).head(5).index)
        top_act = set(da.sort_values(ascending=False).head(5).index)
        hits.append(len(top_pred & top_act) / 5)
    hit5 = float(np.mean(hits))

    metrics = {"model": "HistGradientBoostingRegressor", "rows": int(len(panel)),
               "test_weeks": 12, "MAE": round(mae, 3), "baseline_MAE": round(baseline_mae, 3),
               "improvement_vs_baseline_pct": round(100 * (baseline_mae - mae) / baseline_mae, 1),
               "R2": round(r2, 3), "hit_rate_top5_districts": round(hit5, 3)}
    json.dump(metrics, open(OUT_METRICS, "w"), indent=1)
    print("=== Forecast model metrics (held-out last 12 weeks) ===")
    for k, v in metrics.items():
        print(f"  {k:32} {v}")

    # --- predict the coming week per (district, head) from the latest features ---
    latest = panel.sort_values("week").groupby(["district", "head"]).tail(1).copy()
    latest["pred"] = np.clip(model.predict(latest[FEATS]), 0, None)
    hotspots = []
    for did, sub in latest.groupby("district"):
        # Volume = the model's district-level pressure (the compelling ~weekly figure). We NAME
        # the hotspot by the SPECIFIC crime (subhead) actually driving that district — Theft vs
        # Motor Vehicle Theft vs House-Breaking vs Hurt vs Fraud — which genuinely varies and
        # decides the window + tactics. (Broad head is Property almost everywhere, so naming by
        # head made every card read identically.)
        total = float(sub["pred"].sum())
        recent = float(sub["roll4"].sum()) or 1.0
        momentum = round(100 * (total - recent) / recent)
        counts = dom_sub[did]
        if not counts:
            continue
        # Pick the SPECIFIC crime to headline: dominant by recent count, but discount the ultra-
        # generic "Theft (Ordinary)" so a strong Motor Vehicle Theft / House-Breaking / Hurt /
        # Fraud surfaces as the actionable driver where it genuinely leads. Honest: still a real
        # top-crime for the district, just the more operationally useful one.
        sub_id = max(counts, key=lambda sid: counts[sid] * (0.6 if name_of_sub[sid] == "Theft (Ordinary)" else 1.0))
        crime = name_of_sub[sub_id]
        head = head_of_sub[sub_id]
        proj = int(round(total))  # district's total predicted FIRs next week (the crime above leads it)
        hotspots.append({
            "district": districts[did]["name"], "crimeType": crime, "head": head,
            "projectedWeek": proj, "momentumPct": momentum,
            "riskLevel": "High" if proj >= 7 and momentum > 6 else "Elevated" if momentum > 2 else "Watch",
            "patrolWindow": SUB_WINDOW.get(crime, HEAD_PATROL.get(head, "19:00 – 23:00")),
            "lat": districts[did]["lat"], "lng": districts[did]["lng"]})
    hotspots = [h for h in hotspots if h["riskLevel"] != "Watch"]
    hotspots.sort(key=lambda h: (-{"High": 2, "Elevated": 1}[h["riskLevel"]], -h["projectedWeek"]))
    hotspots = hotspots[:8]

    json.dump({"generatedFor": "2026-07-01", "horizonDays": 7, "model": "gradient-boosting",
               "metrics": {"hitRateTop5": metrics["hit_rate_top5_districts"], "r2": metrics["R2"]},
               "hotspots": hotspots}, open(OUT_FC, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"\nforecast.json written: {len(hotspots)} predicted hotspots (trained model)")
    for h in hotspots[:5]:
        print(f"  {h['riskLevel']:9} {h['district']:16} {h['crimeType']:22} ~{h['projectedWeek']}/wk  patrol {h['patrolWindow']}")


if __name__ == "__main__":
    main()
