import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, LayersControl } from "react-leaflet";
import L, { type Layer, type PathOptions } from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";

interface DistrictDatum {
  name: string;
  caseCount: number;
}

// Crime-head → colour for incident dots.
const HEAD_COLOR: Record<number, string> = {
  1: "#f59e0b", // Property
  2: "#ef4444", // Body
  3: "#ec4899", // Women
  4: "#a855f7", // Children
  5: "#3b82f6", // Economic
  6: "#22d3ee", // Cyber
  7: "#fb923c", // Public order
  8: "#14b8a6", // Special/local laws
  9: "#94a3b8", // Unnatural death
};
const HEAD_LABEL: Record<number, string> = {
  1: "Property", 2: "Body", 3: "Women", 5: "Economic", 6: "Cyber", 8: "Special",
};

function choroplethColor(count: number): string {
  if (count > 6000) return "#ef4444";
  if (count > 3500) return "#f97316";
  if (count > 2500) return "#f59e0b";
  if (count > 1800) return "#eab308";
  if (count > 1300) return "#a3e635";
  return "#4ade80";
}

export default function CrimeMap({ districts }: { districts: DistrictDatum[] }) {
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [pts, setPts] = useState<[number, number, number][] | null>(null);
  const counts = useMemo(() => new Map(districts.map((d) => [d.name, d.caseCount])), [districts]);

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    fetch(`${base}karnataka-districts.geojson`).then((r) => r.json()).then(setGeo).catch(() => {});
    fetch(`${base}incident-points.json`).then((r) => r.json()).then(setPts).catch(() => {});
  }, []);

  // Incident points → GeoJSON FeatureCollection (built once).
  const pointsFC = useMemo<FeatureCollection | null>(() => {
    if (!pts) return null;
    return {
      type: "FeatureCollection",
      features: pts.map(([lat, lng, c]) => ({
        type: "Feature",
        properties: { c },
        geometry: { type: "Point", coordinates: [lng, lat] },
      })),
    };
  }, [pts]);

  function districtStyle(feature?: Feature): PathOptions {
    const name = (feature?.properties as { district?: string })?.district ?? "";
    const count = counts.get(name) ?? 0;
    return { fillColor: choroplethColor(count), fillOpacity: count ? 0.5 : 0.12, color: "#0b1220", weight: 1 };
  }

  function onEachDistrict(feature: Feature, layer: Layer) {
    const name = (feature.properties as { district?: string })?.district ?? "—";
    const count = counts.get(name) ?? 0;
    layer.bindTooltip(
      `<div style="font-weight:600">${name}</div><div>${count.toLocaleString()} FIRs</div>`,
      { sticky: true, className: "netra-tip" }
    );
    layer.on({
      mouseover: (e) => e.target.setStyle({ weight: 2, color: "#22d3ee", fillOpacity: 0.7 }),
      mouseout: (e) => e.target.setStyle(districtStyle(feature)),
    });
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <MapContainer
        center={[14.9, 76.0]}
        zoom={7}
        preferCanvas
        style={{ height: "100%", width: "100%", background: "#0b1220" }}
        scrollWheelZoom={false}
        attributionControl={false}
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Dark streets">
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" maxZoom={20} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>

          <LayersControl.Overlay checked name="Districts (crime level)">
            {geo ? <GeoJSON key="districts" data={geo} style={districtStyle} onEachFeature={onEachDistrict} /> : <></>}
          </LayersControl.Overlay>

          <LayersControl.Overlay checked name="Incidents (5k FIRs)">
            {pointsFC ? (
              <GeoJSON
                key="incidents"
                data={pointsFC}
                pointToLayer={(feature, latlng) =>
                  L.circleMarker(latlng, {
                    radius: 2.5,
                    weight: 0,
                    fillColor: HEAD_COLOR[(feature.properties as { c: number }).c] ?? "#22d3ee",
                    fillOpacity: 0.8,
                  })
                }
              />
            ) : (
              <></>
            )}
          </LayersControl.Overlay>
        </LayersControl>
      </MapContainer>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/90 p-2 text-[10px] text-[var(--color-text-dim)]">
        <div className="mb-1 font-medium text-[var(--color-text)]">Incident type</div>
        <div className="flex flex-wrap gap-x-2 gap-y-1" style={{ maxWidth: 220 }}>
          {Object.entries(HEAD_LABEL).map(([k, label]) => (
            <div key={k} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: HEAD_COLOR[Number(k)] }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
