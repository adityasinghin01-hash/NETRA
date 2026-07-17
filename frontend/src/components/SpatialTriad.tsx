// Spatial Intelligence Triad — for one serial cluster, on the same MapLibre+deck.gl engine:
//   • WHERE HE'S BEEN  — chronological crime-route ArcLayer (1→N across districts)
//   • WHERE HE'S BASED — Rossmo geographic-profile heat zone + predicted anchor
//   • WHERE HE'LL STRIKE NEXT — next-strike marker
// Data: public/spatial.json (build_spatial.py). Read-only, auto-fits to the cluster.
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer, ArcLayer, TextLayer } from "@deck.gl/layers";

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const ROSSMO_RAMP: [number, number, number][] = [
  [40, 20, 60], [110, 30, 90], [180, 40, 90], [230, 70, 70], [245, 140, 55], [250, 200, 90],
];

interface RoutePt { order: number; caseNo: string; date: string; district: string; lat: number; lng: number }
export interface SpatialRec {
  clusterId: string;
  label: string;
  route: RoutePt[];
  rossmo: { anchor: { lat: number; lng: number }; surface: { lat: number; lng: number; w: number }[]; bufferKm: number; note: string };
  nextStrike: { lat: number; lng: number; district: string; window: string; timeWindow: string; confidence: number; cadenceDays: number };
}

export default function SpatialTriad({ spatial }: { spatial: SpatialRec }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [spatial.route[0].lng, spatial.route[0].lat],
      zoom: 7,
      attributionControl: false,
      dragRotate: false,
    });
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    overlayRef.current = overlay;
    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;

    const route = spatial.route;
    const arcs = route.slice(0, -1).map((p, i) => ({ from: p, to: route[i + 1] }));

    overlay.setProps({
      layers: [
        // Rossmo base-zone heat
        new HeatmapLayer({
          id: "rossmo",
          data: spatial.rossmo.surface,
          getPosition: (d: { lng: number; lat: number }) => [d.lng, d.lat],
          getWeight: (d: { w: number }) => d.w,
          radiusPixels: 55,
          intensity: 1.3,
          threshold: 0.03,
          colorRange: ROSSMO_RAMP,
          opacity: 0.55,
        }),
        // Crime route arcs (chronological)
        new ArcLayer({
          id: "route",
          data: arcs,
          getSourcePosition: (d: { from: RoutePt }) => [d.from.lng, d.from.lat],
          getTargetPosition: (d: { to: RoutePt }) => [d.to.lng, d.to.lat],
          getSourceColor: [34, 211, 238],
          getTargetColor: [130, 90, 255],
          getWidth: 2.5,
          getHeight: 0.4,
        }),
        // Crime points
        new ScatterplotLayer({
          id: "crimes",
          data: route,
          getPosition: (d: RoutePt) => [d.lng, d.lat],
          getFillColor: [34, 211, 238],
          getLineColor: [8, 14, 26],
          stroked: true,
          lineWidthMinPixels: 1,
          getRadius: 6,
          radiusUnits: "pixels",
        }),
        new TextLayer({
          id: "order",
          data: route,
          getPosition: (d: RoutePt) => [d.lng, d.lat],
          getText: (d: RoutePt) => String(d.order),
          getSize: 11,
          getColor: [8, 14, 26],
          fontWeight: 700,
        }),
        // Predicted base (anchor) — red ring
        new ScatterplotLayer({
          id: "anchor",
          data: [spatial.rossmo.anchor],
          getPosition: (d: { lng: number; lat: number }) => [d.lng, d.lat],
          getFillColor: [0, 0, 0, 0],
          getLineColor: [244, 63, 94],
          stroked: true,
          lineWidthMinPixels: 2.5,
          getRadius: 16,
          radiusUnits: "pixels",
        }),
        // Next strike — amber glowing target
        new ScatterplotLayer({
          id: "next-glow",
          data: [spatial.nextStrike],
          getPosition: (d: { lng: number; lat: number }) => [d.lng, d.lat],
          getFillColor: [251, 191, 36, 60],
          getRadius: 22,
          radiusUnits: "pixels",
        }),
        new ScatterplotLayer({
          id: "next",
          data: [spatial.nextStrike],
          getPosition: (d: { lng: number; lat: number }) => [d.lng, d.lat],
          getFillColor: [251, 191, 36],
          getLineColor: [8, 14, 26],
          stroked: true,
          lineWidthMinPixels: 1.5,
          getRadius: 7,
          radiusUnits: "pixels",
        }),
      ],
    });

    // Fit to everything.
    const pts = [
      ...route.map((p) => [p.lng, p.lat] as [number, number]),
      [spatial.rossmo.anchor.lng, spatial.rossmo.anchor.lat] as [number, number],
      [spatial.nextStrike.lng, spatial.nextStrike.lat] as [number, number],
    ];
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 48, duration: 600, maxZoom: 10 }
    );
  }, [spatial]);

  const ns = spatial.nextStrike;
  return (
    <div className="space-y-2">
      <div ref={containerRef} className="h-[300px] w-full overflow-hidden rounded-lg" style={{ background: "#0b1220" }} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--color-text-dim)]">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: "linear-gradient(90deg,#22d3ee,#825aff)" }} /> Crime route (1→{spatial.route.length})</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full ring-2 ring-[#f43f5e]" /> Predicted base (Rossmo)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#fbbf24]" /> Next strike</span>
      </div>
      <div className="rounded-lg border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/5 p-2.5 text-xs">
        <span className="font-semibold text-[var(--color-warn)]">⚠ Next-strike forecast: </span>
        <span className="text-[var(--color-text-dim)]">
          {ns.district} · {ns.window} · {ns.timeWindow} · <span className="tnum">{Math.round(ns.confidence * 100)}%</span> confidence
        </span>
      </div>
      <div className="text-[10px] text-[var(--color-text-mute)]">
        Rossmo geographic profile predicts a base <em>zone</em> (a place, not a person) · decision support, human-in-the-loop · synthetic data.
      </div>
    </div>
  );
}
