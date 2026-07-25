#!/usr/bin/env python3
"""Build a compact major-road network for Karnataka, used to SNAP patrol pickets
(naka-bandi checkpoints, mobile beats) onto real roads instead of dropping them in
farm fields.

Sovereign + offline at runtime: like karnataka-districts.geojson, the output is a
bundled static asset the frontend reads directly — no map API calls.

Input : an Overpass JSON dump of Karnataka motorway/trunk/primary ways with geometry
        (see OVERPASS_QUERY below). Pass its path, or set RAW_ROADS env var.
Output: frontend/public/karnataka-roads.json — an array of polylines, each a list of
        [lng, lat] rounded to 5dp (~1 m). Straight highway runs collapse to a few
        points via Douglas-Peucker, so the file stays small.

Re-fetch (when the server is free):
  curl -s -G https://overpass-api.de/api/interpreter --data-urlencode \
    'data=[out:json][timeout:280];area["ISO3166-2"="IN-KA"]->.ka;(way["highway"~"^(motorway|trunk|primary)$"](area.ka););out geom;' \
    -o pipeline/data/ka-roads-raw.json
  python3 -m pipeline.build_roads pipeline/data/ka-roads-raw.json
"""
import json
import os
import sys

# Douglas-Peucker tolerance in degrees (~0.0011° ≈ 120 m). Highways are mostly straight,
# so this shrinks the file hard while keeping the road shape faithful for snapping.
TOLERANCE = 0.0011
OUT = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "karnataka-roads.json")


def _perp_dist(p, a, b):
    """Perpendicular distance of point p from segment a-b (in degree space)."""
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    cx, cy = ax + t * dx, ay + t * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


def _dp(points, tol):
    """Iterative Douglas-Peucker (recursion-safe for long highways)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        lo, hi = stack.pop()
        dmax, idx = 0.0, -1
        for i in range(lo + 1, hi):
            d = _perp_dist(points[i], points[lo], points[hi])
            if d > dmax:
                dmax, idx = d, i
        if dmax > tol and idx != -1:
            keep[idx] = True
            stack.append((lo, idx))
            stack.append((idx, hi))
    return [p for p, k in zip(points, keep) if k]


def main():
    raw_paths = sys.argv[1:] or ([os.environ["RAW_ROADS"]] if os.environ.get("RAW_ROADS") else [])
    raw_paths = [p for p in raw_paths if os.path.exists(p)]
    if not raw_paths:
        sys.exit("no raw Overpass files found — pass one or more paths; see the header of this script to fetch them")

    polylines = []
    total_in = total_out = 0
    for raw_path in raw_paths:
        data = json.load(open(raw_path))
        for el in data.get("elements", []):
            if el.get("type") != "way":
                continue
            geom = el.get("geometry")
            if not geom or len(geom) < 2:
                continue
            pts = [[g["lon"], g["lat"]] for g in geom]
            total_in += len(pts)
            simp = _dp(pts, TOLERANCE)
            total_out += len(simp)
            polylines.append([[round(x, 5), round(y, 5)] for x, y in simp])

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(polylines, f, separators=(",", ":"))

    size = os.path.getsize(OUT)
    print(f"wrote {OUT}")
    print(f"  {len(polylines)} roads · {total_in} → {total_out} vertices (DP tol {TOLERANCE}°) · {size/1024:.0f} KB")


if __name__ == "__main__":
    main()
