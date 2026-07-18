import { useEffect, useState } from "react";
import { useApi, StatTile, Card, PageHeader, State, Badge } from "@/components/ui";
import DeckMap from "@/components/DeckMap";
import LiveAlerts from "@/components/LiveAlerts";
import { getSession } from "@/lib/auth";
import { optimize, type Area } from "@/lib/optimizer";
import { openReport } from "@/lib/pdf";

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
  lat: number;
  lng: number;
  caseCount: number;
  heinousCount: number;
}
interface DataQuality {
  geocodedPct: number;
  fallback: string;
  kannadaPct: number;
}
interface Alert {
  alertId: string;
  district: string;
  crimeType: string;
  severity: string;
  message: string;
  caseCount: number;
}
interface Forecast {
  generatedFor: string;
  horizonDays: number;
  model?: string;
  metrics?: { hitRateTop5: number; r2: number };
  hotspots: {
    district: string; crimeType: string; projectedWeek: number;
    momentumPct: number; riskLevel: string; patrolWindow: string;
    lat?: number; lng?: number;
  }[];
}

const RISK_TONE: Record<string, "danger" | "warn" | "mute"> = {
  High: "danger", Elevated: "warn", Watch: "mute",
};

export default function CommandMap() {
  const s = useApi<Summary>("/stats/summary");
  const d = useApi<District[]>("/geo/districts");
  const dq = useApi<DataQuality>("/data-quality");
  const a = useApi<Alert[]>("/alerts");
  const oc = useApi<{ name: string; chargesheeted: number; false: number; undetected: number }[]>("/stats/outcomes");
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [da, setDa] = useState<Record<string, { outcome: { detectionPct: number } }> | null>(null);
  const [units, setUnits] = useState(8);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}forecast.json`).then((r) => r.json()).then(setForecast).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}district-analytics.json`).then((r) => r.json()).then((d) => setDa(d.districts)).catch(() => {});
  }, []);

  // Role-based scoping: HQ sees the whole state; District/Station see only their jurisdiction.
  const scope = getSession().district; // null = HQ
  const allDistricts = (d.data ?? []).slice().sort((x, y) => y.caseCount - x.caseCount);
  const top = scope ? allDistricts.filter((x) => x.name === scope) : allDistricts;
  const alerts = scope ? (a.data ?? []).filter((al) => al.district === scope) : (a.data ?? []);
  const fcHotspots = scope ? (forecast?.hotspots ?? []).filter((h) => h.district === scope) : forecast?.hotspots ?? [];

  const scopedRow = scope ? allDistricts.find((x) => x.name === scope) : null;
  const scopedOc = scope ? (oc.data ?? []).find((x) => x.name === scope) : null;
  const summary: Summary | null =
    scope && scopedRow
      ? {
          totalCases: scopedRow.caseCount,
          heinousCases: scopedRow.heinousCount,
          detectionRatePct:
            da?.[scope]?.outcome.detectionPct ??
            (scopedOc
              ? Math.round((100 * scopedOc.chargesheeted) / (scopedOc.chargesheeted + scopedOc.false + scopedOc.undetected))
              : (s.data?.detectionRatePct ?? 0)),
          activeHotspots: fcHotspots.length,
          openAlerts: alerts.length,
          linkedClusters: s.data?.linkedClusters ?? 0,
        }
      : s.data;

  // Patrol optimizer over the forecast hotspots (recomputes live on the units slider).
  const areas: Area[] = fcHotspots.map((h) => ({
    district: h.district, lambda: h.projectedWeek || 1, crimeType: h.crimeType,
    patrolWindow: h.patrolWindow, lat: h.lat ?? 0, lng: h.lng ?? 0,
  }));
  const opt = areas.length ? optimize(areas, units) : null;
  function dutyChart() {
    if (!opt) return;
    const rows = opt.alloc.map((a) => `<tr><td>${a.district}</td><td>${a.units}</td><td>${a.crimeType}</td><td>${a.tactic}</td></tr>`).join("");
    openReport({
      title: "Patrol Duty Chart",
      subtitle: `${units} units · covers ~${Math.round(opt.coveredPct * 100)}% of the 7-day forecast crime`,
      classification: "DEPLOYMENT ORDER",
      sections: [
        { heading: "Deployment", html: `<table><thead><tr><th>Area</th><th>Units</th><th>Focus</th><th>Tactics</th></tr></thead><tbody>${rows}</tbody></table>` },
        { heading: "Method", html: `<p>Greedy submodular optimisation with a provable (1−1/e)≈63% optimality guarantee (Nemhauser); Koper-Curve deterrence with diminishing returns. Decision support — human-in-the-loop.</p>` },
      ],
    });
  }

  return (
    <div>
      <PageHeader
        title="Command Map"
        desc="State-wide crime intelligence overview"
        right={dq.data ? <Badge tone="mute">{dq.data.geocodedPct}% geocoded</Badge> : undefined}
      />

      <State loading={s.loading} error={s.error}>
        {summary && (
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Total FIRs" value={summary.totalCases.toLocaleString()} />
            <StatTile label="Heinous" value={summary.heinousCases.toLocaleString()} />
            <StatTile label="Detection" value={`${summary.detectionRatePct}%`} />
            <StatTile label="Hotspots" value={summary.activeHotspots} />
            <StatTile label="Open Alerts" value={summary.openAlerts} />
            <StatTile label={scope ? "State Clusters" : "Linked Clusters"} value={summary.linkedClusters} />
          </div>
        )}
      </State>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="h-[420px] overflow-hidden p-0 lg:col-span-2">
          <DeckMap districts={d.data ?? []} />
        </Card>

        <div className="flex h-[420px] flex-col gap-4">
          <Card className="shrink-0 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
                Active alerts
                <span className="flex items-center gap-1 rounded bg-[var(--color-ok)]/10 px-1.5 py-0.5 text-[9px] font-normal text-[var(--color-ok)]">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-ok)]" /> AUTO-UPDATING
                </span>
              </div>
              <span className="text-xs text-[var(--color-text-mute)]">anomaly detection</span>
            </div>
            <State loading={a.loading} error={a.error} empty={false}>
              <LiveAlerts alerts={alerts} />
            </State>
          </Card>
          <Card className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-3 text-sm font-medium text-[var(--color-text)]">{scope ? "Your jurisdiction" : "Districts by case volume"}</div>
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

      {forecast && fcHotspots.length > 0 && (
        <Card className="mt-4 p-4">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-sm font-medium text-[var(--color-text)]">
              7-Day Forecast &amp; Patrol Plan
            </div>
            <span className="text-xs text-[var(--color-text-mute)]">
              next {forecast.horizonDays} days · gradient-boosting model
              {forecast.metrics && ` · top-5 hit-rate ${Math.round(forecast.metrics.hitRateTop5 * 100)}%`}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {fcHotspots.slice(0, 8).map((h, i) => (
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

      {opt && (
        <Card className="mt-4 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium text-[var(--color-text)]">Predictive Deployment Board</div>
            <span className="text-xs text-[var(--color-text-mute)]">optimal patrol allocation · (1−1/e) bound · Koper-curve</span>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-text-dim)]">Patrol units tonight</span>
              <input type="range" min={2} max={16} value={units} onChange={(e) => setUnits(+e.target.value)} className="accent-[var(--color-accent)]" />
              <span className="tnum w-6 text-sm font-semibold text-[var(--color-text)]">{units}</span>
            </div>
            <div className="text-sm">
              <span className="text-[var(--color-text-dim)]">Optimal deployment covers </span>
              <span className="tnum text-lg font-semibold text-[var(--color-ok)]">{Math.round(opt.coveredPct * 100)}%</span>
              <span className="text-[var(--color-text-dim)]"> of forecast crime</span>
            </div>
            <button onClick={dutyChart} className="ml-auto rounded-lg border border-[var(--color-border-strong)] px-3 py-1 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-accent)]">
              Generate duty chart
            </button>
          </div>
          <div className="space-y-1.5">
            {opt.alloc.map((a) => (
              <div key={a.district} className="flex items-start gap-3 rounded-lg bg-[var(--color-bg)] p-2.5 text-xs">
                <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]/15 font-semibold text-[var(--color-accent)]">{a.units}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[var(--color-text)]">{a.district} · {a.crimeType}</div>
                  <div className="text-[10px] text-[var(--color-text-mute)]">{a.tactic}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-[var(--color-text-mute)]">
            Greedy submodular maximisation — provable (1−1/e)≈63% optimality guarantee · Koper-Curve deterrence with diminishing returns · decision support, human-in-the-loop.
          </div>
        </Card>
      )}
    </div>
  );
}
