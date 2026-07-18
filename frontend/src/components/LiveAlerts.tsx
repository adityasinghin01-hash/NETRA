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
    <ul className="space-y-2">
      {live.slice(0, 4).map((a) => {
        const high = a.severity === "high";
        return (
          <li key={a.alertId} className={`flex gap-2 rounded-md text-xs transition-colors ${a.flash ? "bg-[var(--color-danger)]/10" : ""}`}>
            <span className="relative mt-1 flex h-2 w-2 shrink-0">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${high ? "bg-[var(--color-danger)]" : "bg-[var(--color-warn)]"}`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${high ? "bg-[var(--color-danger)]" : "bg-[var(--color-warn)]"}`} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[var(--color-text-dim)]">{a.message}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--color-text-mute)]">
                <span>{ago(a.age)}</span>
                {a.flash && <span className="rounded bg-[var(--color-danger)]/20 px-1 font-semibold text-[var(--color-danger)]">NEW</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
