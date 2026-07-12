"""Benchmark NETRA's forecasting METHOD on REAL crime data (City of Chicago).

Runs the identical pipeline we use on Karnataka data — weekly aggregation per area,
lag / seasonality / trend features, time-based split, gradient boosting — against
503k real Chicago crimes (2022–2023, by community area). Reports the same metrics,
so the deck can say "validated on real open crime data".

Data: pipeline/data/chicago.csv (City of Chicago open data, dataset ijzp-q8t2)
Run:  python3 -m pipeline.benchmark_chicago
"""
import json
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score

CSV = "pipeline/data/chicago.csv"
OUT = "pipeline/data/benchmark_chicago.json"
TOP_N = 10


def main():
    df = pd.read_csv(CSV)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date", "community_area"])
    df["area"] = df["community_area"].astype(int)
    df["week"] = df["date"].dt.to_period("W").dt.start_time

    weeks = pd.date_range(df["week"].min(), df["week"].max(), freq="W-MON")
    areas = sorted(df["area"].unique())
    grid = pd.MultiIndex.from_product([areas, weeks], names=["area", "week"]).to_frame(index=False)
    counts = df.groupby(["area", "week"]).size().rename("y").reset_index()
    panel = grid.merge(counts, on=["area", "week"], how="left").fillna({"y": 0}).sort_values(["area", "week"])

    grp = panel.groupby("area")["y"]
    panel["lag1"] = grp.shift(1)
    panel["lag2"] = grp.shift(2)
    panel["lag52"] = grp.shift(52)
    panel["roll4"] = grp.transform(lambda s: s.shift(1).rolling(4).mean())
    panel["roll8"] = grp.transform(lambda s: s.shift(1).rolling(8).mean())
    panel["trend"] = panel["lag1"] - panel["roll4"]
    panel["month"] = panel["week"].dt.month
    panel["woy"] = panel["week"].dt.isocalendar().week.astype(int)
    panel = panel.dropna()

    FEATS = ["area", "lag1", "lag2", "roll4", "roll8", "lag52", "trend", "month", "woy"]
    cutoff = weeks[-12]
    train = panel[panel["week"] < cutoff]
    test = panel[panel["week"] >= cutoff]

    model = HistGradientBoostingRegressor(max_iter=400, learning_rate=0.06, max_depth=6,
                                          l2_regularization=1.0, categorical_features=[0], random_state=7)
    model.fit(train[FEATS], train["y"])
    pred = np.clip(model.predict(test[FEATS]), 0, None)

    mae = mean_absolute_error(test["y"], pred)
    base_mae = mean_absolute_error(test["y"], test["roll4"])
    r2 = r2_score(test["y"], pred)

    t = test.copy(); t["pred"] = pred
    hits = []
    for _, sub in t.groupby("week"):
        top_p = set(sub.sort_values("pred", ascending=False).head(TOP_N)["area"])
        top_a = set(sub.sort_values("y", ascending=False).head(TOP_N)["area"])
        hits.append(len(top_p & top_a) / TOP_N)
    hit = float(np.mean(hits))

    out = {"dataset": "City of Chicago open crime data (2022–2023)", "records": int(len(df)),
           "areas": len(areas), "model": "HistGradientBoostingRegressor",
           "MAE": round(mae, 3), "baseline_MAE": round(base_mae, 3),
           "improvement_vs_baseline_pct": round(100 * (base_mae - mae) / base_mae, 1),
           "R2": round(r2, 3), f"hit_rate_top{TOP_N}_areas": round(hit, 3)}
    json.dump(out, open(OUT, "w"), indent=1)
    print("=== NETRA forecasting method on REAL Chicago data ===")
    for k, v in out.items():
        print(f"  {k:32} {v}")


if __name__ == "__main__":
    main()
