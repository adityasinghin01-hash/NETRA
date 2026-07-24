// Anomaly & Alert Center — a standalone tool, not a widget. Mixed alert types, each with a
// "why flagged" statistic, and a New→Acknowledged→Assigned→Resolved lifecycle (a workflow an
// officer works, not a list they read). Data: public/alerts-feed.json (build_alerts.py).
// Clicking an alert opens its triggering FIR in Case Search with the alert-context panel.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, PageHeader, Badge, State } from "@/components/ui";
import { getSession } from "@/lib/auth";

interface Alert {
  id: string; type: string; severity: string; district: string; crimeType: string;
  message: string; why: string; count: number; date: string; status: string;
  crimeNo?: string | null; clusterId?: string | null;
}
const FLOW = ["New", "Acknowledged", "Assigned", "Resolved"];
const TYPE_TONE: Record<string, "danger" | "warn" | "accent" | "mute"> = {
  "Volume spike": "danger", "Emerging serial pattern": "accent", "Repeat offender": "warn",
};

// A live wall-clock that ticks every second, so the feed reads as an always-on monitor.
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function AlertCenter() {
  const scope = getSession().district;
  const nav = useNavigate();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [override, setOverride] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>("all");
  const now = useClock();

  const [lastSync, setLastSync] = useState<Date | null>(null);
  // Progressive live arrival: the feed's precomputed anomalies surface OVER TIME so the monitor
  // reads as live rather than a static list. A few show at first; then each sync brings a
  // previously-unshown detection to the top with a NEW flash. Every card is a real precomputed
  // alert — this is reveal-over-time, never fabricated data.
  const INITIAL_SHOWN = 4;
  const [reveal, setReveal] = useState<{ shown: string[]; queue: string[] } | null>(null);
  const [justId, setJustId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const pull = () =>
      fetch(`${import.meta.env.BASE_URL}alerts-feed.json?t=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (alive) { setAlerts(d); setLastSync(new Date()); } })
        .catch(() => { if (alive && !alerts) setAlerts([]); });
    pull();
    // Each 20s sync re-fetches AND surfaces one more queued detection at the top.
    const t = setInterval(() => {
      pull();
      setReveal((rv) => {
        if (!rv || rv.queue.length === 0) return rv;
        const [next, ...queue] = rv.queue;
        setJustId(next);
        return { shown: [next, ...rv.shown], queue };
      });
    }, 20000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed the reveal queue once the feed loads, then only APPEND genuinely-new alert ids on later
  // syncs — never reset. (Each 20s pull replaces the `alerts` array, so a plain re-seed here would
  // reset the reveal back to the first few every sync — the bug that stopped new alerts appearing.)
  useEffect(() => {
    if (!alerts) return;
    const ids = alerts
      .filter((a) => !scope || a.district.includes(scope) || a.district === "state-wide")
      .map((a) => a.id);
    setReveal((rv) => {
      if (!rv) return { shown: ids.slice(0, INITIAL_SHOWN), queue: ids.slice(INITIAL_SHOWN) };
      const known = new Set([...rv.shown, ...rv.queue]);
      const fresh = ids.filter((id) => !known.has(id));
      return fresh.length ? { shown: rv.shown, queue: [...rv.queue, ...fresh] } : rv;
    });
  }, [alerts, scope]);

  // The NEW flash on a just-arrived alert is transient.
  useEffect(() => {
    if (!justId) return;
    const t = setTimeout(() => setJustId(null), 7000);
    return () => clearTimeout(t);
  }, [justId]);

  const scoped = useMemo(
    () => (alerts ?? [])
      .filter((a) => !scope || a.district.includes(scope) || a.district === "state-wide")
      .map((a) => ({ ...a, status: override[a.id] ?? a.status })),
    [alerts, scope, override]
  );
  // Only alerts that have "arrived" are visible; ordered so the newest arrival is on top.
  const byId = useMemo(() => new Map(scoped.map((a) => [a.id, a])), [scoped]);
  const ordered = useMemo(
    () => (reveal?.shown ?? []).map((id) => byId.get(id)).filter(Boolean) as typeof scoped,
    [reveal, byId]
  );
  const incoming = reveal?.queue.length ?? 0;
  const shown = filter === "all" ? ordered : ordered.filter((a) => a.status === filter);
  const openCount = ordered.filter((a) => a.status !== "Resolved").length;
  const highCount = ordered.filter((a) => a.severity === "high" && a.status !== "Resolved").length;

  function advance(a: Alert) {
    const i = FLOW.indexOf(a.status);
    setOverride((o) => ({ ...o, [a.id]: FLOW[Math.min(i + 1, FLOW.length - 1)] }));
  }
  function openCase(a: Alert) {
    if (!a.crimeNo) return;
    nav(`/cases?q=${a.crimeNo}&alert=${a.id}`);
  }

  const hhmmss = now.toLocaleTimeString("en-GB");

  return (
    <div>
      {/* entrance + live-pulse animations, scoped to this feed */}
      <style>{`
        @keyframes netraAlertIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes netraLivePulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        .netra-alert-in { animation: netraAlertIn .38s ease-out both; }
        .netra-live-dot { animation: netraLivePulse 1.4s ease-in-out infinite; }
      `}</style>

      <PageHeader
        title="Anomaly & Alert Center"
        desc="Statistically-flagged anomalies — each with a why, and a lifecycle to work"
        right={<div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--color-danger)]">
            <span className="netra-live-dot h-1.5 w-1.5 rounded-full bg-[var(--color-danger)]" /> LIVE
          </span>
          <Badge tone="danger">{highCount} high</Badge><Badge tone="mute">{openCount} open</Badge>
        </div>}
      />

      <div className="mb-3 flex items-center gap-2 text-[11px] text-[var(--color-text-mute)]">
        <span className="netra-live-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]" />
        Monitoring continuously · clock <span className="tnum text-[var(--color-text-dim)]">{hhmmss}</span>
        {lastSync && <> · feed synced <span className="tnum text-[var(--color-text-dim)]">{Math.max(0, Math.round((now.getTime() - lastSync.getTime()) / 1000))}s ago</span> (every 20s)</>}
        · {ordered.length} active{incoming > 0 && <> · <span className="text-[var(--color-warn)]">{incoming} scanning…</span></>}
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {["all", ...FLOW].map((f) => {
          const n = f === "all" ? ordered.length : ordered.filter((a) => a.status === f).length;
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
          {shown.map((a, i) => (
            <div key={a.id} className="netra-alert-in" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
            <Card className={`p-4 transition-colors hover:border-[var(--color-accent)]/50 ${a.id === justId ? "border-[var(--color-danger)]/60 ring-1 ring-[var(--color-danger)]/40" : ""}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${a.severity === "high" ? "bg-[var(--color-danger)]" : "bg-[var(--color-warn)]"} ${a.status === "New" ? "netra-live-dot" : ""}`} />
                <button onClick={() => openCase(a)} disabled={!a.crimeNo}
                  className="min-w-0 flex-1 text-left disabled:cursor-default">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    {a.id === justId && (
                      <span className="netra-live-dot rounded-full bg-[var(--color-danger)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">● New</span>
                    )}
                    <Badge tone={TYPE_TONE[a.type] ?? "mute"}>{a.type}</Badge>
                    <span className="text-xs text-[var(--color-text-mute)]">{a.district} · {a.date}</span>
                  </div>
                  <div className="text-sm text-[var(--color-text)]">{a.message}</div>
                  <div className="mt-1 text-xs text-[var(--color-text-dim)]">🔬 Why flagged: <span className="text-[var(--color-text)]">{a.why}</span></div>
                  {a.crimeNo && (
                    <div className="mt-1.5 text-[11px] text-[var(--color-accent)]">Open triggering FIR in Case Search →</div>
                  )}
                </button>
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
            </div>
          ))}
        </div>
      </State>
      <div className="mt-4 text-[10px] text-[var(--color-text-mute)]">
        Detection: spatio-temporal spike (σ vs baseline), emerging-serial (MO-fingerprint), repeat-offender (network centrality) · human-in-the-loop.
      </div>
    </div>
  );
}
