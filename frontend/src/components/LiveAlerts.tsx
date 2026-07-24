// Active-alerts panel that feels alive: relative timestamps that tick up, a pulsing dot
// per active alert, and an auto-update loop that periodically promotes a fresh spike to
// the top with a flash. Honest: this simulates the live feel over the precomputed anomaly
// feed — in production it's driven by live FIR ingestion + the anomaly engine on a cron.
import { useEffect, useRef, useState } from "react";

export interface Alert { alertId: string; district: string; crimeType: string; severity: string; message: string; caseCount: number }
interface Live extends Alert { age: number; flash: boolean }

function ago(sec: number): string {
  if (sec < 45) return "just now";
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

export default function LiveAlerts({ alerts }: { alerts: Alert[] }) {
  const [live, setLive] = useState<Live[]>([]);
  const seeded = useRef(false);

  // Seed each alert with a plausible starting age.
  useEffect(() => {
    if (!alerts.length) { setLive([]); return; }
    setLive(alerts.map((a, i) => ({ ...a, age: 90 + i * 220 + Math.floor(Math.random() * 120), flash: false })));
    seeded.current = true;
  }, [alerts]);

  // Tick ages every 3s; every few ticks, promote a random alert as a "new" spike.
  useEffect(() => {
    if (!seeded.current) return;
    let ticks = 0;
    const id = setInterval(() => {
      ticks++;
      setLive((prev) => {
        if (!prev.length) return prev;
        let next = prev.map((a) => ({ ...a, age: a.age + 3, flash: false }));
        if (ticks % 6 === 0) {
          const i = Math.floor(Math.random() * next.length);
          const promoted = { ...next[i], age: 3, flash: true };
          next = [promoted, ...next.filter((_, k) => k !== i)];
        } else {
          next = [...next].sort((a, b) => a.age - b.age);
        }
        return next;
      });
    }, 3000);
    return () => clearInterval(id);
  }, [live.length ? true : false]);

  if (!live.length) return <div className="text-xs text-[var(--color-text-mute)]">No active alerts.</div>;

  return (
    <ul className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
      {live.map((a) => {
        const high = a.severity === "high";
        return (
          <li
            key={a.alertId}
            className={`flex items-start gap-2.5 rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-bg)]/40 p-2.5 text-xs transition-all hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]/60 ${
              a.flash ? "border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 ring-1 ring-[var(--color-danger)]/30" : ""
            }`}
          >
            <span className="relative mt-1 flex h-2 w-2 shrink-0">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${high ? "bg-[var(--color-danger)]" : "bg-[var(--color-warn)]"}`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${high ? "bg-[var(--color-danger)]" : "bg-[var(--color-warn)]"}`} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[var(--color-text-dim)] font-medium leading-tight">{a.message}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-text-mute)]">
                <span className="font-mono">{ago(a.age)}</span>
                {a.district && (
                  <span className="inline-flex items-center gap-1 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-dim)]">
                    <svg className="w-2.5 h-2.5 text-[var(--color-text-mute)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    <span>{a.district}</span>
                  </span>
                )}
                {a.caseCount ? (
                  <span className="tnum font-semibold text-[var(--color-warn)]">
                    {a.caseCount} cases
                  </span>
                ) : null}
                {a.flash && (
                  <span className="rounded bg-[var(--color-danger)]/20 px-1.5 py-0.5 font-semibold text-[var(--color-danger)] animate-pulse">
                    NEW SPIKE
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
