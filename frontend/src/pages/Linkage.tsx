import { useState } from "react";
import { useApi, Card, PageHeader, State, Badge } from "@/components/ui";

interface Cluster {
  clusterId: string;
  label: string;
  crimeType: string;
  districtsSpanned: string[];
  memberCount: number;
  confidence: number;
  sampleNarratives: string[];
  memberCaseNos: string[];
}

export default function Linkage() {
  const { data, loading, error } = useApi<Cluster[]>("/linkage/clusters");
  const [selected, setSelected] = useState<Cluster | null>(null);
  const cluster = selected ?? data?.[0] ?? null;
  const [query, setQuery] = useState("");

  return (
    <div>
      <PageHeader title="Case Linkage" desc="Serial crimes connected across district borders by modus operandi" />

      {/* Live match — the demo money-shot (wired to live API in Phase 2) */}
      <Card className="mb-5 p-4">
        <div className="mb-2 text-sm font-medium">Live match — paste a new FIR narrative</div>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Paste a FIR narrative (English or ಕನ್ನಡ) to find its serial cluster…"
          className="h-20 w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-mute)]">Semantic match runs on AppSail in Phase 2</span>
          <button
            disabled={query.trim().length < 30}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-[var(--color-bg)] disabled:opacity-40"
          >
            Analyze
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Cluster list */}
        <div className="space-y-2 lg:col-span-2">
          <State loading={loading} error={error} empty={(data ?? []).length === 0}>
            {(data ?? []).map((c) => (
              <button
                key={c.clusterId}
                onClick={() => setSelected(c)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  cluster?.clusterId === c.clusterId
                    ? "border-[var(--color-accent-dim)] bg-[var(--color-surface-2)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--color-text)]">{c.label}</span>
                  <Badge tone="accent">{Math.round(c.confidence * 100)}%</Badge>
                </div>
                <div className="mt-1 text-xs text-[var(--color-text-dim)]">
                  {c.crimeType} · {c.memberCount} cases
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {c.districtsSpanned.map((d) => (
                    <span key={d} className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-dim)]">
                      {d}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </State>
        </div>

        {/* Detail */}
        <div className="lg:col-span-3">
          {cluster && (
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{cluster.label}</div>
                <Badge tone="danger">{cluster.districtsSpanned.length} districts</Badge>
              </div>
              <div className="mt-3 text-xs uppercase tracking-wide text-[var(--color-text-mute)]">Shared narratives (varied wording, same MO)</div>
              <ul className="mt-2 space-y-2">
                {cluster.sampleNarratives.map((n, i) => (
                  <li key={i} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5 text-xs text-[var(--color-text-dim)]">
                    {n}
                  </li>
                ))}
              </ul>
              <div className="mt-3 text-xs uppercase tracking-wide text-[var(--color-text-mute)]">Member FIRs</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {cluster.memberCaseNos.map((cn) => (
                  <span key={cn} className="tnum rounded bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-text-dim)]">
                    {cn}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
