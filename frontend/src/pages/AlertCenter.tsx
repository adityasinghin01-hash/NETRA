// Anomaly & Alert Center — a standalone tool, not a widget. Mixed alert types, each with a
// "why flagged" statistic, and a New→Acknowledged→Assigned→Resolved lifecycle (a workflow an
// officer works, not a list they read). Data: public/alerts-feed.json (build_alerts.py).
import { useEffect, useMemo, useState } from "react";
import { Card, PageHeader, Badge, State } from "@/components/ui";
import { getSession } from "@/lib/auth";

interface Alert {
  id: string; type: string; severity: string; district: string; crimeType: string;
  message: string; why: string; count: number; date: string; status: string;
}
const FLOW = ["New", "Acknowledged", "Assigned", "Resolved"];
const TYPE_TONE: Record<string, "danger" | "warn" | "accent" | "mute"> = {
  "Volume spike": "danger", "Emerging serial pattern": "accent", "Repeat offender": "warn",
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
        <div className="space-y-2">
          {shown.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${a.severity === "high" ? "bg-[var(--color-danger)]" : "bg-[var(--color-warn)]"}`} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone={TYPE_TONE[a.type] ?? "mute"}>{a.type}</Badge>
                    <span className="text-xs text-[var(--color-text-mute)]">{a.district} · {a.date}</span>
                  </div>
                  <div className="text-sm text-[var(--color-text)]">{a.message}</div>
                  <div className="mt-1 text-xs text-[var(--color-text-dim)]">🔬 Why flagged: <span className="text-[var(--color-text)]">{a.why}</span></div>
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
            </Card>
          ))}
        </div>
      </State>
      <div className="mt-4 text-[10px] text-[var(--color-text-mute)]">
        Detection: spatio-temporal spike (σ vs baseline), emerging-serial (MO-fingerprint), repeat-offender (network centrality) · human-in-the-loop.
      </div>
    </div>
  );
}
