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

export default function CommandMap() {
  const s = useApi<Summary>("/stats/summary");
  const d = useApi<District[]>("/geo/districts");
  const dq = useApi<DataQuality>("/data-quality");
  const top = (d.data ?? []).slice().sort((a, b) => b.caseCount - a.caseCount);

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
    </div>
  );
}
