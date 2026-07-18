// Turns a 7-day forecast hotspot into something a DSP/Inspector reads at a glance:
// a plain-language summary, a step-by-step patrol ORDER, and suggested picket positions
// ringing the predicted pocket. The optimizer (lib/optimizer.ts) decides HOW MANY units a
// pocket earns state-wide; this module decides WHAT those units do on the ground.
//
// HONEST FRAMING: incidents are synthetic, so we mark a predicted ZONE (the district-level
// forecast centroid + a ~1.3 km pocket radius) and SUGGEST picket positions around it — we
// never fabricate an exact house/street address. The UI says "predicted zone" everywhere.

export interface Hotspot {
  district: string;
  crimeType: string;
  projectedWeek: number;
  momentumPct: number;
  riskLevel: string;
  patrolWindow: string; // e.g. "22:00 – 03:00"
  lat?: number;
  lng?: number;
}

export type PicketKind = "naka" | "mobile" | "plainclothes" | "ksrp" | "pink";
export interface Picket { lat: number; lng: number; label: string; kind: PicketKind }

export interface PatrolPlan {
  district: string;
  crimeType: string;
  lat: number;
  lng: number;
  radiusM: number;
  expected: number; // ~N incidents projected this week
  window: string; // plain-language, e.g. "10 PM – 3 AM"
  windowRaw: string;
  trendPct: number;
  risk: string;
  units: number; // suggested units for THIS pocket
  headline: string; // "~7 property crimes likely this week"
  steps: string[]; // ordered patrol actions, plain DSP language
  pickets: Picket[]; // suggested positions ringing the zone
}

const KIND_LABEL: Record<PicketKind, string> = {
  naka: "Naka-bandi checkpoint",
  mobile: "Hoysala mobile beat",
  plainclothes: "Plain-clothes market watch",
  ksrp: "KSRP quick-reaction standby",
  pink: "Pink Hoysala women-safety beat",
};
export const KIND_COLOR: Record<PicketKind, [number, number, number]> = {
  naka: [239, 68, 68],
  mobile: [34, 211, 238],
  plainclothes: [245, 158, 11],
  ksrp: [168, 85, 247],
  pink: [236, 114, 168],
};

// "22:00 – 03:00" → "10 PM – 3 AM" (drops :00, keeps other minutes).
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
  const parts = raw.split(/[–-]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 2) return `${clock(parts[0])} – ${clock(parts[1])}`;
  return raw;
}

// Suggested units for a single pocket, from risk + projected volume (decision support).
function unitsFor(risk: string, expected: number): number {
  const base = risk === "High" ? 4 : risk === "Elevated" ? 3 : 2;
  return Math.min(5, base + (expected >= 10 ? 1 : 0));
}

// Which picket kinds this crime type warrants, in deploy priority order.
function kindsFor(crimeType: string, units: number): PicketKind[] {
  const t = crimeType.toLowerCase();
  const order: PicketKind[] = ["naka", "mobile"];
  if (/women|dowry|molest|assault on women/.test(t)) order.push("pink");
  else if (/body|robbery|dacoit|murder|hurt/.test(t)) order.push("ksrp");
  else order.push("plainclothes"); // property / theft / burglary / economic / cyber → watch the market/cash points
  order.push("mobile"); // second roving beat closes the ring
  return order.slice(0, Math.max(2, units));
}

// A ring of suggested picket positions around the pocket centroid.
function ringPickets(lat: number, lng: number, radiusM: number, kinds: PicketKind[]): Picket[] {
  const n = kinds.length;
  const dLat = (m: number) => m / 111_000;
  const dLng = (m: number) => m / (111_000 * Math.cos((lat * Math.PI) / 180));
  return kinds.map((kind, i) => {
    const ang = (i / n) * 2 * Math.PI - Math.PI / 2; // start at top, go clockwise
    const r = radiusM * (kind === "naka" ? 0.92 : 0.66); // naka sits on the outer junction
    return {
      lat: lat + dLat(r * Math.sin(ang)),
      lng: lng + dLng(r * Math.cos(ang)),
      label: KIND_LABEL[kind],
      kind,
    };
  });
}

export function buildPlan(h: Hotspot): PatrolPlan {
  const lat = h.lat ?? 0;
  const lng = h.lng ?? 0;
  const window = plainWindow(h.patrolWindow);
  const units = unitsFor(h.riskLevel, h.projectedWeek);
  const radiusM = 1300;
  const kinds = kindsFor(h.crimeType, units);
  const pickets = ringPickets(lat, lng, radiusM, kinds);
  const mobiles = kinds.filter((k) => k === "mobile").length || 1;

  const specific =
    kinds.includes("pink")
      ? "Run a Pink Hoysala women-safety beat and keep a woman officer on the response team."
      : kinds.includes("ksrp")
      ? "Keep a KSRP quick-reaction team on standby nearby — this crime can turn violent."
      : "Post a plain-clothes watch at the market / cash points inside the zone.";

  const steps = [
    `Saturate the ${h.district} zone with ${mobiles} Hoysala mobile patrol${mobiles > 1 ? "s" : ""} during ${window} — the window when this crime clusters.`,
    "Seal the zone with a naka-bandi (vehicle checkpoint) on the main junction to control who enters and leaves.",
    specific,
    "Brief the beat constables with the MO from this week's FIRs, and log every stop-check.",
    "After the window, review what the patrol caught and feed it back into tomorrow's forecast.",
  ];

  const headline = `~${h.projectedWeek} ${h.crimeType.toLowerCase().replace(/ crime$/, "")} case${h.projectedWeek === 1 ? "" : "s"} likely this week`;

  return {
    district: h.district,
    crimeType: h.crimeType,
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
  };
}
