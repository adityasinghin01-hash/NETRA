import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import type { Feature } from "geojson";
import "leaflet/dist/leaflet.css";

interface DistrictDatum {
  name: string;
  caseCount: number;
}

// Green (low) → red (high) crime intensity.
function colorFor(count: number): string {
  if (count > 6000) return "#ef4444";
  if (count > 3500) return "#f97316";
  if (count > 2500) return "#f59e0b";
  if (count > 1800) return "#eab308";
  if (count > 1300) return "#a3e635";
  return "#4ade80";
}

const LEGEND = [
  { c: "#ef4444", t: "6000+" },
  { c: "#f97316", t: "3500+" },
  { c: "#f59e0b", t: "2500+" },
  { c: "#eab308", t: "1800+" },
  { c: "#a3e635", t: "1300+" },
  { c: "#4ade80", t: "<1300" },
];

export default function CrimeMap({ districts }: { districts: DistrictDatum[] }) {
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const counts = new Map(districts.map((d) => [d.name, d.caseCount]));

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}karnataka-districts.geojson`)
      .then((r) => r.json())
      .then(setGeo)
      .catch(() => setGeo(null));
  }, []);

  function style(feature?: Feature): PathOptions {
    const name = (feature?.properties as { district?: string })?.district ?? "";
    const count = counts.get(name) ?? 0;
    return {
      fillColor: colorFor(count),
      fillOpacity: count ? 0.6 : 0.15,
      color: "#0b1220",
      weight: 1,
    };
  }

  function onEach(feature: Feature, layer: Layer) {
    const name = (feature.properties as { district?: string })?.district ?? "—";
    const count = counts.get(name) ?? 0;
    layer.bindTooltip(
      `<div style="font-weight:600">${name}</div><div>${count.toLocaleString()} FIRs</div>`,
      { sticky: true, className: "netra-tip" }
    );
    layer.on({
      mouseover: (e) => e.target.setStyle({ weight: 2, color: "#22d3ee", fillOpacity: 0.8 }),
      mouseout: (e) => e.target.setStyle(style(feature)),
    });
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <MapContainer
        center={[14.9, 76.0]}
        zoom={7}
        style={{ height: "100%", width: "100%", background: "#0b1220" }}
        scrollWheelZoom={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        {geo && <GeoJSON key={districts.length} data={geo} style={style} onEachFeature={onEach} />}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/90 p-2 text-[10px] text-[var(--color-text-dim)]">
        <div className="mb-1 font-medium text-[var(--color-text)]">FIRs by district</div>
        <div className="flex gap-2">
          {LEGEND.map((l) => (
            <div key={l.t} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.c }} />
              {l.t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
