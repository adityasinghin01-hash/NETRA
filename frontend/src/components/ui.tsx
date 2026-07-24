// Shared NETRA UI primitives + data hook.
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/api/client";
import SpecularButton, { SpecularCard, type SpecularProps } from "./SpecularButton";

export { SpecularButton, SpecularCard };

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path]);
  return { data, loading, error };
}

export function Card({ children, className = "", specular = false }: { children: ReactNode; className?: string; specular?: boolean }) {
  if (!specular) {
    return (
      <div className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] ${className}`}>
        {children}
      </div>
    );
  }
  return (
    <SpecularCard
      radius={12}
      lineColor="#38bdf8"
      baseColor="#1e293b"
      intensity={0.8}
      shineSize={12}
      shineFade={35}
      proximity={240}
      className={`border border-[var(--color-border)] bg-[var(--color-surface)] ${className}`}
    >
      {children}
    </SpecularCard>
  );
}

export function StatTile({ label, value, sub, ...specularProps }: { label: string; value: ReactNode; sub?: string } & SpecularProps) {
  return (
    <SpecularCard
      radius={12}
      lineColor="#38bdf8"
      baseColor="#0f172a"
      intensity={1.3}
      shineSize={15}
      shineFade={35}
      thickness={1.5}
      proximity={280}
      autoAnimate={false}
      {...specularProps}
      className="card-hover relative overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg"
    >
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-mute)]">{label}</div>
      <div className="tnum mt-1.5 text-[26px] font-semibold leading-none text-[var(--color-text)]">{value}</div>
      {sub && <div className="mt-1 text-xs text-[var(--color-text-dim)]">{sub}</div>}
    </SpecularCard>
  );
}

export function Badge({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "danger" | "warn" | "ok" | "mute" }) {
  const c = {
    accent: "text-[var(--color-accent)] border-[var(--color-accent-dim)]",
    danger: "text-[var(--color-danger)] border-[var(--color-danger)]",
    warn: "text-[var(--color-warn)] border-[var(--color-warn)]",
    ok: "text-[var(--color-ok)] border-[var(--color-ok)]",
    mute: "text-[var(--color-text-dim)] border-[var(--color-border-strong)]",
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${c}`}>{children}</span>;
}

export function State({ loading, error, empty, children }: { loading: boolean; error: string | null; empty?: boolean; children: ReactNode }) {
  if (loading)
    return (
      <div className="space-y-2 p-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-4" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    );
  if (error) return <div className="p-6 text-sm text-[var(--color-danger)]">Couldn’t load data. {error}</div>;
  if (empty) return <div className="p-6 text-sm text-[var(--color-text-mute)]">No data for this view.</div>;
  return <>{children}</>;
}

export function PageHeader({ title, desc, right }: { title: string; desc?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">{title}</h1>
        {desc && <p className="mt-0.5 text-sm text-[var(--color-text-dim)]">{desc}</p>}
      </div>
      {right}
    </div>
  );
}
