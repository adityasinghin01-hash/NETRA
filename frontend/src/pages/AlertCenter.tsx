// Anomaly & Alert Center — a standalone tool, not a widget. Mixed alert types, each with a
import { usePersistentState } from "@/lib/usePersistentState";
// "why flagged" statistic, and a New→Acknowledged→Assigned→Resolved lifecycle (a workflow an
// officer works, not a list they read). Data: public/alerts-feed.json (build_alerts.py).
// Clicking an alert opens its triggering FIR in Case Search with the alert-context panel.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, Badge, State, SpecularCard } from "@/components/ui";
import { advanceStatus, arrived, FLOW, SYNC_MS, type Alert } from "@/lib/liveAlerts";
import { useLiveAlerts } from "@/lib/useLiveAlerts";
const TYPE_TONE: Record<string, "danger" | "warn" | "accent" | "mute"> = {
  "Volume spike": "danger", "Emerging serial pattern": "accent", "Repeat offender": "warn",
};
const SPECULAR_LINE_COLOR: Record<string, string> = {
  "Volume spike": "#f43f5e",
  "Emerging serial pattern": "#38bdf8",
  "Repeat offender": "#f59e0b",
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
  // District scoping now happens inside the shared store, so the bell and this page filter identically.
  const nav = useNavigate();
  const [filter, setFilter] = usePersistentState<string>("netra.alerts.filter", "all");
  const now = useClock();

  // Feed, progressive arrival and workflow statuses all live in the shared store, so the nav bell
  // and this page always agree and a new detection lights up both at the same moment.
  const live = useLiveAlerts();
  const { lastSync } = live;
  const alerts = live.alerts;
  const justId = live.justId;
  // Only alerts that have "arrived" are visible; ordered so the newest arrival is on top. The
  // reveal queue and statuses come from the shared store (see lib/liveAlerts.ts).
  const ordered = useMemo(() => arrived(live), [live]);
  const incoming = live.queue.length;
  const shown = filter === "all" ? ordered : ordered.filter((a) => a.status === filter);
  const openCount = ordered.filter((a) => a.status !== "Resolved").length;
  const highCount = ordered.filter((a) => a.severity === "high" && a.status !== "Resolved").length;

  function advance(a: Alert) {
    advanceStatus(a.id, a.status); // shared store → the nav bell count updates with it
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
        {lastSync && <> · feed synced <span className="tnum text-[var(--color-text-dim)]">{Math.max(0, Math.round((now.getTime() - lastSync.getTime()) / 1000))}s ago</span> (every {Math.round(SYNC_MS / 1000)}s)</>}
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
        <div className="space-y-2.5">
          {shown.map((a, i) => (
            // Wrapper keeps the staggered entry animation; SpecularCard supplies the shell. The
            // just-arrived alert keeps its red ring on top of the specular border.
            <div key={a.id} className="netra-alert-in" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
            <SpecularCard
              radius={12}
              lineColor={SPECULAR_LINE_COLOR[a.type] ?? (a.severity === "high" ? "#f43f5e" : "#f59e0b")}
              baseColor="#0f172a"
              intensity={1.3}
              shineSize={15}
              shineFade={35}
              thickness={1.5}
              proximity={280}
              className={`card-hover p-4 border bg-[var(--color-surface)] shadow-lg ${a.id === justId ? "border-[var(--color-danger)]/60 ring-1 ring-[var(--color-danger)]/40" : "border-[var(--color-border)]"}`}
            >
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
                  {/* SVG icon replaces the 🔬 emoji; the drill-down affordance stays. */}
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
            </SpecularCard>
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
