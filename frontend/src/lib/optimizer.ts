// Patrol Optimizer — operations research, NOT ML. Given K patrol units, allocate them across
// forecast hotspots to MAXIMISE predicted crime covered. Greedy submodular maximisation carries
// a provable (1 − 1/e) ≈ 63% optimality bound (Nemhauser). Coverage uses a Koper-Curve style
// deterrence factor with diminishing returns (a 2nd unit on the same beat adds less than the 1st).
export interface Area { district: string; lambda: number; crimeType: string; patrolWindow: string; lat: number; lng: number }
export interface Allocation extends Area { units: number; covered: number; tactic: string }
export interface OptResult { alloc: Allocation[]; coveredPct: number; covered: number; total: number; units: number }

const E = 0.45; // per-unit deterrence fraction (Koper-curve dosage)

function tactic(a: Area, units: number): string {
  const t = a.crimeType.toLowerCase();
  const bits: string[] = [`${units} Hoysala mobile patrol${units > 1 ? "s" : ""}`];
  if (units >= 2) bits.push("naka-bandi checkpoint at the NH junction");
  if (t.includes("property") || t.includes("burglar") || t.includes("theft")) bits.push("plain-clothes watch at the APMC market");
  if (t.includes("women")) bits.push("women-safety beat + Pink Hoysala");
  if (t.includes("body") || t.includes("robbery") || t.includes("dacoit")) bits.push("KSRP standby");
  return bits.join(" · ") + ` (${a.patrolWindow})`;
}

export function optimize(areas: Area[], K: number): OptResult {
  const units = areas.map(() => 0);
  const total = areas.reduce((s, a) => s + a.lambda, 0) || 1;
  // Greedy: each step, place the next unit where it adds the most marginal coverage.
  for (let k = 0; k < K; k++) {
    let best = -1, bestGain = -1;
    for (let i = 0; i < areas.length; i++) {
      const gain = areas[i].lambda * Math.pow(1 - E, units[i]) * E;
      if (gain > bestGain) { bestGain = gain; best = i; }
    }
    if (best >= 0) units[best]++;
  }
  const alloc: Allocation[] = areas
    .map((a, i) => ({ ...a, units: units[i], covered: a.lambda * (1 - Math.pow(1 - E, units[i])), tactic: tactic(a, units[i]) }))
    .filter((a) => a.units > 0)
    .sort((x, y) => y.units - x.units || y.lambda - x.lambda);
  const covered = alloc.reduce((s, a) => s + a.covered, 0);
  return { alloc, coveredPct: covered / total, covered, total, units: K };
}
