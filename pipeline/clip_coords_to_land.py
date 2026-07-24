"""Clip incident coordinates to Karnataka land.

The generator jitters each point with a Gaussian around its district/station centre;
for COASTAL districts (Udupi, Dakshina Kannada, Uttara Kannada) that pushes ~1% of
points west into the Arabian Sea. This snaps any point that falls outside every
Karnataka district polygon back onto land — stepping it toward the nearest district
centroid until it lands inside a polygon. Fixes the map (incident-points.json) and the
source of truth (cases.jsonl) so downstream geo (Rossmo, hexbins) is clean too.

Run: python3 -m pipeline.clip_coords_to_land
(Note: fold the same land-clip into the generator on the next full regen.)
"""
import json

GEO = "frontend/public/karnataka-districts.geojson"
DISTRICTS = "pipeline/reference/districts.json"
PTS = "frontend/public/incident-points.json"
CASES = "pipeline/data/cases.jsonl"


def load_rings():
    geo = json.load(open(GEO))
    polys = []
    for f in geo["features"]:
        g = f["geometry"]
        coords = g["coordinates"] if g["type"] == "Polygon" else [r for poly in g["coordinates"] for r in poly]
        polys.append(coords)
    return polys


def in_ring(lng, lat, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def make_on_land(polys):
    def on_land(lng, lat):
        for rings in polys:
            for r in rings:
                if in_ring(lng, lat, r):
                    return True
        return False
    return on_land


def main():
    polys = load_rings()
    on_land = make_on_land(polys)
    dists = json.load(open(DISTRICTS))["districts"]
    centroids = [(d["lng"], d["lat"]) for d in dists if "lat" in d and "lng" in d]
    cent_by_id = {d["districtId"]: (d["lng"], d["lat"]) for d in dists if "lat" in d}

    def snap(lng, lat, target=None):
        if on_land(lng, lat):
            return lng, lat
        # target = point on land to walk toward (district centroid); else nearest centroid
        if target is None:
            target = min(centroids, key=lambda c: (c[0] - lng) ** 2 + (c[1] - lat) ** 2)
        tx, ty = target
        for step in range(1, 41):
            f = step / 40
            nl, na = lng + (tx - lng) * f, lat + (ty - lat) * f
            if on_land(nl, na):
                return round(nl, 6), round(na, 6)
        return round(tx, 6), round(ty, 6)  # fallback: the centroid itself

    # 1) incident-points.json (the map) — [lat, lng, head]
    pts = json.load(open(PTS))
    fixed = 0
    for p in pts:
        lat, lng = p[0], p[1]
        if not on_land(lng, lat):
            nl, na = snap(lng, lat)
            p[0], p[1] = na, nl
            fixed += 1
    json.dump(pts, open(PTS, "w"))
    print(f"incident-points.json: snapped {fixed}/{len(pts)} offshore points to land")

    # 2) cases.jsonl (source of truth) — snap toward each case's own district centroid
    rows = [json.loads(l) for l in open(CASES, encoding="utf-8")]
    cfixed = 0
    for c in rows:
        lat, lng = c.get("latitude"), c.get("longitude")
        if lat is None or lng is None:
            continue
        if not on_land(lng, lat):
            tgt = cent_by_id.get(c["districtId"])
            nl, na = snap(lng, lat, tgt)
            c["latitude"], c["longitude"] = na, nl
            cfixed += 1
    with open(CASES, "w", encoding="utf-8") as f:
        for c in rows:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")
    print(f"cases.jsonl: snapped {cfixed}/{len(rows)} offshore cases to land")


if __name__ == "__main__":
    main()
