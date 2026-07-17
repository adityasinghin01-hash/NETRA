"""Trend forecast overlay — projects each district's (and the state's) monthly-FIR
series a few months into the future with an honest confidence band, so the Analytics
trend line continues from past → predicted instead of stopping at today.

Method (stated openly on the slide): linear trend + month-of-year seasonal index fit on
the real history; band = ±1.28·residual-σ (an ~80% interval). Simple, explainable, and
reproducible from the existing series — no black box. Reads frontend/public/
district-analytics.json (66 months) and writes frontend/public/trend-forecast.json.

Run: python3 -m pipeline.build_trend_forecast
"""
import json
from pathlib import Path

import numpy as np

PUB = Path("frontend/public")
HORIZON = 4          # months projected forward
Z = 1.28             # ~80% interval


def next_months(last: str, n: int) -> list[str]:
    y, m = map(int, last.split("-"))
    out = []
    for _ in range(n):
        m += 1
        if m > 12:
            m = 1
            y += 1
        out.append(f"{y:04d}-{m:02d}")
    return out


def forecast(counts: list[int], months: list[str]) -> dict:
    y = np.asarray(counts, dtype=float)
    t = np.arange(len(y))
    # linear trend
    slope, intercept = np.polyfit(t, y, 1)
    trend = intercept + slope * t
    detrended = y - trend
    # month-of-year seasonal index
    moy = np.array([int(m.split("-")[1]) for m in months])
    seasonal = np.zeros(13)
    for mth in range(1, 13):
        mask = moy == mth
        seasonal[mth] = detrended[mask].mean() if mask.any() else 0.0
    resid = detrended - seasonal[moy]
    sigma = float(resid.std(ddof=1)) if len(resid) > 2 else float(resid.std())

    fut = next_months(months[-1], HORIZON)
    fut_t = np.arange(len(y), len(y) + HORIZON)
    fut_moy = np.array([int(m.split("-")[1]) for m in fut])
    mean = (intercept + slope * fut_t) + seasonal[fut_moy]
    mean = np.clip(mean, 0, None)
    lo = np.clip(mean - Z * sigma, 0, None)
    hi = mean + Z * sigma
    return {
        "future": fut,
        "mean": [round(float(v)) for v in mean],
        "lo": [round(float(v)) for v in lo],
        "hi": [round(float(v)) for v in hi],
        "sigma": round(sigma, 1),
        "bridge": {"month": months[-1], "count": int(counts[-1])},  # so the line connects
    }


def main() -> None:
    da = json.loads((PUB / "district-analytics.json").read_text())
    months = da["months"]
    districts = da["districts"]

    out = {"horizon": HORIZON, "interval": "~80% (±1.28σ)", "method": "linear trend + monthly seasonal index",
           "districts": {}}

    state_counts = np.zeros(len(months))
    for name, d in districts.items():
        c = d["counts"]
        state_counts += np.asarray(c, dtype=float)
        if sum(c) >= 30:  # skip near-empty districts (band would be meaningless)
            out["districts"][name] = forecast(c, months)

    out["state"] = forecast([int(v) for v in state_counts], months)

    (PUB / "trend-forecast.json").write_text(json.dumps(out))
    print(f"wrote trend-forecast.json — {len(out['districts'])} districts + state, horizon {HORIZON}mo")
    print(f"  state next-4: {out['state']['mean']}  (σ={out['state']['sigma']})")


if __name__ == "__main__":
    main()
