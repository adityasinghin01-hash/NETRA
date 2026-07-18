// Turns a 7-day forecast hotspot into something a DSP/Inspector reads at a glance:
// a plain-language summary, a step-by-step patrol ORDER tuned to the SPECIFIC crime driving
// the district, and picket positions placed on the REAL incident concentrations inside that
// district (grid the actual FIR locations → densest pockets), so "where to send police" points
// at real ground — not a generic ring around the district centre.
//
// HONEST FRAMING: the incidents are synthetic, so we mark a predicted ZONE (the densest real
// FIR pocket + a radius) with SUGGESTED picket positions — we never fabricate an exact address.

export interface Hotspot {
  district: string;
  crimeType: string; // specific crime, e.g. "House-Breaking & Burglary"
  head?: number; // crime-head id (1..8) for matching incident points
  projectedWeek: number; // district total predicted FIRs next week
  momentumPct: number;
  riskLevel: string;
  patrolWindow: string; // e.g. "22:00 – 03:00"
  lat?: number;
  lng?: number;
}

export type PicketKind = "naka" | "mobile" | "plainclothes" | "ksrp" | "pink" | "awareness";
export interface Picket { lat: number; lng: number; label: string; kind: PicketKind; hits?: number }
export interface Incident { lat: number; lng: number }

export interface PatrolPlan {
  district: string;
  crimeType: string;
  head?: number;
  lat: number; // zone centre = densest real pocket (or centroid fallback)
  lng: number;
  radiusM: number;
  expected: number;
  window: string; // plain-language, e.g. "10 PM – 3 AM"
  windowRaw: string;
  trendPct: number;
  risk: string;
  units: number;
  headline: string;
  steps: string[];
  pickets: Picket[];
  grounded: boolean; // true = pickets sit on real incident pockets; false = ring fallback
}

const KIND_LABEL: Record<PicketKind, string> = {
  naka: "Naka-bandi checkpoint",
  mobile: "Hoysala mobile beat",
  plainclothes: "Plain-clothes watch",
  ksrp: "KSRP quick-reaction standby",
  pink: "Pink Hoysala women-safety beat",
  awareness: "Awareness camp / bank alert",
};
export const KIND_COLOR: Record<PicketKind, [number, number, number]> = {
  naka: [239, 68, 68],
  mobile: [34, 211, 238],
  plainclothes: [245, 158, 11],
  ksrp: [168, 85, 247],
  pink: [236, 114, 168],
  awareness: [52, 211, 153],
};

// Crime family → the tactic profile that actually differs on the ground.
type Family = "burglary" | "theft" | "vehicle" | "violence" | "women" | "fraud" | "generic";
function familyOf(crimeType: string): Family {
  const t = crimeType.toLowerCase();
  if (/burglar|house-break|housebreak|dacoit/.test(t)) return "burglary";
  if (/vehicle|motor/.test(t)) return "vehicle";
  if (/wom[ae]n|dowry|molest|rape|modesty|girl/.test(t)) return "women"; // before violence: "assault on woman"
  if (/fraud|cheat|cyber|financial/.test(t)) return "fraud";
  if (/hurt|assault|murder|riot|affray|body|robbery|snatch/.test(t)) return "violence";
  if (/theft/.test(t)) return "theft";
  return "generic";
}

// Picket kinds per family, in deploy-priority order (first = highest-density pocket).
const FAMILY_KINDS: Record<Family, PicketKind[]> = {
  burglary: ["naka", "plainclothes", "mobile", "mobile"],
  theft: ["plainclothes", "naka", "mobile", "mobile"],
  vehicle: ["naka", "mobile", "plainclothes", "mobile"],
  violence: ["ksrp", "naka", "mobile", "mobile"],
  women: ["pink", "mobile", "naka", "mobile"],
  fraud: ["awareness", "mobile", "awareness", "mobile"],
  generic: ["naka", "mobile", "plainclothes", "mobile"],
};

// "22:00 – 03:00" → "10 PM – 3 AM"; passes through non-clock windows ("all-day awareness").
function clock(hhmm: string): string {
  const [hs, ms] = hhmm.trim().split(":");
  const H = parseInt(hs, 10);
  if (Number.isNaN(H)) return hhmm.trim();
  const ap = H < 12 || H === 24 ? "AM" : "PM";
  let h12 = H % 12;
  if (h12 === 0) h12 = 12;
  const m = ms && ms !== "00" ? `:${ms}` : "";
  return `${h12}${m} ${ap}`;
}
function plainWindow(raw: string): string {
  if (!/\d/.test(raw)) return raw; // "all-day awareness"
  const parts = raw.split(/[–-]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 2) return `${clock(parts[0])} – ${clock(parts[1])}`;
  return raw;
}

function unitsFor(risk: string, expected: number): number {
  const base = risk === "High" ? 4 : risk === "Elevated" ? 3 : 2;
  return Math.min(5, base + (expected >= 10 ? 1 : 0));
}

const distM = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const dLat = (aLat - bLat) * 111_000;
  const dLng = (aLng - bLng) * 111_000 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

function gridCells(incidents: Incident[], cell: number): { lat: number; lng: number; count: number }[] {
  const bins = new Map<string, { sl: number; sn: number; c: number }>();
  for (const p of incidents) {
    const key = `${Math.round(p.lat / cell)}_${Math.round(p.lng / cell)}`;
    const b = bins.get(key) ?? { sl: 0, sn: 0, c: 0 };
    b.sl += p.lat; b.sn += p.lng; b.c += 1;
    bins.set(key, b);
  }
  return [...bins.values()].map((b) => ({ lat: b.sl / b.c, lng: b.sn / b.c, count: b.c })).sort((a, b) => b.count - a.count);
}

// Two-stage: find the district's single hottest NEIGHBOURHOOD (coarse grid), then cluster the
// pickets at the densest sub-pockets WITHIN ~2 km of it — so one plan = one coherent pocket, not
// scattered pins across a big district.
function microHotspots(incidents: Incident[], k: number): { lat: number; lng: number; count: number }[] {
  const coarse = gridCells(incidents, 0.012); // ~1.3 km
  if (!coarse.length) return [];
  const hot = coarse[0];
  const near = incidents.filter((p) => distM(hot.lat, hot.lng, p.lat, p.lng) <= 2200);
  const fine = gridCells(near, 0.004); // ~430 m sub-pockets inside the hot neighbourhood
  return fine.slice(0, k);
}

// Ring fallback when a district has too few real incidents to cluster.
function ringPickets(lat: number, lng: number, radiusM: number, kinds: PicketKind[]): Picket[] {
  const n = kinds.length;
  const dLat = (m: number) => m / 111_000;
  const dLng = (m: number) => m / (111_000 * Math.cos((lat * Math.PI) / 180));
  return kinds.map((kind, i) => {
    const ang = (i / n) * 2 * Math.PI - Math.PI / 2;
    const r = radiusM * (kind === "naka" ? 0.92 : 0.66);
    return { lat: lat + dLat(r * Math.sin(ang)), lng: lng + dLng(r * Math.cos(ang)), label: KIND_LABEL[kind], kind };
  });
}

function stepsFor(family: Family, district: string, window: string, kinds: PicketKind[], grounded: boolean): string[] {
  const mobiles = kinds.filter((k) => k === "mobile").length || 1;
  const where = grounded
    ? `the pockets where FIRs actually cluster in ${district}`
    : `the ${district} zone`;

  if (family === "fraud") {
    return [
      `Run an awareness drive at ${where} during banking hours — brief shopkeepers, banks and UPI agents on the current cheating/OTP fraud pattern.`,
      "Coordinate with the cyber cell and banks to flag and freeze mule accounts fast.",
      "Post a Hoysala mobile near the market/ATM cluster to respond to fresh complaints.",
      "Log every complaint with the exact fraud method so the pattern sharpens for next week.",
    ];
  }

  const lead =
    family === "violence"
      ? `Keep a KSRP quick-reaction team on standby at ${where} during ${window} — this crime can turn violent.`
      : family === "women"
      ? `Run a Pink Hoysala women-safety beat over ${where} during ${window}, with a woman officer on the response team.`
      : family === "vehicle"
      ? `Set naka-bandi vehicle checks on the exit roads of ${where} during ${window} and check two-wheelers without papers.`
      : family === "burglary"
      ? `Saturate ${where} with ${mobiles} Hoysala mobile patrol${mobiles > 1 ? "s" : ""} during ${window} — the window when break-ins happen.`
      : `Saturate ${where} with ${mobiles} Hoysala mobile patrol${mobiles > 1 ? "s" : ""} during ${window} — the window when this crime clusters.`;

  const second =
    family === "vehicle"
      ? "Post a plain-clothes watch at the main parking / bus-stand where vehicles are lifted."
      : family === "violence" || family === "women"
      ? "Seal the zone with a naka-bandi on the main junction to control who enters and leaves."
      : "Seal the zone with a naka-bandi (vehicle checkpoint) on the main junction to control who enters and leaves.";

  return [
    lead,
    second,
    "Brief the beat constables with the MO from this week's FIRs, and log every stop-check.",
    "After the window, review what the patrol caught and feed it back into tomorrow's forecast.",
  ];
}

// `incidents` should already be filtered to this district (+ crime head) by the caller.
// `unitsOverride` (from the patrol optimizer) is the single source of truth for how many units
// this pocket gets — so the card, the plan, the pickets and the deployment PDF all agree.
export function buildPlan(h: Hotspot, incidents: Incident[] = [], unitsOverride?: number): PatrolPlan {
  const cLat = h.lat ?? 0;
  const cLng = h.lng ?? 0;
  const window = plainWindow(h.patrolWindow);
  const units = Math.max(1, unitsOverride ?? unitsFor(h.riskLevel, h.projectedWeek));
  const family = familyOf(h.crimeType);
  // Exactly one picket per unit: the family's tactic profile, padded with roving mobile beats.
  const profile = FAMILY_KINDS[family];
  const kinds: PicketKind[] = Array.from({ length: units }, (_, i) => profile[i] ?? "mobile");

  // Real incident pockets → pickets sit where crime actually concentrates.
  const cells = microHotspots(incidents, kinds.length);
  const grounded = cells.length >= 2;

  let lat = cLat, lng = cLng, radiusM = 1300, pickets: Picket[];
  if (grounded) {
    lat = cells[0].lat;
    lng = cells[0].lng;
    const spread = Math.max(...cells.map((c) => distM(lat, lng, c.lat, c.lng)), 500);
    radiusM = Math.min(2600, Math.max(800, spread + 450));
    // A picket on each real pocket; if the district has fewer pockets than units, spread the
    // remaining units on a ring around the hottest pocket so the full plan still deploys.
    const dLat = (m: number) => m / 111_000;
    const dLng = (m: number) => m / (111_000 * Math.cos((lat * Math.PI) / 180));
    pickets = kinds.map((kind, i) => {
      if (i < cells.length) return { lat: cells[i].lat, lng: cells[i].lng, label: KIND_LABEL[kind], kind, hits: cells[i].count };
      const ang = (i / kinds.length) * 2 * Math.PI - Math.PI / 2;
      const r = radiusM * 0.5;
      return { lat: lat + dLat(r * Math.sin(ang)), lng: lng + dLng(r * Math.cos(ang)), label: KIND_LABEL[kind], kind };
    });
  } else {
    pickets = ringPickets(cLat, cLng, radiusM, kinds);
  }

  const steps = stepsFor(family, h.district, window, kinds, grounded);
  const headline = `~${h.projectedWeek} FIR${h.projectedWeek === 1 ? "" : "s"} likely this week`;

  return {
    district: h.district,
    crimeType: h.crimeType,
    head: h.head,
    lat,
    lng,
    radiusM,
    expected: h.projectedWeek,
    window,
    windowRaw: h.patrolWindow,
    trendPct: h.momentumPct,
    risk: h.riskLevel,
    units,
    headline,
    steps,
    pickets,
    grounded,
  };
}
