// GPU crime map — MapLibre GL (dark vector OR Esri satellite base) + deck.gl overlay.
// The "money shot": zoom-adaptive 3D lit hexbin terrain, an adaptive GPU heatmap, and
// glowing clickable incident dots that open the real FIR. Imperative MapLibre +
// MapboxOverlay (robust under React 19 / Vite). Data: public/incident-points.json
// ([lat, lng, crimeHead, crimeNo, district, date, crimeType]).
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer, PathLayer, TextLayer } from "@deck.gl/layers";
import { LightingEffect, AmbientLight, DirectionalLight } from "@deck.gl/core";
import type { Layer } from "@deck.gl/core";
import { KIND_COLOR, type PatrolPlan } from "@/lib/patrolPlan";

// Main base: OpenFreeMap dark (OSM vector — streets, labels, and 3D BUILDINGS on deep zoom),
// themed to NETRA. CartoDB dark is the auto-fallback if the community tiles hiccup.
const OFM_DARK = "https://tiles.openfreemap.org/styles/dark";
const FALLBACK_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const OMT_SOURCE: maplibregl.VectorSourceSpecification = { type: "vector", url: "https://tiles.openfreemap.org/planet" };
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

// Dark 3D building extrusions — injected after each style load (setStyle wipes custom layers).
// Height-graded colour so blocks read with depth on the dark base.
const BUILDINGS_3D = {
  id: "netra-buildings-3d", type: "fill-extrusion" as const, source: "openmaptiles", "source-layer": "building",
  minzoom: 13.5,
  paint: {
    "fill-extrusion-base": ["get", "render_min_height"],
    "fill-extrusion-height": ["get", "render_height"],
    "fill-extrusion-color": ["interpolate", ["linear"], ["get", "render_height"], 0, "hsl(214,26%,20%)", 25, "hsl(210,30%,32%)", 80, "hsl(202,45%,46%)"],
    "fill-extrusion-opacity": 0.92,
  },
};

// Satellite base (Esri imagery) + the same vector source so 3D buildings also work over it.
const SAT_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: GLYPHS,
  sources: {
    sat: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Esri World Imagery" },
    ref: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"], tileSize: 256 },
    openmaptiles: OMT_SOURCE,
  },
  layers: [
    { id: "sat", type: "raster", source: "sat" },
    { id: "ref", type: "raster", source: "ref", paint: { "raster-opacity": 0.85 } },
  ],
};

// Karnataka bounds → the map is locked to the state (deep zoom, can't wander off).
const KA_BOUNDS: [[number, number], [number, number]] = [[73.4, 11.2], [78.9, 18.7]];

// After each style load: add the vector source, 3D buildings, a glowing state border (so
// Karnataka reads distinct from its neighbours), and tame POI labels at low zoom so the
// overview stays clean while detail floods in on deep zoom.
/* eslint-disable @typescript-eslint/no-explicit-any */
function injectBuildings(map: maplibregl.Map) {
  try {
    if (!map.getSource("openmaptiles")) map.addSource("openmaptiles", OMT_SOURCE);
    const firstSym = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
    if (!map.getLayer("netra-buildings-3d")) map.addLayer(BUILDINGS_3D as any, firstSym);
    // District lines within the state — warm amber, clearly visible and distinct from the
    // cyan state edge. OpenFreeMap's tiles carry only admin_level 4 (state) for India, so we
    // draw Karnataka's district outlines from our own bundled GeoJSON (sovereign, offline-safe).
    if (!map.getSource("netra-districts"))
      map.addSource("netra-districts", { type: "geojson", data: `${import.meta.env.BASE_URL}karnataka-districts.geojson` } as any);
    if (!map.getLayer("netra-district-border"))
      map.addLayer({
        id: "netra-district-border", type: "line", source: "netra-districts",
        paint: {
          "line-color": "hsl(38,90%,60%)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.7, 8, 1.3, 11, 1.9, 14, 2.6],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.45, 8, 0.58, 11, 0.68],
          "line-dasharray": [2.5, 1.5],
        },
      } as any, firstSym);
    // Karnataka's edge — bright cyan, above the district lines.
    if (!map.getLayer("netra-state-border"))
      map.addLayer({
        id: "netra-state-border", type: "line", source: "openmaptiles", "source-layer": "boundary",
        filter: ["==", ["get", "admin_level"], 4],
        paint: {
          "line-color": "hsl(190,80%,58%)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.4, 9, 2.6, 13, 3.2],
          "line-opacity": 0.65,
        },
      } as any, firstSym);
    // Tame busy POI/minor labels below z11 so the state overview isn't cluttered.
    for (const l of map.getStyle().layers ?? []) {
      if (l.type === "symbol" && /poi|housenum|minor|village|hamlet|suburb/i.test(l.id)) {
        try { map.setLayerZoomRange(l.id, 11, 24); } catch { /* layer may lack zoom range */ }
      }
    }
  } catch { /* source/style not ready yet */ }
}

// Cool → hot density ramp (reads over both dark and satellite bases).
const HEAT: [number, number, number][] = [
  [22, 55, 100], [30, 100, 150], [56, 170, 178], [150, 200, 110],
  [244, 176, 62], [236, 96, 58], [206, 32, 52],
];
const HEAD_COLOR: Record<number, [number, number, number]> = {
  1: [245, 158, 11], 2: [239, 68, 68], 3: [236, 72, 153], 4: [168, 85, 247],
  5: [59, 130, 246], 6: [34, 211, 238], 7: [251, 146, 60], 8: [20, 184, 166], 9: [148, 163, 184],
};

// 3D lighting so the hexbin extrusions read as glowing terrain, not flat blocks.
const LIGHTING = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.05 }),
  key: new DirectionalLight({ color: [255, 246, 224], intensity: 1.55, direction: [-1, -3, -1.2] }),
  fill: new DirectionalLight({ color: [140, 180, 255], intensity: 0.7, direction: [2, 2, -1] }),
});

type Pt = { position: [number, number]; head: number; crimeNo: string; district: string; date: string; crimeType: string; gravity: string; status: string; weapon: string; t: number };
type Mode = "hex" | "points";
type Base = "dark" | "satellite";
export interface DistrictGeo { name: string; lat: number; lng: number; caseCount: number }

// Time-lapse: month index since Jan-2021, and a label for the scrubber.
const BASE_YEAR = 2021;
const TL_WINDOW = 9; // trailing months shown → hotspots visibly rise, migrate & fade
const monthIndex = (date: string) => (Number(date.slice(0, 4)) - BASE_YEAR) * 12 + (Number(date.slice(5, 7)) - 1);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const tLabel = (t: number) => `${MONTHS[((t % 12) + 12) % 12]} ${BASE_YEAR + Math.floor(t / 12)}`;

const MODES: { id: Mode; label: string }[] = [
  { id: "hex", label: "3D Density" },
  { id: "points", label: "Incidents" },
];

// Zoom-adaptive params — the fix for "looks good at one zoom, bad at another".
const hexRadius = (z: number) => Math.round(Math.max(300, 3400 / Math.pow(2, Math.max(0, z - 6) * 0.62)));
// Visible mounds at overview, still capped so deep zoom never spikes.
const hexElev = (z: number) => Math.min(50, 24 + Math.max(0, z - 7) * 3);

function buildLayers(mode: Mode, data: Pt[], z: number): Layer[] {
  if (mode === "hex")
    return [
      new HexagonLayer<Pt>({
        id: "hex",
        data,
        getPosition: (d) => d.position,
        radius: hexRadius(z),
        elevationScale: hexElev(z),
        elevationRange: [0, 1400],
        extruded: true,
        coverage: 0.92,
        pickable: false,
        colorRange: HEAT,
        upperPercentile: 99,
        material: { ambient: 0.55, diffuse: 0.7, shininess: 48, specularColor: [60, 80, 120] },
        opacity: 0.9,
        updateTriggers: { radius: z, elevationScale: z },
        transitions: { elevationScale: 300 },
      }),
    ];
  // Incidents: a soft glow halo under crisp dots. BOTH layers are pickable (the big halo
  // is a generous click target) so every click lands on a real dot and shows ITS own FIR.
  return [
    new ScatterplotLayer<Pt>({
      id: "glow",
      data,
      getPosition: (d) => d.position,
      getFillColor: (d) => [...(HEAD_COLOR[d.head] ?? [148, 163, 184]), 55] as [number, number, number, number],
      getRadius: 300,
      radiusMinPixels: 3,
      radiusMaxPixels: 10,
      pickable: false,
    }),
    new ScatterplotLayer<Pt>({
      id: "pts",
      data,
      getPosition: (d) => d.position,
      getFillColor: (d) => HEAD_COLOR[d.head] ?? [148, 163, 184],
      getRadius: 130,
      radiusMinPixels: 2,
      radiusMaxPixels: 5.5,
      opacity: 0.95,
      stroked: true,
      getLineColor: [8, 14, 26],
      lineWidthMinPixels: 0.5,
      pickable: true,
    }),
  ];
}

// Patrol-focus overlay: the predicted zone (translucent disc), the suggested picket ring, a
// dashed beat loop tying the pickets together, and text labels. Drawn over satellite/streets
// so a DSP sees the plan sitting on the actual ground. Honest: a ZONE, not an exact address.
function focusLayers(plan: PatrolPlan, ctx: Pt[]): Layer[] {
  const center: [number, number] = [plan.lng, plan.lat];
  const loop = [...plan.pickets.map((p) => [p.lng, p.lat] as [number, number])];
  if (loop.length > 1) loop.push(loop[0]);
  return [
    // Predicted risk zone — a soft filled disc + bright edge.
    new ScatterplotLayer<{ position: [number, number] }>({
      id: "focus-zone",
      data: [{ position: center }],
      getPosition: (d) => d.position,
      getRadius: plan.radiusM,
      radiusUnits: "meters",
      getFillColor: [34, 211, 238, 28],
      stroked: true,
      getLineColor: [34, 211, 238, 180],
      lineWidthMinPixels: 2,
      pickable: false,
    }),
    // Nearby real incidents inside the pocket → context (dim).
    new ScatterplotLayer<Pt>({
      id: "focus-ctx",
      data: ctx,
      getPosition: (d) => d.position,
      getFillColor: [148, 163, 184, 150],
      getRadius: 60,
      radiusMinPixels: 2,
      radiusMaxPixels: 5,
      pickable: false,
    }),
    // Beat loop tying the pickets together.
    new PathLayer<{ path: [number, number][] }>({
      id: "focus-loop",
      data: loop.length > 2 ? [{ path: loop }] : [],
      getPath: (d) => d.path,
      getColor: [34, 211, 238, 140],
      getWidth: 2.5,
      widthUnits: "pixels",
    }),
    // Suggested picket positions, coloured by kind.
    new ScatterplotLayer<PatrolPlan["pickets"][number]>({
      id: "focus-pickets",
      data: plan.pickets,
      getPosition: (p) => [p.lng, p.lat],
      getRadius: 130,
      radiusMinPixels: 7,
      radiusMaxPixels: 16,
      getFillColor: (p) => [...KIND_COLOR[p.kind], 235] as [number, number, number, number],
      stroked: true,
      getLineColor: [8, 14, 26],
      lineWidthMinPixels: 1.5,
      pickable: false,
    }),
    // Labels above each picket.
    new TextLayer<PatrolPlan["pickets"][number]>({
      id: "focus-labels",
      data: plan.pickets,
      getPosition: (p) => [p.lng, p.lat],
      getText: (p) => p.label,
      getSize: 12,
      getColor: [226, 232, 240, 255],
      getPixelOffset: [0, -18],
      background: true,
      getBackgroundColor: [10, 16, 30, 205],
      backgroundPadding: [5, 3],
      fontWeight: 600,
      outlineWidth: 0,
      getTextAnchor: "middle",
      getAlignmentBaseline: "bottom",
    }),
  ];
}

// A drag joystick that pans the map continuously while held (game-pad feel).
function Joystick({ onTick }: { onTick: (nx: number, ny: number) => void }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef(false);
  const raf = useRef(0);
  const val = useRef({ x: 0, y: 0 });
  const R = 26;
  function loop() {
    if (!active.current) return;
    const { x, y } = val.current;
    if (x || y) onTick(x / R, y / R);
    raf.current = requestAnimationFrame(loop);
  }
  function set(e: React.PointerEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    val.current = { x: dx, y: dy };
    setKnob({ x: dx, y: dy });
  }
  function down(e: React.PointerEvent) {
    active.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    set(e); cancelAnimationFrame(raf.current); loop();
  }
  function up() {
    active.current = false; cancelAnimationFrame(raf.current);
    val.current = { x: 0, y: 0 }; setKnob({ x: 0, y: 0 });
  }
  return (
    <div
      onPointerDown={down} onPointerMove={(e) => active.current && set(e)} onPointerUp={up} onPointerLeave={up}
      title="Drag to pan the map"
      className="relative h-16 w-16 cursor-grab touch-none rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur active:cursor-grabbing"
      style={{ boxShadow: "inset 0 0 12px rgba(0,0,0,0.4)" }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 rounded-full bg-[var(--color-accent)]"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`, boxShadow: "0 0 10px rgba(34,211,238,0.6)" }}
      />
    </div>
  );
}

function CtrlBtn({ onClick, label, title, active }: { onClick: () => void; label: string; title: string; active?: boolean }) {
  return (
    <button
      onClick={onClick} title={title} aria-label={title}
      className={`flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border)] text-sm backdrop-blur transition-colors ${
        active ? "bg-[var(--color-accent)] text-[var(--color-bg)]" : "bg-[var(--color-surface)]/90 text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
      }`}
    >
      {label}
    </button>
  );
}

export default function DeckMap({ districts, focus, onExitFocus }: { districts?: DistrictGeo[]; focus?: PatrolPlan | null; onExitFocus?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const zoomBucket = useRef(6);
  const ptsRef = useRef<Pt[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const nav = useNavigate();
  const navRef = useRef(nav);
  navRef.current = nav;
  const districtsRef = useRef<DistrictGeo[]>([]);
  useEffect(() => { districtsRef.current = districts ?? []; }, [districts]);
  const focusRef = useRef(false);
  useEffect(() => { focusRef.current = !!focus; }, [focus]);
  const [hover, setHover] = useState<{ x: number; y: number; name: string; count: number } | null>(null);
  const [pts, setPts] = useState<Pt[] | null>(null);
  const [mode, setMode] = useState<Mode>("hex");
  const [base, setBase] = useState<Base>("dark");
  const [z, setZ] = useState(6);
  const [timelapse, setTimelapse] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [curT, setCurT] = useState(0);

  const maxT = useMemo(() => (pts && pts.length ? Math.max(...pts.map((p) => p.t)) : 0), [pts]);
  // Incidents per month → the timeline strip's bar chart.
  const monthCounts = useMemo(() => {
    const c = new Array(maxT + 1).fill(0);
    if (pts) for (const p of pts) if (p.t >= 0 && p.t <= maxT) c[p.t]++;
    return c;
  }, [pts, maxT]);
  const maxMonthCount = useMemo(() => Math.max(1, ...monthCounts), [monthCounts]);
  // Smooth filled area path (0..1000 × 0..100) for the professional timeline sparkline.
  const tlPath = useMemo(() => {
    const W = 1000, H = 100, m = Math.max(1, maxT);
    const pts = monthCounts.map((c, t) => `${((t / m) * W).toFixed(1)},${(H - (c / maxMonthCount) * 86).toFixed(1)}`);
    return pts.length ? `M0,${H} L${pts.join(" L")} L${W},${H} Z` : "";
  }, [monthCounts, maxT, maxMonthCount]);
  const tlRef = useRef<SVGSVGElement>(null);
  function tlSeek(clientX: number) {
    const el = tlRef.current; if (!el || !maxT) return;
    const r = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    setPlaying(false); setTimelapse(true); setCurT(Math.round(frac * maxT));
  }
  // Points visible at the current time-lapse frame (trailing window). Off → everything.
  const visible = useMemo(() => {
    if (!pts) return [];
    if (!timelapse) return pts;
    return pts.filter((p) => p.t <= curT && p.t > curT - TL_WINDOW);
  }, [pts, timelapse, curT]);

  // Playback: advance one month per tick, loop at the end.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setCurT((t) => (t >= maxT ? 0 : t + 1)), 240);
    return () => clearInterval(id);
  }, [playing, maxT]);

  function enterTimelapse() { setTimelapse(true); setCurT(0); setPlaying(true); }
  function exitTimelapse() { setPlaying(false); setTimelapse(false); }

  // Map-control cluster (joystick + buttons) → drive the MapLibre camera.
  // Eased, lower-sensitivity pan (quadratic) so the joystick glides instead of darting.
  const panTick = (nx: number, ny: number) => mapRef.current?.panBy([nx * Math.abs(nx) * 9, ny * Math.abs(ny) * 9], { duration: 0 });
  const rotate = (deg: number) => { const m = mapRef.current; if (m) m.easeTo({ bearing: m.getBearing() + deg, duration: 300 }); };
  const tilt = (d: number) => { const m = mapRef.current; if (m) m.easeTo({ pitch: Math.max(0, Math.min(75, m.getPitch() + d)), duration: 300 }); };
  const zoomBy = (d: number) => { const m = mapRef.current; if (m) m.easeTo({ zoom: m.getZoom() + d, duration: 250 }); };
  const home = () => mapRef.current?.easeTo({ center: [76.2, 14.9], zoom: 5.9, pitch: 48, bearing: -12, duration: 600 });

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}incident-points.json`)
      .then((r) => r.json())
      .then((raw: [number, number, number, string, string, string, string, string, string, string][]) =>
        setPts(
          raw.map(([lat, lng, head, crimeNo, district, date, crimeType, gravity, status, weapon]) => ({
            position: [lng, lat], head, crimeNo, district, date, crimeType,
            gravity: gravity ?? "Non-Heinous", status: status ?? "Under Investigation", weapon: weapon ?? "—",
            t: monthIndex(date),
          }))
        )
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OFM_DARK,
      center: [76.2, 14.9],
      zoom: 5.9,
      minZoom: 5.4,
      maxZoom: 18,
      maxBounds: KA_BOUNDS,
      pitch: 48,
      bearing: -12,
      attributionControl: false,
      dragRotate: true,
      fadeDuration: 0,            // tiles pop in instantly instead of a slow cross-fade
      maxTileCacheSize: 800,     // keep more tiles cached → snappy pan/zoom + repeat views
      refreshExpiredTiles: false,
    });
    // 3D buildings after every style load; if OpenFreeMap is unreachable, fall back to CartoDB dark.
    map.on("style.load", () => injectBuildings(map));
    let fellBack = false;
    setTimeout(() => { if (!fellBack && !map.isStyleLoaded()) { fellBack = true; map.setStyle(FALLBACK_DARK); } }, 7000);
    const overlay = new MapboxOverlay({ interleaved: false, layers: [], effects: [LIGHTING], pickingRadius: 8 });
    map.addControl(overlay as unknown as maplibregl.IControl);
    // Deterministic picking: find the incident NEAREST the click in real coords, and show it
    // only if within ~16px on screen. Fresh every click — no stale deck picking buffer (the bug
    // where every click kept showing the first FIR).
    map.on("click", (e) => {
      if (focusRef.current) return; // patrol-focus mode — no FIR popups
      const data = ptsRef.current;
      if (!data.length) return;
      const ll = map.unproject(e.point);
      let best: Pt | null = null;
      let bestD = Infinity;
      for (const pt of data) {
        const dx = pt.position[0] - ll.lng;
        const dy = pt.position[1] - ll.lat;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = pt; }
      }
      if (!best) return popupRef.current?.remove();
      const sp = map.project(best.position);
      if (Math.hypot(sp.x - e.point.x, sp.y - e.point.y) > 16) return popupRef.current?.remove();
      const grav = best.gravity.startsWith("Hein") ? "#f87171" : "#94a3b8";
      const weaponLine = best.weapon && !best.weapon.startsWith("None")
        ? `<div style="color:#cbd5e1;font-size:11px;margin-top:2px">🔪 ${best.weapon}</div>` : "";
      const html =
        `<div style="line-height:1.5;min-width:184px">` +
        `<div style="font-variant-numeric:tabular-nums;color:#64748b;font-size:10px">${best.crimeNo}</div>` +
        `<div style="font-weight:600;color:#e2e8f0;margin-top:2px">${best.crimeType}</div>` +
        `<div style="margin-top:4px"><span style="font-size:10px;padding:1px 6px;border-radius:6px;background:rgba(148,163,184,0.15);color:${grav}">${best.gravity}</span> <span style="font-size:10px;color:#94a3b8">· ${best.status}</span></div>` +
        weaponLine +
        `<div style="color:#94a3b8;font-size:11px;margin-top:3px">${best.district} · ${best.date}</div>` +
        `<a href="#" class="netra-open-case" data-cn="${best.crimeNo}" style="display:inline-block;margin-top:6px;font-size:11px;color:#22d3ee;text-decoration:none">Open in Case Search →</a>` +
        `</div>`;
      if (!popupRef.current)
        popupRef.current = new maplibregl.Popup({
          closeButton: true, closeOnClick: false, offset: 14, maxWidth: "250px", className: "netra-pop",
        });
      // Anchored to the dot's lng/lat → follows the map on pan/zoom, and updates instantly to
      // whichever dot is nearest the new click.
      popupRef.current.setLngLat(best.position).setHTML(html).addTo(map);
    });
    // "Open in Case Search" link inside the FIR popup → route there with the FIR number.
    const onContainerClick = (ev: MouseEvent) => {
      const a = (ev.target as HTMLElement)?.closest?.(".netra-open-case") as HTMLElement | null;
      if (a) { ev.preventDefault(); navRef.current(`/cases?q=${a.getAttribute("data-cn")}`); }
    };
    map.getContainer().addEventListener("click", onContainerClick);
    // Hover (zoomed out) → nearest district's FIR count, for a quick DSP compare.
    map.on("mousemove", (e) => {
      const ds = districtsRef.current;
      if (!ds.length || map.getZoom() >= 9.5) { setHover((h) => (h ? null : h)); return; }
      let best: DistrictGeo | null = null, bestD = Infinity;
      for (const d of ds) {
        const dx = d.lng - e.lngLat.lng, dy = d.lat - e.lngLat.lat, dd = dx * dx + dy * dy;
        if (dd < bestD) { bestD = dd; best = d; }
      }
      if (best) setHover({ x: e.point.x, y: e.point.y, name: best.name, count: best.caseCount });
    });
    map.on("mouseout", () => setHover(null));
    // Zoom-adaptive: bucket zoom to 0.3 steps so layers refine as you go deep without thrashing.
    map.on("zoom", () => {
      const nz = map.getZoom();
      if (Math.abs(nz - zoomBucket.current) >= 0.3) {
        zoomBucket.current = nz;
        setZ(nz);
      }
    });
    mapRef.current = map;
    overlayRef.current = overlay;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (import.meta.env.DEV) (window as any).__netraMap = map;
    return () => {
      map.getContainer().removeEventListener("click", onContainerClick);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  // Swap base map (dark ↔ satellite). Overlaid deck canvas persists across setStyle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(base === "dark" ? OFM_DARK : SAT_STYLE);
  }, [base]);

  // Patrol focus: fly into the predicted pocket (satellite + street detail) so the plan sits on
  // the real ground; exiting flies back to the state overview and restores the previous base.
  const prevBase = useRef<Base>("dark");
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (focus) {
      prevBase.current = base;
      if (base !== "satellite") setBase("satellite");
      popupRef.current?.remove();
      map.easeTo({ center: [focus.lng, focus.lat], zoom: 13.2, pitch: 55, bearing: 0, duration: 1500 });
    } else {
      map.easeTo({ center: [76.2, 14.9], zoom: 5.9, pitch: 48, bearing: -12, duration: 900 });
      if (prevBase.current !== base) setBase(prevBase.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  // Real incidents inside the focused pocket → light context under the plan.
  const focusCtx = useMemo(() => {
    if (!focus || !pts) return [];
    return pts.filter((p) => Math.abs(p.position[0] - focus.lng) < 0.045 && Math.abs(p.position[1] - focus.lat) < 0.045);
  }, [focus, pts]);

  useEffect(() => {
    if (!overlayRef.current || !pts) return;
    if (focus) {
      // Patrol-focus mode replaces the density/incident layers with the deployment overlay.
      overlayRef.current.setProps({ layers: focusLayers(focus, focusCtx), effects: [LIGHTING] });
      return;
    }
    // Density hexbins are for the overview; past street zoom, show incident dots instead
    // (a single deep hexbin becomes a giant pillar that blocks the 3D buildings).
    const effMode: Mode = mode === "hex" && z > 12.5 ? "points" : mode;
    overlayRef.current.setProps({ layers: buildLayers(effMode, visible, z), effects: [LIGHTING] });
  }, [visible, mode, z, pts, focus, focusCtx]);

  // Keep a ref of points for the (once-bound) click handler.
  useEffect(() => { ptsRef.current = pts ?? []; }, [pts]);

  // Clear popup on mode/base change.
  useEffect(() => { popupRef.current?.remove(); }, [mode, base]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl" style={{ background: "#0b1220" }}>
      <div ref={containerRef} className="h-full w-full" />

      {/* District hover-count (zoomed out) */}
      {hover && (
        <div
          className="pointer-events-none absolute z-[1500] rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)]/95 px-2 py-1 text-[11px] backdrop-blur"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <span className="font-medium text-[var(--color-text)]">{hover.name}</span>
          <span className="tnum ml-1.5 text-[var(--color-accent)]">{hover.count.toLocaleString()} FIRs</span>
        </div>
      )}

      {/* Patrol-focus banner + legend + exit */}
      {focus && (
        <div className="absolute left-1/2 top-3 z-[1200] flex max-w-[92%] -translate-x-1/2 items-center gap-3 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-surface)]/95 px-3 py-2 backdrop-blur">
          <span className="flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--color-accent)]" />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-[var(--color-text)]">
              Patrol focus · {focus.district} · {focus.crimeType}
            </div>
            <div className="truncate text-[10px] text-[var(--color-text-mute)]">
              {focus.units} units · {focus.window} · predicted zone (~{(focus.radiusM / 1000).toFixed(1)} km), not an exact address
            </div>
          </div>
          <button
            onClick={() => onExitFocus?.()}
            className="ml-1 shrink-0 rounded-md border border-[var(--color-border-strong)] px-2 py-1 text-[11px] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            Exit ✕
          </button>
        </div>
      )}

      {/* Controls: base + mode */}
      <div className={`absolute left-3 top-3 z-[1000] flex flex-col gap-2 ${focus ? "pointer-events-none opacity-40" : ""}`}>
        <div className="flex overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-3 py-1.5 text-xs transition-colors ${
                mode === m.id ? "bg-[var(--color-accent)] text-[var(--color-bg)]" : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex w-fit overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur">
          {(["dark", "satellite"] as Base[]).map((b) => (
            <button
              key={b}
              onClick={() => setBase(b)}
              className={`px-3 py-1 text-[11px] capitalize transition-colors ${
                base === b ? "bg-[var(--color-accent)] text-[var(--color-bg)]" : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Dark styling for the MapLibre-native FIR popup (anchored to the dot; follows the map). */}
      <style>{`
        .netra-pop { z-index: 20 !important; }
        .netra-pop .maplibregl-popup-content {
          background: rgba(17,26,46,0.97); border: 1px solid var(--color-accent-dim, #24507e);
          border-radius: 10px; padding: 10px 12px; box-shadow: 0 10px 28px rgba(0,0,0,0.55);
          color: #cbd5e1; font-size: 12px;
        }
        .netra-pop .maplibregl-popup-tip { border-top-color: rgba(17,26,46,0.97); border-bottom-color: rgba(17,26,46,0.97); }
        .netra-pop .maplibregl-popup-close-button { color: #7c8aa0; font-size: 16px; padding: 0 7px; line-height: 1.4; }
        .netra-pop .maplibregl-popup-close-button:hover { color: #e2e8f0; background: transparent; }
      `}</style>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-[4.75rem] left-3 z-[1000] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/90 p-2 text-[10px] text-[var(--color-text-dim)] backdrop-blur">
        <div className="mb-1 font-medium text-[var(--color-text)]">
          {mode === "points" ? "Incident type · click a dot" : "Crime density"}
        </div>
        {mode === "points" ? (
          <div className="flex flex-wrap gap-x-2 gap-y-1" style={{ maxWidth: 210 }}>
            {[[1, "Property"], [2, "Body"], [3, "Women"], [5, "Economic"], [6, "Cyber"], [8, "Special"]].map(
              ([k, label]) => (
                <span key={k as number} className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: `rgb(${HEAD_COLOR[k as number].join(",")})` }} />
                  {label}
                </span>
              )
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span>low</span>
            <span className="h-2 w-24 rounded" style={{ background: "linear-gradient(90deg,rgb(22,55,100),rgb(56,170,178),rgb(244,176,62),rgb(206,32,52))" }} />
            <span>high</span>
          </div>
        )}
      </div>

      {/* Map-control cluster: joystick (pan) + buttons (zoom / rotate / tilt / home / time-lapse) */}
      <div className="absolute bottom-[4.75rem] right-3 z-[1000] flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <CtrlBtn onClick={() => zoomBy(1)} label="+" title="Zoom in" />
            <CtrlBtn onClick={() => zoomBy(-1)} label="−" title="Zoom out" />
            <CtrlBtn onClick={() => tilt(8)} label="⤊" title="Tilt up" />
            <CtrlBtn onClick={() => tilt(-8)} label="⤋" title="Tilt down" />
          </div>
          <div className="flex gap-1">
            <CtrlBtn onClick={() => rotate(-20)} label="⟲" title="Rotate left" />
            <CtrlBtn onClick={() => rotate(20)} label="⟳" title="Rotate right" />
            <CtrlBtn onClick={home} label="⌂" title="Reset view" />
          </div>
        </div>
        <Joystick onTick={panTick} />
      </div>

      {/* Month timeline strip — incidents-per-month bar chart that doubles as the scrubber.
          Click a month to jump; ▶ animates; "All" shows every month. */}
      {maxT > 0 && (
        <div className="absolute bottom-2 left-2 right-2 z-[1000] flex items-end gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-2 backdrop-blur">
          <button
            onClick={() => { if (!timelapse) enterTimelapse(); else setPlaying((p) => !p); }}
            className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent)] text-sm text-[var(--color-bg)]"
            title={timelapse && playing ? "Pause" : "Play time-lapse"}
          >
            {timelapse && playing ? "⏸" : "▶"}
          </button>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center justify-between text-[9px] text-[var(--color-text-mute)]">
              <span>{2021 + Math.floor(0)}</span>
              <span className="font-medium text-[var(--color-text)]">{timelapse ? tLabel(curT) : "All months · incident volume"}</span>
              <span>{2021 + Math.floor(maxT / 12)}</span>
            </div>
            <svg
              ref={tlRef} viewBox="0 0 1000 100" preserveAspectRatio="none" className="h-8 w-full cursor-ew-resize"
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); tlSeek(e.clientX); }}
              onPointerMove={(e) => { if (e.buttons) tlSeek(e.clientX); }}
            >
              {/* year gridlines */}
              {Array.from({ length: Math.floor(maxT / 12) + 1 }, (_, y) => (
                <line key={y} x1={(y * 12 / Math.max(1, maxT)) * 1000} y1="0" x2={(y * 12 / Math.max(1, maxT)) * 1000} y2="100" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
              ))}
              <path d={tlPath} fill="rgba(148,163,184,0.10)" stroke="rgba(148,163,184,0.45)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              {timelapse && (
                <g>
                  <rect x={(Math.max(0, curT - TL_WINDOW) / Math.max(1, maxT)) * 1000} y="0"
                    width={((Math.min(curT, TL_WINDOW)) / Math.max(1, maxT)) * 1000} height="100" fill="var(--color-accent)" fillOpacity="0.14" />
                  <line x1={(curT / Math.max(1, maxT)) * 1000} y1="0" x2={(curT / Math.max(1, maxT)) * 1000} y2="100" stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </g>
              )}
            </svg>
          </div>
          {timelapse && (
            <button onClick={exitTimelapse} className="mb-0.5 shrink-0 rounded-md border border-[var(--color-border)] px-2 py-1 text-[10px] text-[var(--color-text-mute)] hover:text-[var(--color-text)]" title="Show all months">All</button>
          )}
        </div>
      )}
    </div>
  );
}
