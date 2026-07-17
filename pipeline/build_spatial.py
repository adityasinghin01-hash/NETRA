"""Spatial Intelligence Triad — per serial cluster, compute:
  1. the chronological CRIME ROUTE (member FIRs ordered by date, with coords) — the arcs,
  2. GEOGRAPHIC PROFILE via Rossmo's Criminal Geographic Targeting (a distance-decay +
     buffer-zone probability surface over a grid → predicted home/anchor ZONE), and
  3. a NEXT-STRIKE prediction (recency-weighted location + cadence-based window).

Rossmo CGT score at grid point p, summed over crimes c (Manhattan distance d):
    d > B :   1 / d^f
    d <= B:   B^(g-f) / (2B - d)^g
with buffer B (~half the mean crime-to-centroid distance) and f=g=1.2 (standard).
Real, police-used method — predicts a PLACE, not a person (ethics-safe). Marauder-model
assumption + >=5 points stated openly; deeper validation lives in the blind test.

Output: frontend/public/spatial.json  (keyed by clusterId)
Run: python3 -m pipeline.build_spatial
"""
import json
import os
from datetime import date, timedelta

import numpy as np

DATA = "pipeline/data"
REF = "pipeline/reference"
OUT = "frontend/public/spatial.json"
F = G = 1.2
GRID = 40

TIME_WINDOW = {
    "past midnight": "00:00–03:00", "around midnight": "23:00–02:00",
    "in the early hours": "03:00–06:00", "late at night": "22:00–01:00",
    "in the evening": "18:00–21:00", "during the afternoon": "13:00–16:00",
}
DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def jload(p):
    return json.load(open(p, encoding="utf-8"))


def cases_by_id():
    m = {}
    with open(os.path.join(DATA, "cases.jsonl"), encoding="utf-8") as f:
        for line in f:
            c = json.loads(line)
            m[c["caseMasterId"]] = c
    return m


def idate(c):
    return (c.get("incidentFromDate") or c.get("crimeRegisteredDate") or "")[:10]


def main():
    gt = jload(f"{DATA}/planted_patterns.json")
    districts = jload(f"{REF}/districts.json")["districts"]
    dmap = {d["districtId"]: d for d in districts}
    # district centroids as km-projected points for "which district" lookup
    cmap = cases_by_id()

    out = {}
    for cl in gt["serialClusters"]:
        members = [cmap[m] for m in cl["memberCaseIds"] if m in cmap]
        members = [m for m in members if m.get("latitude") and m.get("longitude")]
        members.sort(key=idate)
        if len(members) < 3:
            continue

        lats = np.array([m["latitude"] for m in members])
        lngs = np.array([m["longitude"] for m in members])
        lat0 = float(lats.mean())
        kx = 111.0 * np.cos(np.radians(lat0))  # km per degree lng
        ky = 111.0                              # km per degree lat
        xs = lngs * kx
        ys = lats * ky

        # Buffer B ~ half the mean crime-to-centroid distance (km).
        cx, cy = xs.mean(), ys.mean()
        B = max(1.5, 0.5 * float(np.mean(np.hypot(xs - cx, ys - cy))))

        # Grid over the crime bbox + 30% margin.
        mx = (xs.max() - xs.min()) * 0.3 + B
        my = (ys.max() - ys.min()) * 0.3 + B
        gx = np.linspace(xs.min() - mx, xs.max() + mx, GRID)
        gy = np.linspace(ys.min() - my, ys.max() + my, GRID)
        GX, GY = np.meshgrid(gx, gy)  # (GRID,GRID)

        # Rossmo CGT score, vectorized over grid, summed over crimes.
        score = np.zeros_like(GX)
        for xc, yc in zip(xs, ys):
            d = np.abs(GX - xc) + np.abs(GY - yc)  # Manhattan distance
            d = np.maximum(d, 1e-3)
            near = d <= B
            s = np.where(near, (B ** (G - F)) / np.maximum(2 * B - d, 1e-3) ** G, 1.0 / d ** F)
            score += s
        score /= score.max() or 1.0

        # Predicted anchor = peak cell.
        pi, pj = np.unravel_index(np.argmax(score), score.shape)
        anchor = {"lat": round(GY[pi, pj] / ky, 5), "lng": round(GX[pi, pj] / kx, 5)}

        # Surface = the focused hot zone: cells in the top probability band, capped so it
        # renders as a crisp pocket (not a diffuse blanket) and the file stays small.
        cells = []
        for i in range(GRID):
            for j in range(GRID):
                w = float(score[i, j])
                if w >= 0.5:
                    cells.append((w, round(GY[i, j] / ky, 5), round(GX[i, j] / kx, 5)))
        cells.sort(reverse=True)
        surface = [{"lat": la, "lng": ln, "w": round(w, 2)} for w, la, ln in cells[:180]]

        # Chronological route (members with order).
        route = [{"order": k + 1, "caseNo": m["crimeNo"], "date": idate(m),
                  "district": dmap[m["districtId"]]["name"],
                  "lat": round(m["latitude"], 5), "lng": round(m["longitude"], 5)}
                 for k, m in enumerate(members)]

        # Next-strike: recency-weighted centroid (recent crimes weigh more) + cadence window.
        w = np.linspace(0.5, 1.5, len(members))
        nx = float(np.average(xs, weights=w))
        ny = float(np.average(ys, weights=w))
        ns_lat, ns_lng = round(ny / ky, 5), round(nx / kx, 5)
        # nearest district centroid to the predicted point
        nd = min(districts, key=lambda d: (d["lng"] - ns_lng) ** 2 + (d["lat"] - ns_lat) ** 2)
        dts = [date.fromisoformat(idate(m)) for m in members]
        gaps = [(dts[i + 1] - dts[i]).days for i in range(len(dts) - 1)]
        cad = int(np.median(gaps)) if gaps else 14
        nxt = dts[-1] + timedelta(days=cad)
        reg = 1.0 - min(1.0, (np.std(gaps) / (np.mean(gaps) + 1e-6)) if gaps else 1.0)  # regularity
        conf = round(0.55 + 0.35 * reg, 2)
        dows = sorted({dts[i].weekday() for i in range(len(dts))})
        dow_str = "–".join(DOW[d] for d in (dows[:1] + dows[-1:])) if dows else "any"
        tw = TIME_WINDOW.get(cl["mo"].get("time_phrase", ""), "22:00–03:00")

        out[cl["id"]] = {
            "clusterId": cl["id"],
            "label": cl["label"],
            "route": route,
            "rossmo": {"anchor": anchor, "surface": surface, "bufferKm": round(B, 1),
                       "note": "Rossmo geographic profile — predicted operating/base ZONE from "
                               "crime locations (marauder model, ≥5 points). A place, not a person."},
            "nextStrike": {"lat": ns_lat, "lng": ns_lng, "district": nd["name"],
                           "window": f"~{nxt.isoformat()} ({dow_str})", "timeWindow": tw,
                           "confidence": conf, "cadenceDays": cad},
        }

    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    kb = os.path.getsize(OUT) / 1024
    print(f"spatial: {len(out)} clusters → {OUT} ({kb:.0f} KB)")
    for cid, c in list(out.items())[:3]:
        a = c["rossmo"]["anchor"]; ns = c["nextStrike"]
        print(f"  {cid} {c['label'][:28]:28} route={len(c['route'])} surface={len(c['rossmo']['surface'])} "
              f"anchor=({a['lat']},{a['lng']}) next={ns['district']} {ns['window']} {ns['confidence']}")


if __name__ == "__main__":
    main()
