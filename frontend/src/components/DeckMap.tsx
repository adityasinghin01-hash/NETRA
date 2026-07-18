// GPU crime map — MapLibre GL (dark vector OR Esri satellite base) + deck.gl overlay.
// The "money shot": zoom-adaptive 3D lit hexbin terrain, an adaptive GPU heatmap, and
// glowing clickable incident dots that open the real FIR. Imperative MapLibre +
// MapboxOverlay (robust under React 19 / Vite). Data: public/incident-points.json
// ([lat, lng, crimeHead, crimeNo, district, date, crimeType]).
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import { LightingEffect, AmbientLight, DirectionalLight } from "@deck.gl/core";
import type { Layer } from "@deck.gl/core";

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

// Add the vector source (if missing) + the 3D-buildings layer, under the first label layer.
/* eslint-disable @typescript-eslint/no-explicit-any */
function injectBuildings(map: maplibregl.Map) {
  try {
    if (!map.getSource("openmaptiles")) map.addSource("openmaptiles", OMT_SOURCE);
    if (!map.getLayer("netra-buildings-3d")) {
      const firstSym = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
      map.addLayer(BUILDINGS_3D as any, firstSym);
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

type Pt = { position: [number, number]; head: number; crimeNo: string; district: string; date: string; crimeType: string; t: number };
type Mode = "hex" | "points";
type Base = "dark" | "satellite";

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
// Capped so the "terrain" reads as gentle mounds, not towering spikes, at every zoom.
const hexElev = (z: number) => Math.min(42, 12 + Math.max(0, z - 7) * 4);

function buildLayers(mode: Mode, data: Pt[], z: number): Layer[] {
  if (mode === "hex")
    return [
      new HexagonLayer<Pt>({
        id: "hex",
        data,
        getPosition: (d) => d.position,
        radius: hexRadius(z),
        elevationScale: hexElev(z),
        elevationRange: [0, 1100],
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

export default function DeckMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const zoomBucket = useRef(6);
  const ptsRef = useRef<Pt[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [pts, setPts] = useState<Pt[] | null>(null);
  const [mode, setMode] = useState<Mode>("hex");
  const [base, setBase] = useState<Base>("dark");
  const [z, setZ] = useState(6);
  const [timelapse, setTimelapse] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [curT, setCurT] = useState(0);

  const maxT = useMemo(() => (pts && pts.length ? Math.max(...pts.map((p) => p.t)) : 0), [pts]);
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
  const panTick = (nx: number, ny: number) => mapRef.current?.panBy([nx * 16, ny * 16], { duration: 0 });
  const rotate = (deg: number) => { const m = mapRef.current; if (m) m.easeTo({ bearing: m.getBearing() + deg, duration: 300 }); };
  const tilt = (d: number) => { const m = mapRef.current; if (m) m.easeTo({ pitch: Math.max(0, Math.min(75, m.getPitch() + d)), duration: 300 }); };
  const zoomBy = (d: number) => { const m = mapRef.current; if (m) m.easeTo({ zoom: m.getZoom() + d, duration: 250 }); };
  const home = () => mapRef.current?.easeTo({ center: [76.2, 14.9], zoom: 5.9, pitch: 48, bearing: -12, duration: 600 });

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}incident-points.json`)
      .then((r) => r.json())
      .then((raw: [number, number, number, string, string, string, string][]) =>
        setPts(
          raw.map(([lat, lng, head, crimeNo, district, date, crimeType]) => ({
            position: [lng, lat], head, crimeNo, district, date, crimeType, t: monthIndex(date),
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
      const html =
        `<div style="line-height:1.55">` +
        `<div style="font-variant-numeric:tabular-nums;color:#94a3b8;font-size:11px">${best.crimeNo}</div>` +
        `<div style="font-weight:600;color:#e2e8f0;margin-top:2px">${best.crimeType}</div>` +
        `<div style="color:#94a3b8;margin-top:1px">${best.district} · ${best.date}</div>` +
        `<div style="color:#64748b;font-size:10px;margin-top:4px">Real FIR from the 50k dataset</div>` +
        `</div>`;
      if (!popupRef.current)
        popupRef.current = new maplibregl.Popup({
          closeButton: true, closeOnClick: false, offset: 14, maxWidth: "250px", className: "netra-pop",
        });
      // Anchored to the dot's lng/lat → follows the map on pan/zoom, and updates instantly to
      // whichever dot is nearest the new click.
      popupRef.current.setLngLat(best.position).setHTML(html).addTo(map);
    });
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

  useEffect(() => {
    if (!overlayRef.current || !pts) return;
    overlayRef.current.setProps({ layers: buildLayers(mode, visible, z), effects: [LIGHTING] });
  }, [visible, mode, z, pts]);

  // Keep a ref of points for the (once-bound) click handler.
  useEffect(() => { ptsRef.current = pts ?? []; }, [pts]);

  // Clear popup on mode/base change.
  useEffect(() => { popupRef.current?.remove(); }, [mode, base]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl" style={{ background: "#0b1220" }}>
      <div ref={containerRef} className="h-full w-full" />

      {/* Controls: base + mode */}
      <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-2">
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
      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/90 p-2 text-[10px] text-[var(--color-text-dim)] backdrop-blur">
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
      <div className="absolute bottom-3 right-3 z-[1000] flex items-end gap-2">
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
            <CtrlBtn onClick={() => (timelapse ? exitTimelapse() : enterTimelapse())} label="⏱" title="Time-lapse" active={timelapse} />
          </div>
        </div>
        <Joystick onTick={panTick} />
      </div>

      {/* Time-lapse scrubber (top-center, clear of the control cluster) */}
      {timelapse && (
        <div className="absolute top-3 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-[var(--color-accent-dim)] bg-[var(--color-surface)]/95 px-3 py-2 backdrop-blur">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-accent)] text-sm text-[var(--color-bg)]"
            title={playing ? "Pause" : "Play"}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <input
            type="range" min={0} max={maxT || 1} value={curT}
            onChange={(e) => { setPlaying(false); setCurT(Number(e.target.value)); }}
            className="w-56 accent-[var(--color-accent)]"
          />
          <span className="tnum w-20 text-center text-xs text-[var(--color-text)]">{tLabel(curT)}</span>
          <button onClick={exitTimelapse} className="text-[var(--color-text-mute)] hover:text-[var(--color-text)]" title="Exit time-lapse">✕</button>
        </div>
      )}
    </div>
  );
}
