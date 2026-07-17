import { useEffect, useState } from "react";
import { useApi, Card, PageHeader, State, Badge } from "@/components/ui";
import { matchFir, type MatchResult } from "@/api/client";
import { embedMatch, preloadEmbedder, embedText, reinforceCluster } from "@/lib/embedMatch";
import CrimeDNA, { type CrimeDna } from "@/components/CrimeDNA";
import SpatialTriad, { type SpatialRec } from "@/components/SpatialTriad";

const EXAMPLES = [
  "Unknown persons cut the shutter lock of a mobile shop past midnight and decamped with cash and phones kept at the counter.",
  "The complainant's black Honda Activa scooter, parked near the bus stand, was found missing late at night.",
  "An unknown caller posing as a bank customer-care executive obtained an OTP over the phone and fraudulently withdrew money from the account.",
];

// How strongly a pasted narrative expresses one MO-signature dimension: fraction of the
// signature phrase's content words present in the query, plus which words hit. Real
// word-overlap — no fabricated numbers; the semantic cosine remains the headline score.
function dimAlign(query: string, value: string): { ratio: number; hits: string[]; words: string[] } {
  const q = query.toLowerCase();
  const words = [...new Set((value.toLowerCase().match(/[a-z]{4,}/g) ?? []))];
  const hits = words.filter((w) => q.includes(w));
  return { ratio: words.length ? hits.length / words.length : 0, hits, words };
}

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
  const [dnaMap, setDnaMap] = useState<Record<string, CrimeDna> | null>(null);
  const [spatialMap, setSpatialMap] = useState<Record<string, SpatialRec> | null>(null);
  const [flywheel, setFlywheel] = useState<{ before: number; after: number; fed: number } | null>(null);
  const [feeding, setFeeding] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}crime-dna.json`).then((r) => r.json()).then(setDnaMap).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}spatial.json`).then((r) => r.json()).then(setSpatialMap).catch(() => {});
  }, []);

  // The learning flywheel: confirm this FIR into NETRA → its cluster signature is
  // reinforced → re-match, and the confidence visibly sharpens. Real, in-browser.
  async function feedFir() {
    if (!result || result.method !== "semantic") return;
    setFeeding(true);
    try {
      const before = result.best.score;
      const q = await embedText(query);
      await reinforceCluster(result.best.clusterId, q);
      const r2 = await embedMatch(query);
      setResult(r2);
      setFlywheel((f) => ({ before, after: r2.best.score, fed: (f?.fed ?? 0) + 1 }));
    } finally {
      setFeeding(false);
    }
  }

  const matchedCluster = result?.best
    ? data?.find((c) => c.clusterId === result.best.clusterId)
    : null;
  const cluster = matchedCluster ?? selected ?? data?.[0] ?? null;
  const bestDna = result && dnaMap ? dnaMap[result.best.clusterId] : null;

  // Warm up the semantic model in the background so the first Analyze is fast.
  useEffect(() => {
    preloadEmbedder();
  }, []);

  async function analyze() {
    setMatching(true);
    setFlywheel(null);
    try {
      let r: MatchResult;
      try {
        r = await embedMatch(query); // real semantic multilingual match
      } catch {
        r = await matchFir(query); // keyword fallback (server) if model unavailable
      }
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
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-text)]">Best match — {result.best.label}</span>
                  <Badge tone={result.method === "semantic" ? "accent" : "mute"}>
                    {result.method === "semantic" ? "semantic AI" : "keyword"}
                  </Badge>
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
                    <div className="h-full bg-[var(--color-accent)] transition-all duration-500" style={{ width: `${m.score}%` }} />
                  </div>
                  <span className="tnum w-8 text-right text-[var(--color-text-mute)]">{m.score}%</span>
                </div>
              ))}
            </div>

            {/* Why this match — turn the single cosine into an explainable MO-dimension breakdown.
                Narrative similarity = the real semantic score; each dimension bar = how much of
                that MO trait the pasted FIR actually expresses (word-overlap, honest). */}
            {result.method === "semantic" && bestDna && (
              <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text)]">
                  🧬 Why this match — MO fingerprint alignment
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="flex w-40 shrink-0 items-center gap-1 text-[var(--color-text-dim)]">
                      <span>🧠</span> Narrative similarity
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                      <div className="h-full bg-[var(--color-accent)]" style={{ width: `${result.best.score}%` }} />
                    </div>
                    <span className="tnum w-8 text-right text-[var(--color-text-mute)]">{result.best.score}%</span>
                  </div>
                  {bestDna.signature.map((s) => {
                    const a = dimAlign(query, s.value);
                    const pct = Math.round(a.ratio * 100);
                    return (
                      <div key={s.dim + s.value} className="flex items-center gap-2 text-xs" title={a.hits.length ? `matched: ${a.hits.join(", ")}` : "no shared terms"}>
                        <span className="flex w-40 shrink-0 items-center gap-1 truncate text-[var(--color-text-dim)]">
                          <span>{s.icon}</span> {s.dim}
                        </span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                          <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, background: pct >= 60 ? "var(--color-ok)" : pct > 0 ? "var(--color-warn)" : "var(--color-border-strong)" }} />
                        </div>
                        <span className="tnum w-8 text-right text-[var(--color-text-mute)]">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-[10px] leading-relaxed text-[var(--color-text-mute)]">
                  Fusion: the semantic model reads the whole narrative; the dimension bars show which MO
                  traits (when · method · target · place) the text shares with this series — so the link is explainable, not a black box.
                </div>
              </div>
            )}

            {/* Learning flywheel — confirm this FIR into NETRA and watch the signature sharpen */}
            {result.method === "semantic" && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                {flywheel ? (
                  <div className="text-xs text-[var(--color-text-dim)]">
                    🔄 <span className="font-medium text-[var(--color-text)]">Signature reinforced.</span> Match
                    confidence <span className="tnum">{flywheel.before}%</span> →{" "}
                    <span className="tnum font-semibold text-[var(--color-accent)]">{flywheel.after}%</span>
                    <span className="text-[var(--color-text-mute)]"> · NETRA now recognises this MO more strongly (corpus +{flywheel.fed}). Every confirmed case sharpens the model — the compounding flywheel.</span>
                  </div>
                ) : (
                  <div className="text-xs text-[var(--color-text-mute)]">
                    🔄 Confirm this FIR belongs to the cluster — NETRA learns from it and future matches get sharper.
                  </div>
                )}
                <button
                  onClick={feedFir}
                  disabled={feeding}
                  className="shrink-0 rounded-lg border border-[var(--color-accent-dim)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-40"
                >
                  {feeding ? "Learning…" : flywheel ? "Feed again" : "Feed into NETRA"}
                </button>
              </div>
            )}
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
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">{cluster.label}</div>
                <Badge tone="danger">{cluster.districtsSpanned.length} districts</Badge>
              </div>
              {spatialMap?.[cluster.clusterId] && (
                <div className="mb-5 border-b border-[var(--color-border)] pb-5">
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--color-text-mute)]">
                    <span>🗺️</span> Spatial Intelligence — route · predicted base · next strike
                  </div>
                  <SpatialTriad spatial={spatialMap[cluster.clusterId]} />
                </div>
              )}
              {dnaMap?.[cluster.clusterId] ? (
                <CrimeDNA dna={dnaMap[cluster.clusterId]} />
              ) : (
                <>
                  <div className="text-xs uppercase tracking-wide text-[var(--color-text-mute)]">Shared narratives (varied wording, same MO)</div>
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
                </>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
