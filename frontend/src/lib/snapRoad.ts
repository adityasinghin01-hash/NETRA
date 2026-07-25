// Snap a patrol picket onto the nearest real road (bundled major-road network in
// public/karnataka-roads.json), so a naka-bandi checkpoint / mobile beat sits ON a road
// instead of in a farm field. Sovereign + offline: no map API calls.
//
// Equirectangular metric around the query point (fine at this scale); true point-to-SEGMENT
// nearest so long simplified highway segments still snap correctly. We only snap a handful of
// pickets on demand, so brute force over ~59k segments is instant.
export type Roads = number[][][]; // array of polylines, each a list of [lng, lat]

const M_PER_DEG = 111_000;

// Nearest point on segment a→b to p (all [lng, lat]); returns [lng, lat, distMeters].
function nearestOnSeg(p: number[], a: number[], b: number[], cosLat: number): [number, number, number] {
  const ax = a[0] * cosLat, ay = a[1];
  const bx = b[0] * cosLat, by = b[1];
  const px = p[0] * cosLat, py = p[1];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  const lng = cx / cosLat, lat = cy;
  return [lng, lat, Math.hypot((lng - p[0]) * cosLat, lat - p[1]) * M_PER_DEG];
}

// Nearest road point to (lng, lat) within maxDistM; null if none in range or no roads loaded.
export function snapToRoad(lng: number, lat: number, roads: Roads | null, maxDistM = 2500): [number, number] | null {
  if (!roads || !roads.length) return null;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const deg = (maxDistM / M_PER_DEG) * 1.4; // cheap bbox reject margin
  let best: [number, number] | null = null;
  let bestD = maxDistM;
  for (const line of roads) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      // bbox reject on the segment (both endpoints far in the same direction) → skip the sqrt
      if ((a[0] < lng - deg && b[0] < lng - deg) || (a[0] > lng + deg && b[0] > lng + deg) ||
          (a[1] < lat - deg && b[1] < lat - deg) || (a[1] > lat + deg && b[1] > lat + deg)) continue;
      const [sl, st, d] = nearestOnSeg([lng, lat], a, b, cosLat);
      if (d < bestD) { bestD = d; best = [sl, st]; }
    }
  }
  return best;
}
