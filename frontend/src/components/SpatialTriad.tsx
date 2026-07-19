// Spatial Intelligence — for one serial cluster, on the same MapLibre + deck.gl engine as the
// Command Map, but scoped to a single offender. Three things a DSP reads at a glance, each its
// own clear colour + on-map label:
//   ⚪ WHERE HE'S BEEN   — the crime locations joined in date order (1→N), a clean connected path
//   🟥 LIKELY BASE AREA  — Rossmo geographic-profile zone (a place, not a person)
//   🔵 NEXT TARGET AREA  — predicted next-strike zone + window
// Satellite base (real ground) with fast render; a Dark toggle. Data: public/spatial.json.
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer, PathLayer, TextLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";

const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const SAT_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: GLYPHS,
  sources: {
    sat: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Esri World Imagery" },
    ref: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"], tileSize: 256 },
  },
  layers: [
    { id: "sat", type: "raster", source: "sat" },
    { id: "ref", type: "raster", source: "ref", paint: { "raster-opacity": 0.8 } },
  ],
};
const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
// Red probability ramp for the base zone (transparent → deep red) — reads as "somewhere in here".
const BASE_RAMP: [number, number, number][] = [
  [30, 12, 20], [90, 20, 40], [150, 30, 50], [200, 45, 55], [235, 70, 70], [248, 113, 113],
];

interface RoutePt { order: number; caseNo: string; date: string; district: string; lat: number; lng: number }
export interface SpatialRec {
  clusterId: string;
  label: string;
  route: RoutePt[];
  rossmo: { anchor: { lat: number; lng: number }; surface: { lat: number; lng: number; w: number }[]; bufferKm: number; note: string };
  nextStrike: { lat: number; lng: number; district: string; window: string; timeWindow: string; confidence: number; cadenceDays: number };
}

const distM = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const dLat = (aLat - bLat) * 111_000;
  const dLng = (aLng - bLng) * 111_000 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

export default function SpatialTriad({ spatial }: { spatial: SpatialRec }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [base, setBase] = useState<"satellite" | "dark">("satellite");

  // Base-zone radius from the Rossmo surface spread → a next-strike zone of similar feel.
  const baseRadiusM = useMemo(() => {
    const a = spatial.rossmo.anchor;
    const ds = spatial.rossmo.surface.map((p) => distM(a.lat, a.lng, p.lat, p.lng)).sort((x, y) => x - y);
    return Math.min(18000, Math.max(4000, ds[Math.floor(ds.length * 0.7)] || 8000));
  }, [spatial]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SAT_STYLE,
      center: [spatial.route[0].lng, spatial.route[0].lat],
      zoom: 7,
      attributionControl: false,
      dragRotate: true,
      fadeDuration: 0,            // tiles pop in instantly
      maxTileCacheSize: 600,      // snappy pan/zoom
      refreshExpiredTiles: false,
    });
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
    mapRef.current = map;
    overlayRef.current = overlay;
    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap base map (satellite ↔ dark). Deck overlay persists across setStyle.
  useEffect(() => {
    mapRef.current?.setStyle(base === "satellite" ? SAT_STYLE : DARK_STYLE);
  }, [base]);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;

    const route = spatial.route;
    const path = route.map((p) => [p.lng, p.lat] as [number, number]);
    const a = spatial.rossmo.anchor;
    const ns = spatial.nextStrike;

    const layers: Layer[] = [
      // 🟥 Likely base area — Rossmo probability surface, tuned to a defined red zone.
      new HeatmapLayer<{ lat: number; lng: number; w: number }>({
        id: "base-zone",
        data: spatial.rossmo.surface,
        getPosition: (d) => [d.lng, d.lat],
        getWeight: (d) => d.w,
        radiusPixels: 42,
        intensity: 1,
        threshold: 0.05,
        colorRange: BASE_RAMP,
        opacity: 0.6,
      }),
      // 🔵 Next target area — a translucent zone (prediction is an AREA, not a point).
      new ScatterplotLayer<{ lat: number; lng: number }>({
        id: "next-zone",
        data: [ns],
        getPosition: (d) => [d.lng, d.lat],
        getRadius: baseRadiusM * 0.7,
        radiusUnits: "meters",
        radiusMaxPixels: 120,
        getFillColor: [59, 130, 246, 45],
        stroked: true,
        getLineColor: [96, 165, 250, 220],
        lineWidthMinPixels: 1.5,
      }),
      // ⚪ Crime route — the actual locations joined in date order (connected, not random arcs).
      new PathLayer<{ path: [number, number][] }>({
        id: "route-line",
        data: path.length > 1 ? [{ path }] : [],
        getPath: (d) => d.path,
        getColor: [237, 242, 255, 230],
        getWidth: 2.5,
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
      }),
      new ScatterplotLayer<RoutePt>({
        id: "crimes",
        data: route,
        getPosition: (d) => [d.lng, d.lat],
        getFillColor: [15, 23, 42, 235],
        stroked: true,
        getLineColor: [237, 242, 255, 240],
        lineWidthMinPixels: 1.5,
        getRadius: 9,
        radiusUnits: "pixels",
      }),
      new TextLayer<RoutePt>({
        id: "route-order",
        data: route,
        getPosition: (d) => [d.lng, d.lat],
        getText: (d) => String(d.order),
        getSize: 11,
        getColor: [237, 242, 255, 255],
        fontWeight: 700,
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
      }),
      // Anchor ring for the base
      new ScatterplotLayer<{ lat: number; lng: number }>({
        id: "anchor",
        data: [a],
        getPosition: (d) => [d.lng, d.lat],
        getFillColor: [244, 63, 94, 220],
        stroked: true,
        getLineColor: [255, 255, 255, 230],
        lineWidthMinPixels: 2,
        getRadius: 7,
        radiusUnits: "pixels",
      }),
      // Next-strike marker
      new ScatterplotLayer<{ lat: number; lng: number }>({
        id: "next-mark",
        data: [ns],
        getPosition: (d) => [d.lng, d.lat],
        getFillColor: [59, 130, 246, 240],
        stroked: true,
        getLineColor: [255, 255, 255, 230],
        lineWidthMinPixels: 2,
        getRadius: 7,
        radiusUnits: "pixels",
      }),
      // On-map labels so it's self-explanatory at a glance. Base label sits ABOVE its anchor,
      // next-target label BELOW its marker, so they never collide when the two are close.
      new TextLayer<{ position: [number, number]; text: string; color: [number, number, number]; off: [number, number]; baseline: "top" | "bottom" }>({
        id: "zone-labels",
        data: [
          { position: [a.lng, a.lat], text: "LIKELY BASE AREA", color: [248, 113, 113], off: [0, -14], baseline: "bottom" },
          { position: [ns.lng, ns.lat], text: "NEXT TARGET AREA", color: [96, 165, 250], off: [0, 16], baseline: "top" },
        ],
        getPosition: (d) => d.position,
        getText: (d) => d.text,
        getColor: (d) => d.color,
        getSize: 12,
        fontWeight: 700,
        getPixelOffset: (d) => d.off,
        background: true,
        getBackgroundColor: [8, 12, 24, 225],
        backgroundPadding: [5, 3],
        getTextAnchor: "middle",
        getAlignmentBaseline: (d) => d.baseline,
      }),
    ];
    overlay.setProps({ layers });

    // Fit to everything.
    const pts = [...path, [a.lng, a.lat] as [number, number], [ns.lng, ns.lat] as [number, number]];
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 56, duration: 500, maxZoom: 10 }
    );
  }, [spatial, baseRadiusM]);

  const ns = spatial.nextStrike;
  return (
    <div className="space-y-2">
      <div className="relative">
        <div ref={containerRef} className="h-[320px] w-full overflow-hidden rounded-lg" style={{ background: "#0b1220" }} />
        <div className="absolute left-2 top-2 z-10 flex overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur">
          {(["satellite", "dark"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBase(b)}
              className={`px-2.5 py-1 text-[11px] capitalize transition-colors ${base === b ? "bg-[var(--color-accent)] text-[var(--color-bg)]" : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"}`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--color-text-dim)]">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-[#edf2ff]" /> Crime route (1→{spatial.route.length}, in date order)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#f43f5e]" /> Likely base area</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#3b82f6]" /> Next target area</span>
      </div>
      <div className="rounded-lg border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/5 p-2.5 text-xs">
        <span className="font-semibold text-[var(--color-warn)]">⚠ Next-strike forecast: </span>
        <span className="text-[var(--color-text-dim)]">
          {ns.district} · {ns.window} · {ns.timeWindow} · <span className="tnum">{Math.round(ns.confidence * 100)}%</span> confidence
        </span>
      </div>
      <div className="text-[10px] leading-relaxed text-[var(--color-text-mute)]">
        Reconstructed from crime locations alone: past route (⚪), the offender&rsquo;s likely base <em>zone</em> (🟥 Rossmo geographic profile — a place, not a person), and the next likely target <em>zone</em> (🔵). Decision support, human-in-the-loop · synthetic data.
      </div>
    </div>
  );
}
