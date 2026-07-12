import { useState } from "react";
import { useApi, Card, PageHeader, State, Badge } from "@/components/ui";
import { matchFir, type MatchResult } from "@/api/client";

const EXAMPLES = [
  "Unknown persons cut the shutter lock of a mobile shop past midnight and decamped with cash and phones kept at the counter.",
  "The complainant's black Honda Activa scooter, parked near the bus stand, was found missing late at night.",
  "An unknown caller posing as a bank customer-care executive obtained an OTP over the phone and fraudulently withdrew money from the account.",
];

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
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [matching, setMatching] = useState(false);
  const [exampleIdx, setExampleIdx] = useState(0);

  const matchedCluster = result?.best
    ? data?.find((c) => c.clusterId === result.best.clusterId)
    : null;
  const cluster = matchedCluster ?? selected ?? data?.[0] ?? null;

  async function analyze() {
    setMatching(true);
    try {
      const r = await matchFir(query);
      setResult(r);
      const hit = data?.find((c) => c.clusterId === r.best.clusterId);
      if (hit) setSelected(hit);
    } catch {
      setResult(null);
    } finally {
      setMatching(false);
    }
  }

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
          <button
            onClick={() => {
              setQuery(EXAMPLES[exampleIdx % EXAMPLES.length]);
              setExampleIdx((i) => i + 1);
            }}
            className="text-xs text-[var(--color-text-dim)] underline-offset-2 hover:text-[var(--color-accent)] hover:underline"
          >
            Try an example
          </button>
          <button
            onClick={analyze}
            disabled={query.trim().length < 15 || matching}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-[var(--color-bg)] disabled:opacity-40"
          >
            {matching ? "Analyzing…" : "Analyze"}
          </button>
        </div>

        {result && (
          <div className="mt-4 rounded-lg border border-[var(--color-accent-dim)] bg-[var(--color-surface-2)] p-4">
            <div className="flex items-center gap-4">
              <div className="tnum text-3xl font-semibold text-[var(--color-accent)]">{result.best.score}%</div>
              <div>
                <div className="text-sm font-medium text-[var(--color-text)]">
                  Best match — {result.best.label}
                </div>
                <div className="text-xs text-[var(--color-text-dim)]">
                  {result.best.crimeType} · spans {result.best.districts.join(", ")}
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              {result.matches.slice(0, 4).map((m) => (
                <div key={m.clusterId} className="flex items-center gap-2 text-xs">
                  <span className="w-40 shrink-0 text-[var(--color-text-dim)]">{m.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-bg)]">
                    <div className="h-full bg-[var(--color-accent)]" style={{ width: `${m.score}%` }} />
                  </div>
                  <span className="tnum w-8 text-right text-[var(--color-text-mute)]">{m.score}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
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
