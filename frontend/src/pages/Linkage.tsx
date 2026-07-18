import { useEffect, useState } from "react";
import { useApi, Card, PageHeader, State, Badge } from "@/components/ui";
import { matchFir, type MatchResult } from "@/api/client";
import { embedMatch, preloadEmbedder, embedText, seriesCases, centroid, scanUnsolved, scoreByCrimeNo, type CaseVec } from "@/lib/embedMatch";
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
  // Honest flywheel state: the matched series' members (with unsolved leads), whether THIS FIR
  // has been confirmed, and any cold cases the re-scan surfaced. No fabricated confidence.
  const [cold, setCold] = useState<{ members: CaseVec[]; unsolved: CaseVec[]; count: number; confirmed: boolean; candidates: (CaseVec & { score: number })[]; scores: Record<string, number>; qvec: number[] } | null>(null);
  const [confirmedKeys, setConfirmedKeys] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const keyOf = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");
  // A semantic match below this cosine % is NOT a real link — a genuine in-series FIR scores
  // ~75-90%, while unrelated/gibberish text scores well under this. Below it we say so honestly.
  const MATCH_MIN = 55;
  const matched = !!result && (result.method === "keyword" || result.best.score >= MATCH_MIN);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}crime-dna.json`).then((r) => r.json()).then(setDnaMap).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}spatial.json`).then((r) => r.json()).then(setSpatialMap).catch(() => {});
  }, []);

  // On a semantic match, load the series' member FIRs → surface how many are still UNSOLVED
  // (potential clearances). This is the reliable, real value; no confidence is touched.
  useEffect(() => {
    if (!result || result.method !== "semantic" || result.best.score < MATCH_MIN) { setCold(null); return; }
    let live = true;
    (async () => {
      const members = await seriesCases(result.best.clusterId);
      let scores: Record<string, number> = {};
      let qvec: number[] = [];
      try { qvec = await embedText(query); scores = scoreByCrimeNo(qvec, members); } catch { /* model busy */ }
      if (!live) return;
      setCold({
        members, unsolved: members.filter((m) => !m.solved), count: members.length,
        confirmed: confirmedKeys.has(keyOf(query)), candidates: [], scores, qvec,
      });
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // The honest flywheel: confirming this FIR adds it as a member, recomputes the series' MO
  // signature as the CENTROID of all members, and re-scans the unsolved pool for cold cases that
  // match — surfacing cross-filed cases an officer would otherwise miss. One confirm per FIR.
  async function confirmLink() {
    if (!result || result.method !== "semantic" || !cold || cold.confirmed) return;
    setConfirming(true);
    try {
      const qv = cold.qvec.length ? cold.qvec : await embedText(query);
      const signature = centroid([...cold.members.map((m) => m.vector), qv]);
      const exclude = new Set(cold.members.map((m) => m.crimeNo));
      const candidates = await scanUnsolved(signature, exclude, 0.7, 8);
      setConfirmedKeys((s) => new Set(s).add(keyOf(query)));
      setCold((c) => (c ? { ...c, confirmed: true, candidates } : c));
    } finally {
      setConfirming(false);
    }
  }

  const matchedCluster = matched && result?.best
    ? data?.find((c) => c.clusterId === result.best.clusterId)
    : null;
  const cluster = matchedCluster ?? selected ?? data?.[0] ?? null;
  const bestDna = result && dnaMap ? dnaMap[result.best.clusterId] : null;

  // After a credible Analyse, re-rank the whole series list by each series' MATCH % to the pasted
  // FIR (not its static cohesion), strongest first — so the linked series rise to the top.
  const clusterScore: Record<string, number> | null =
    matched && result?.method === "semantic"
      ? Object.fromEntries(result.matches.map((m) => [m.clusterId, m.score]))
      : null;
  const orderedClusters = clusterScore
    ? [...(data ?? [])].sort((a, b) => (clusterScore[b.clusterId] ?? -1) - (clusterScore[a.clusterId] ?? -1))
    : (data ?? []);

  // Warm up the semantic model in the background so the first Analyze is fast.
  useEffect(() => {
    preloadEmbedder();
  }, []);

  async function analyze() {
    setMatching(true);
    try {
      let r: MatchResult;
      try {
        r = await embedMatch(query); // real semantic multilingual match
      } catch {
        r = await matchFir(query); // keyword fallback (server) if model unavailable
      }
      setResult(r);
      // Only auto-open the matched series when the match is actually credible.
      if (r.method === "keyword" || r.best.score >= MATCH_MIN) {
        const hit = data?.find((c) => c.clusterId === r.best.clusterId);
        if (hit) setSelected(hit);
      }
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

        {/* No credible link — don't dress a weak/gibberish match up as a result. */}
        {result && !matched && (
          <div className="mt-4 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
              <span>🔍</span> No known serial series matches this FIR
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-dim)]">
              The closest series was <span className="text-[var(--color-text)]">{result.best.label}</span> at only{" "}
              <span className="tnum text-[var(--color-warn)]">{result.best.score}%</span> — below the {MATCH_MIN}% NETRA needs to call it a link.
              This reads as an isolated incident or a new pattern, not part of a known series. Paste the full FIR narrative for a reliable match.
            </p>
          </div>
        )}

        {result && matched && (
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
                  🧬 Why this match — MO signature alignment
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

            {/* Honest flywheel — real cold-case value, no fabricated confidence.
                (1) show how many FIRs in the matched series are still UNSOLVED = potential clearances;
                (2) confirming this FIR extends the series + re-scans the unsolved pool for more matches. */}
            {result.method === "semantic" && cold && (
              <div className="mt-4 space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                <div>
                  <div className="text-xs font-semibold text-[var(--color-text)]">
                    Clearable cases — <span className="text-[var(--color-danger)]">{cold.unsolved.length}</span> of {cold.count} linked FIRs still unsolved
                  </div>
                  <div className="mb-1.5 text-[10px] leading-relaxed text-[var(--color-text-mute)]">
                    These {cold.count} FIRs are one serial series. {cold.unsolved.length} of them are still open — identify this one offender and all {cold.unsolved.length} clear together (one arrest → {cold.unsolved.length} clearance{cold.unsolved.length === 1 ? "" : "s"}).
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cold.unsolved.map((m) => (
                      <span key={m.crimeNo} title={m.facts} className="tnum rounded bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-text-dim)]">
                        {m.crimeNo} · {m.district}
                      </span>
                    ))}
                    {cold.unsolved.length === 0 && <span className="text-[11px] text-[var(--color-text-mute)]">All member FIRs already solved.</span>}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-2">
                  {cold.confirmed ? (
                    <div className="text-xs text-[var(--color-text-dim)]">
                      ✓ <span className="font-medium text-[var(--color-text)]">This FIR is now linked to the series.</span> NETRA re-scanned unsolved cases against the updated MO signature.
                      {cold.candidates.length > 0 ? (
                        <> Re-scan surfaced <span className="font-semibold text-[var(--color-accent)]">{cold.candidates.length} candidate cold case{cold.candidates.length > 1 ? "s" : ""}</span> matching this MO.</>
                      ) : (
                        <span className="text-[var(--color-text-mute)]"> No further unsolved cases cross the match threshold.</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--color-text-mute)]">
                      Confirm this FIR belongs to the series → it's added as a member and NETRA re-scans unsolved cases against the updated MO signature.
                    </div>
                  )}
                  <button
                    onClick={confirmLink}
                    disabled={confirming || cold.confirmed}
                    className="shrink-0 rounded-lg border border-[var(--color-accent-dim)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 disabled:opacity-40"
                  >
                    {confirming ? "Scanning…" : cold.confirmed ? "✓ Confirmed" : "Confirm link"}
                  </button>
                </div>

                {cold.confirmed && cold.candidates.length > 0 && (
                  <div className="border-t border-[var(--color-border)] pt-2">
                    <div className="mb-1 text-[10px] text-[var(--color-text-mute)]">Candidate cold cases for review — unconfirmed, matched by MO signature:</div>
                    <div className="space-y-1">
                      {cold.candidates.map((c) => (
                        <div key={c.crimeNo} className="flex items-center gap-2 text-[11px]" title={c.facts}>
                          <span className="tnum w-9 text-right font-semibold text-[var(--color-accent)]">{Math.round(c.score * 100)}%</span>
                          <span className="tnum text-[var(--color-text-dim)]">{c.crimeNo}</span>
                          <span className="truncate text-[var(--color-text-mute)]">· {c.district} · {c.crimeSubHead}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Cluster list */}
        <div className="space-y-2 lg:col-span-2">
          <div className="px-1 text-[11px] text-[var(--color-text-mute)]">
            {clusterScore
              ? "Serial series ranked by match to your FIR — % is how closely each series' MO fits the pasted case."
              : "Serial series — % is cluster cohesion (how tightly the member FIRs share one MO)."}
          </div>
          <State loading={loading} error={error} empty={(data ?? []).length === 0}>
            {orderedClusters.map((c) => {
              const ms = clusterScore ? (clusterScore[c.clusterId] ?? 0) : null;
              const linked = ms === null || ms >= MATCH_MIN; // below-threshold series dim after a match
              return (
              <button
                key={c.clusterId}
                onClick={() => setSelected(c)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  cluster?.clusterId === c.clusterId
                    ? "border-[var(--color-accent-dim)] bg-[var(--color-surface-2)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]"
                } ${linked ? "" : "opacity-45"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--color-text)]">{c.label}</span>
                  {ms === null
                    ? <Badge tone="accent">{Math.round(c.confidence * 100)}%</Badge>
                    : <Badge tone={ms >= MATCH_MIN ? "accent" : "mute"}>{ms}% match</Badge>}
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
              );
            })}
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
                <CrimeDNA dna={dnaMap[cluster.clusterId]} scores={cold && result?.best.clusterId === cluster.clusterId ? cold.scores : undefined} />
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
