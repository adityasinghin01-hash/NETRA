"""DL-vs-GBM forecast race on REAL Chicago data (keep-if-it-wins).

Champion: Poisson gradient-boosting (the shipped model).
Challenger: a spatio-temporal LSTM — per-area weekly-count sequences + an area embedding,
Poisson loss. Same weekly panel, same time-based holdout, same metrics (MAE, R², top-10
hotspot hit-rate). Whichever genuinely wins is what we claim; if DL loses, GBM stays and the
comparison is an honest rigor slide.

Run: python3 -m pipeline.bench_dl
"""
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score

CSV = "pipeline/data/chicago.csv"
TOP_N = 10
L = 12  # weeks of history the LSTM sees
torch.manual_seed(7)
np.random.seed(7)


def build_panel():
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
    return panel, weeks, areas


def hit_rate(t):
    hits = []
    for _, sub in t.groupby("week"):
        tp = set(sub.sort_values("pred", ascending=False).head(TOP_N)["area"])
        ta = set(sub.sort_values("y", ascending=False).head(TOP_N)["area"])
        hits.append(len(tp & ta) / TOP_N)
    return float(np.mean(hits))


def run_gbm(panel, weeks):
    g = panel.groupby("area")["y"]
    p = panel.copy()
    p["lag1"] = g.shift(1); p["lag2"] = g.shift(2); p["lag52"] = g.shift(52)
    p["roll4"] = g.transform(lambda s: s.shift(1).rolling(4).mean())
    p["roll8"] = g.transform(lambda s: s.shift(1).rolling(8).mean())
    p["trend"] = p["lag1"] - p["roll4"]
    p["month"] = p["week"].dt.month
    p["woy"] = p["week"].dt.isocalendar().week.astype(int)
    p = p.dropna()
    F = ["area", "lag1", "lag2", "roll4", "roll8", "lag52", "trend", "month", "woy"]
    cutoff = weeks[-12]
    tr, te = p[p.week < cutoff], p[p.week >= cutoff]
    m = HistGradientBoostingRegressor(loss="poisson", max_iter=600, learning_rate=0.03, max_depth=5,
                                      l2_regularization=2.0, min_samples_leaf=40, categorical_features=[0], random_state=7)
    m.fit(tr[F], tr["y"])
    te = te.copy(); te["pred"] = np.clip(m.predict(te[F]), 0, None)
    return mean_absolute_error(te.y, te.pred), r2_score(te.y, te.pred), hit_rate(te)


class STLSTM(nn.Module):
    def __init__(self, n_areas, emb=8, hid=32):
        super().__init__()
        self.emb = nn.Embedding(n_areas, emb)
        self.lstm = nn.LSTM(1, hid, batch_first=True)
        self.head = nn.Sequential(nn.Linear(hid + emb + 2, 32), nn.ReLU(), nn.Linear(32, 1), nn.Softplus())

    def forward(self, seq, aidx, cal):
        _, (h, _) = self.lstm(seq)
        x = torch.cat([h[-1], self.emb(aidx), cal], dim=1)
        return self.head(x).squeeze(1) + 1e-3


def run_lstm(panel, weeks, areas):
    aidx = {a: i for i, a in enumerate(areas)}
    cutoff = weeks[-12]
    mat = panel.pivot(index="area", columns="week", values="y").reindex(areas)
    wk = list(mat.columns)
    Xs, As, Cs, Ys, WKs, ARs = [], [], [], [], [], []
    for a in areas:
        row = mat.loc[a].values.astype(np.float32)
        for t in range(L, len(wk)):
            Xs.append(row[t - L:t]); As.append(aidx[a])
            Cs.append([wk[t].month / 12.0, wk[t].isocalendar().week / 53.0])
            Ys.append(row[t]); WKs.append(wk[t]); ARs.append(a)
    Xs = np.array(Xs); As = np.array(As); Cs = np.array(Cs, np.float32); Ys = np.array(Ys, np.float32)
    WKs = np.array(WKs); ARs = np.array(ARs)
    tr = WKs < cutoff; sc = 10.0
    Xt = torch.tensor(Xs[tr] / sc).unsqueeze(-1); At = torch.tensor(As[tr]); Ct = torch.tensor(Cs[tr]); Yt = torch.tensor(Ys[tr])
    Xe = torch.tensor(Xs[~tr] / sc).unsqueeze(-1); Ae = torch.tensor(As[~tr]); Ce = torch.tensor(Cs[~tr])
    model = STLSTM(len(areas)); opt = torch.optim.Adam(model.parameters(), lr=0.01)
    pois = nn.PoissonNLLLoss(log_input=False)
    n = len(Yt)
    for ep in range(60):
        model.train(); perm = torch.randperm(n)
        for i in range(0, n, 256):
            b = perm[i:i + 256]; opt.zero_grad()
            lam = model(Xt[b], At[b], Ct[b]); loss = pois(lam, Yt[b]); loss.backward(); opt.step()
    model.eval()
    with torch.no_grad():
        pred = model(Xe, Ae, Ce).numpy()
    te = pd.DataFrame({"area": ARs[~tr], "week": WKs[~tr], "y": Ys[~tr], "pred": np.clip(pred, 0, None)})
    return mean_absolute_error(te.y, te.pred), r2_score(te.y, te.pred), hit_rate(te)


def main():
    panel, weeks, areas = build_panel()
    print("Racing on Chicago — test = last 12 weeks, %d areas…" % len(areas))
    gm, gr, gh = run_gbm(panel, weeks)
    print(f"  GBM  (Poisson) : MAE={gm:6.3f}  R2={gr:6.3f}  hit@{TOP_N}={gh:.3f}")
    lm, lr, lh = run_lstm(panel, weeks, areas)
    print(f"  LSTM (ST-DL)   : MAE={lm:6.3f}  R2={lr:6.3f}  hit@{TOP_N}={lh:.3f}")
    win_mae = "LSTM" if lm < gm else "GBM"
    win_hit = "LSTM" if lh > gh else "GBM"
    print(f"\n  Winner — MAE: {win_mae} · hotspot hit-rate: {win_hit}")
    print("  → ship the winner; if GBM holds, the comparison is an honest rigor slide.")


if __name__ == "__main__":
    main()
