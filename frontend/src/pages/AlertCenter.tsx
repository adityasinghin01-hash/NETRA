import { useEffect, useMemo, useState } from "react";
import { Card, PageHeader, Badge, State, SpecularCard } from "@/components/ui";
import { getSession } from "@/lib/auth";

interface Alert {
  id: string; type: string; severity: string; district: string; crimeType: string;
  message: string; why: string; count: number; date: string; status: string;
}
const FLOW = ["New", "Acknowledged", "Assigned", "Resolved"];
const TYPE_TONE: Record<string, "danger" | "warn" | "accent" | "mute"> = {
  "Volume spike": "danger", "Emerging serial pattern": "accent", "Repeat offender": "warn",
};
const SPECULAR_LINE_COLOR: Record<string, string> = {
  "Volume spike": "#f43f5e",
  "Emerging serial pattern": "#38bdf8",
  "Repeat offender": "#f59e0b",
};

export default function AlertCenter() {
  const scope = getSession().district;
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [override, setOverride] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}alerts-feed.json`).then((r) => r.json()).then(setAlerts).catch(() => setAlerts([]));
  }, []);

  const scoped = useMemo(
    () => (alerts ?? [])
      .filter((a) => !scope || a.district.includes(scope) || a.district === "state-wide")
      .map((a) => ({ ...a, status: override[a.id] ?? a.status })),
    [alerts, scope, override]
  );
  const shown = filter === "all" ? scoped : scoped.filter((a) => a.status === filter);
  const openCount = scoped.filter((a) => a.status !== "Resolved").length;
  const highCount = scoped.filter((a) => a.severity === "high" && a.status !== "Resolved").length;

  function advance(a: Alert) {
    const i = FLOW.indexOf(a.status);
    setOverride((o) => ({ ...o, [a.id]: FLOW[Math.min(i + 1, FLOW.length - 1)] }));
  }

  return (
    <div>
      <PageHeader
        title="Anomaly & Alert Center"
        desc="Statistically-flagged anomalies — each with a why, and a lifecycle to work"
        right={<div className="flex items-center gap-2"><Badge tone="danger">{highCount} high</Badge><Badge tone="mute">{openCount} open</Badge></div>}
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {["all", ...FLOW].map((f) => {
          const n = f === "all" ? scoped.length : scoped.filter((a) => a.status === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${filter === f ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "border-[var(--color-border-strong)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"}`}>
              {f === "all" ? "All" : f} <span className="tnum text-[var(--color-text-mute)]">{n}</span>
            </button>
          );
        })}
      </div>

      <State loading={!alerts} error={null} empty={!!alerts && shown.length === 0}>
        <div className="space-y-2.5">
          {shown.map((a) => (
            <SpecularCard
              key={a.id}
              radius={12}
              lineColor={SPECULAR_LINE_COLOR[a.type] ?? (a.severity === "high" ? "#f43f5e" : "#f59e0b")}
              baseColor="#0f172a"
              intensity={1.3}
              shineSize={15}
              shineFade={35}
              thickness={1.5}
              proximity={280}
              className="card-hover p-4 border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
            >
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${a.severity === "high" ? "bg-[var(--color-danger)]" : "bg-[var(--color-warn)]"}`} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone={TYPE_TONE[a.type] ?? "mute"}>{a.type}</Badge>
                    <span className="text-xs text-[var(--color-text-mute)]">{a.district} · {a.date}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--color-text-dim)]">
                    <span className="flex items-center gap-1 font-semibold text-cyan-400">
                      <svg className="w-3.5 h-3.5 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      <span>Why flagged:</span>
                    </span>
                    <span className="text-[var(--color-text)]">{a.why}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${a.status === "Resolved" ? "bg-[var(--color-ok)]/15 text-[var(--color-ok)]" : a.status === "New" ? "bg-[var(--color-danger)]/15 text-[var(--color-danger)]" : "bg-[var(--color-surface-2)] text-[var(--color-text-dim)]"}`}>{a.status}</span>
                  {a.status !== "Resolved" && (
                    <button onClick={() => advance(a)} className="rounded-lg border border-[var(--color-border-strong)] px-2 py-0.5 text-[10px] text-[var(--color-text-dim)] hover:text-[var(--color-accent)]">
                      → {FLOW[FLOW.indexOf(a.status) + 1]}
                    </button>
                  )}
                </div>
              </div>
            </SpecularCard>
          ))}
        </div>
      </State>
      <div className="mt-4 text-[10px] text-[var(--color-text-mute)]">
        Detection: spatio-temporal spike (σ vs baseline), emerging-serial (MO-fingerprint), repeat-offender (network centrality) · human-in-the-loop.
      </div>
    </div>
  );
}
