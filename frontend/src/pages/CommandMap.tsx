import { useEffect, useRef, useState } from "react";
import { useApi, StatTile, Card, PageHeader, State, Badge, SpecularCard } from "@/components/ui";
import DeckMap from "@/components/DeckMap";
import LiveAlerts from "@/components/LiveAlerts";
import { getSession } from "@/lib/auth";
import { optimize, type Area } from "@/lib/optimizer";
import { buildPlan, KIND_COLOR, type PatrolPlan } from "@/lib/patrolPlan";
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
    district: string; crimeType: string; head?: number; projectedWeek: number;
    momentumPct: number; riskLevel: string; patrolWindow: string;
    lat?: number; lng?: number;
  }[];
}

const RISK_TONE: Record<string, "danger" | "warn" | "mute"> = {
  High: "danger", Elevated: "warn", Watch: "mute",
};
const DEPLOY_UNITS = 20; // nightly patrol strength the optimiser spreads across the hotspots

export default function CommandMap() {
  const s = useApi<Summary>("/stats/summary");
  const d = useApi<District[]>("/geo/districts");
  const dq = useApi<DataQuality>("/data-quality");
  const a = useApi<Alert[]>("/alerts");
  const oc = useApi<{ name: string; chargesheeted: number; false: number; undetected: number }[]>("/stats/outcomes");
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [da, setDa] = useState<Record<string, { outcome: { detectionPct: number } }> | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [focus, setFocus] = useState<PatrolPlan | null>(null);
  // Real FIR points [lat,lng,head,,district,...] → used to place pickets on actual crime pockets.
  const [inc, setInc] = useState<{ lat: number; lng: number; head: number; district: string }[]>([]);
  const [feedAlerts, setFeedAlerts] = useState<Alert[]>([]);
  const mapCardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}forecast.json`).then((r) => r.json()).then(setForecast).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}district-analytics.json`).then((r) => r.json()).then((d) => setDa(d.districts)).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}alerts-feed.json`).then((r) => r.json()).then(setFeedAlerts).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}incident-points.json`)
      .then((r) => r.json())
      .then((raw: [number, number, number, string, string][]) =>
        setInc(raw.map((p) => ({ lat: p[0], lng: p[1], head: p[2], district: p[4] }))))
      .catch(() => {});
  }, []);

  // Role-based scoping: HQ sees the whole state; District/Station see only their jurisdiction.
  const scope = getSession().district; // null = HQ
  const allDistricts = (d.data ?? []).slice().sort((x, y) => y.caseCount - x.caseCount);
  const top = scope ? allDistricts.filter((x) => x.name === scope) : allDistricts;
  const rawAlerts = a.data && a.data.length > 0 ? a.data : feedAlerts;
  const alerts = scope ? rawAlerts.filter((al) => al.district?.includes(scope)) : rawAlerts;
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

  // Single source of truth for units: the patrol optimizer allocates the night's fixed strength
  // across the forecast hotspots. Each card, its detail plan, its pickets, and the "Full state
  // deployment" PDF all read the SAME allocation — so the numbers can never disagree.
  const areas: Area[] = fcHotspots.map((h) => ({
    // lambda = PRESSURE (predicted volume × how fast it's rising) — the SAME score that sets the
    // risk badge, so units and risk stay consistent and surging pockets earn more patrol strength.
    district: h.district, lambda: (h.projectedWeek || 1) * (1 + Math.max(0, h.momentumPct) / 100),
    crimeType: h.crimeType, patrolWindow: h.patrolWindow, lat: h.lat ?? 0, lng: h.lng ?? 0,
  }));
  const opt = areas.length ? optimize(areas, DEPLOY_UNITS) : null;
  const optUnits: Record<string, number> = {};
  opt?.alloc.forEach((a) => { optUnits[a.district] = a.units; });

  // Plain-language patrol plans, one per forecast pocket. Units come from the optimizer above;
  // pickets are placed on the REAL FIR pockets in that district (matched to the crime head), so
  // they differ district to district; a ring is the fallback where FIRs are too few to cluster.
  const plans: PatrolPlan[] = fcHotspots.map((h) => {
    let local = inc.filter((p) => p.district === h.district && (h.head == null || p.head === h.head));
    if (local.length < 6) local = inc.filter((p) => p.district === h.district); // any crime in-district
    return buildPlan(h, local, optUnits[h.district]);
  });
  const sel = selected !== null ? plans[selected] ?? null : null;
  function viewOnMap(p: PatrolPlan) {
    setFocus(p);
    mapCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function dutyChart() {
    if (!opt) return;
    const rows = opt.alloc.map((a) => `<tr><td>${a.district}</td><td>${a.units}</td><td>${a.crimeType}</td><td>${a.tactic}</td></tr>`).join("");
    openReport({
      title: "State Patrol Deployment Order",
      subtitle: `${DEPLOY_UNITS} units · covers ~${Math.round(opt.coveredPct * 100)}% of the 7-day forecast crime`,
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

      {/* 1. Command Map - Full Width & Broader */}
      <div ref={mapCardRef} className="w-full">
        <Card className="h-[520px] overflow-hidden p-0">
          <DeckMap districts={d.data ?? []} focus={focus} onExitFocus={() => setFocus(null)} />
        </Card>
      </div>

      {/* 2. Active Alerts & Districts by Case Volume - Below Map */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="h-[380px] flex flex-col p-4">
          <div className="mb-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
              Active alerts
              <span className="flex items-center gap-1 rounded bg-[var(--color-ok)]/10 px-1.5 py-0.5 text-[9px] font-normal text-[var(--color-ok)]">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-ok)]" /> AUTO-UPDATING
              </span>
            </div>
            <span className="text-xs text-[var(--color-text-mute)]">anomaly detection</span>
          </div>
          <State loading={a.loading && !feedAlerts.length} error={a.data || feedAlerts.length ? null : a.error} empty={alerts.length === 0}>
            <LiveAlerts alerts={alerts} />
          </State>
        </Card>

        <Card className="h-[380px] flex flex-col p-4">
          <div className="mb-3 shrink-0 text-sm font-medium text-[var(--color-text)]">{scope ? "Your jurisdiction" : "Districts by case volume"}</div>
          <State loading={d.loading} error={d.error} empty={top.length === 0}>
            <ul className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
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

      {forecast && plans.length > 0 && (
        <Card className="mt-4 p-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-[var(--color-text)]">
              This week's forecast &amp; where to patrol
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-text-mute)]">
                next {forecast.horizonDays} days
                {forecast.metrics && ` · ${Math.round(forecast.metrics.hitRateTop5 * 100)}% of hotspots caught in top-5`}
              </span>
              {opt && (
                <button
                  onClick={dutyChart}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors"
                  title={`Optimally deploy ${DEPLOY_UNITS} units — covers ~${Math.round(opt.coveredPct * 100)}% of forecast crime`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  <span>Full state deployment</span>
                </button>
              )}
            </div>
          </div>
          <div className="mb-3 text-[11px] text-[var(--color-text-mute)]">
            Tap a pocket to see the patrol plan, then put it on the map. Decision support — human-in-the-loop.
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {plans.slice(0, 8).map((p, i) => {
              const on = selected === i;
              return (
                <SpecularCard
                  key={i}
                  radius={12}
                  lineColor={on ? "#38bdf8" : "#64748b"}
                  baseColor="#1e293b"
                  intensity={on ? 1.5 : 0.9}
                  shineSize={14}
                  shineFade={35}
                  thickness={1.2}
                  proximity={250}
                  onClick={() => setSelected(on ? null : i)}
                  className={`card-hover cursor-pointer rounded-lg border p-3 text-left ${
                    on
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                      : "border-[var(--color-border)] bg-[var(--color-bg)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--color-text)]">{p.district}</span>
                    <Badge tone={RISK_TONE[p.risk] ?? "mute"}>{p.risk}</Badge>
                  </div>
                  <div className="mt-1 text-xs font-medium text-[var(--color-accent)]">{p.crimeType}</div>
                  <div className="mt-0.5 text-sm text-[var(--color-text-dim)]">{p.headline}</div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-[var(--color-text-mute)]">worst <span className="text-[var(--color-text-dim)]">{p.window}</span></span>
                    <span className="text-[var(--color-text-mute)]">
                      {p.trendPct >= 0 ? "rising " : "easing "}
                      <span className={p.trendPct >= 0 ? "text-[var(--color-danger)]" : "text-[var(--color-ok)]"}>{p.trendPct >= 0 ? "+" : ""}{p.trendPct}%</span>
                    </span>
                  </div>
                </SpecularCard>
              );
            })}
          </div>

          {sel && (
            <div className="mt-3 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-bg)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-[var(--color-text)]">
                    {sel.district} · {sel.crimeType}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--color-text-dim)]">
                    {sel.headline} · worst {sel.window} · suggest <span className="font-medium text-[var(--color-text)]">{sel.units} units</span>
                  </div>
                </div>
                <button
                  onClick={() => viewOnMap(sel)}
                  className="flex items-center gap-1.5 shrink-0 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-bg)] hover:opacity-90 transition-opacity"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span>View on map</span>
                </button>
              </div>

              <ol className="mt-3 space-y-1.5">
                {sel.steps.map((s, k) => (
                  <li key={k} className="flex gap-2.5 text-xs text-[var(--color-text-dim)]">
                    <span className="tnum flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]/15 text-[10px] font-semibold text-[var(--color-accent)]">{k + 1}</span>
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--color-border)] pt-2">
                {sel.pickets.map((pk, k) => (
                  <span key={k} className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-mute)]">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: `rgb(${KIND_COLOR[pk.kind].join(",")})` }} />
                    {pk.label}
                  </span>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-[var(--color-text-mute)]">
                {sel.grounded
                  ? "Pickets are placed on the pockets where FIRs actually cluster in this district — NETRA marks a predicted zone, not a fabricated exact address."
                  : "Too few located FIRs here to pinpoint pockets, so NETRA marks a predicted zone around the district centre — not a fabricated exact address."}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
