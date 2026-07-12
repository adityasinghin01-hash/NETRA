import { useEffect, useState } from "react";
import { useApi, StatTile, Card, PageHeader, State, Badge } from "@/components/ui";
import CrimeMap from "@/components/CrimeMap";

interface Summary {
  totalCases: number;
  heinousCases: number;
  detectionRatePct: number;
  activeHotspots: number;
  openAlerts: number;
  linkedClusters: number;
}
interface District {
  districtId: number;
  name: string;
  caseCount: number;
  heinousCount: number;
}
interface DataQuality {
  geocodedPct: number;
  fallback: string;
  kannadaPct: number;
}
interface Forecast {
  generatedFor: string;
  horizonDays: number;
  hotspots: {
    district: string; crimeType: string; projectedWeek: number;
    momentumPct: number; riskLevel: string; patrolWindow: string;
  }[];
}

const RISK_TONE: Record<string, "danger" | "warn" | "mute"> = {
  High: "danger", Elevated: "warn", Watch: "mute",
};

export default function CommandMap() {
  const s = useApi<Summary>("/stats/summary");
  const d = useApi<District[]>("/geo/districts");
  const dq = useApi<DataQuality>("/data-quality");
  const top = (d.data ?? []).slice().sort((a, b) => b.caseCount - a.caseCount);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}forecast.json`).then((r) => r.json()).then(setForecast).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader
        title="Command Map"
        desc="State-wide crime intelligence overview"
        right={dq.data && <Badge tone="mute">{dq.data.geocodedPct}% geocoded · station-level fallback ON</Badge>}
      />

      <State loading={s.loading} error={s.error}>
        {s.data && (
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Total FIRs" value={s.data.totalCases.toLocaleString()} />
            <StatTile label="Heinous" value={s.data.heinousCases.toLocaleString()} />
            <StatTile label="Detection" value={`${s.data.detectionRatePct}%`} />
            <StatTile label="Hotspots" value={s.data.activeHotspots} />
            <StatTile label="Open Alerts" value={s.data.openAlerts} />
            <StatTile label="Linked Clusters" value={s.data.linkedClusters} />
          </div>
        )}
      </State>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="h-[420px] overflow-hidden p-0 lg:col-span-2">
          <CrimeMap districts={d.data ?? []} />
        </Card>

        <Card className="h-[420px] overflow-y-auto p-4">
          <div className="mb-3 text-sm font-medium text-[var(--color-text)]">Districts by case volume</div>
          <State loading={d.loading} error={d.error} empty={top.length === 0}>
            <ul className="space-y-1">
              {top.map((row, i) => (
                <li key={row.districtId} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-surface-2)]">
                  <span className="text-[var(--color-text-dim)]">
                    <span className="tnum mr-2 text-[var(--color-text-mute)]">{i + 1}</span>
                    {row.name}
                  </span>
                  <span className="tnum text-[var(--color-text)]">{row.caseCount.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </State>
        </Card>
      </div>

      {forecast && forecast.hotspots.length > 0 && (
        <Card className="mt-4 p-4">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-sm font-medium text-[var(--color-text)]">
              7-Day Forecast &amp; Patrol Plan
            </div>
            <span className="text-xs text-[var(--color-text-mute)]">
              next {forecast.horizonDays} days · AI momentum model
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {forecast.hotspots.slice(0, 8).map((h, i) => (
              <div key={i} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--color-text)]">{h.district}</span>
                  <Badge tone={RISK_TONE[h.riskLevel] ?? "mute"}>{h.riskLevel}</Badge>
                </div>
                <div className="mt-1 text-xs text-[var(--color-text-dim)]">{h.crimeType}</div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-[var(--color-text-mute)]">
                    trend <span className="text-[var(--color-danger)]">+{h.momentumPct}%</span>
                  </span>
                  <span className="tnum text-[var(--color-text-dim)]">{h.patrolWindow}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-[var(--color-text-mute)]">
            Recommendation: allocate patrols to the windows above · decision support, human-in-the-loop
          </div>
        </Card>
      )}
    </div>
  );
}
