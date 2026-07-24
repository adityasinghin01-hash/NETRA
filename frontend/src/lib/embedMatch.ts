// Real semantic case-linkage matching, in the browser.
// Loads a multilingual sentence-transformer (transformers.js) — the SAME model used
// to precompute cluster-embeddings.json — embeds the pasted FIR (English or Kannada)
// and ranks serial clusters by cosine similarity. Same vector space = valid cosine.
import { pipeline, env } from "@huggingface/transformers";
import type { MatchResult, ClusterMatch } from "@/api/client";
import { memoJson, memoAsync } from "@/lib/loader";

const MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

// SOVEREIGNTY NOTE (see docs/SOVEREIGN-MODEL.md): hosting the model on-host was attempted but the
// 112MB weights exceed Catalyst web hosting's single-file cap (HTTP 413), and Catalyst also rejects
// the .wasm/.mjs paths (HTTP 400) so the runtime must stay Vite-bundled. Full sovereignty therefore
// needs object storage (Catalyst Stratus) for the model — tracked separately. For now the model
// loads from the open-weights host; the onnxruntime WASM is served from the Vite bundle (local).
env.allowLocalModels = false; // model weights fetched from the model host (see note above)

interface ClusterVec extends Omit<ClusterMatch, "score"> {
  vector: number[];
}

// Memoized loaders that never cache a failure (see lib/loader.ts). getExtractor is the
// sovereign model-load path — a transient HuggingFace fetch failure must not permanently
// kill all linkage for the session; the next call retries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getExtractor = memoAsync<any>(() => pipeline("feature-extraction", MODEL));
const getClusters = memoJson<{ clusters: ClusterVec[] }>(() => `${import.meta.env.BASE_URL}cluster-embeddings.json`);

// Start downloading the model + vectors ahead of time so the first click is fast.
export function preloadEmbedder() {
  getExtractor();
  getClusters();
  getCases();
}

function dot(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length); // guard dim mismatch → no silent NaN
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function normalize(v: number[]) {
  let s = 0;
  for (const x of v) s += x * x;
  s = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= s;
}

// Embed a piece of text into the shared vector space (English or Kannada).
export async function embedText(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const out = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(out.data) as number[];
}

// ── Per-FIR index (for the honest flywheel) ──────────────────────────────────
// case-embeddings.json holds every series member FIR (solved + UNSOLVED) as a vector
// in the SAME model space. This is the pool the "confirm link → surface cold cases"
// loop reasons over — no fabricated confidence, just real cosine retrieval.
export interface CaseVec {
  crimeNo: string; district: string; date: string; crimeSubHead: string;
  clusterId: string; clusterLabel: string; solved: boolean; facts: string;
  language: string; vector: number[];
}
const getCases = memoJson<{ cases: CaseVec[] }>(() => `${import.meta.env.BASE_URL}case-embeddings.json`);
// The member FIRs of a series (used for its unsolved leads + its signature centroid).
export async function seriesCases(clusterId: string): Promise<CaseVec[]> {
  const { cases } = await getCases();
  return cases.filter((c) => c.clusterId === clusterId);
}
// Normalized mean of vectors — the honest "signature" of a confirmed set of FIRs.
export function centroid(vecs: number[][]): number[] {
  if (!vecs.length) return []; // empty series (e.g. a bad clusterId) → no signature, no crash
  const n = vecs[0].length;
  const c = new Array(n).fill(0);
  for (const v of vecs) for (let i = 0; i < n; i++) c[i] += v[i];
  for (let i = 0; i < n; i++) c[i] /= vecs.length;
  normalize(c);
  return c;
}
// Score each of a series' member FIRs by cosine to the pasted query → lets the UI rank the
// linked FIRs by how closely each matches the officer's new case. Keyed by crimeNo (== caseNo).
export function scoreByCrimeNo(qv: number[], cases: CaseVec[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cases) out[c.crimeNo] = dot(qv, c.vector);
  return out;
}

// ── Hybrid retrieval (the sidebar's matching-FIR list) ───────────────────────
// Dense embeddings catch MEANING; BM25 catches EXACT terms (section codes, FIR nos, rare words)
// that semantics can miss. We rank each FIR by both and fuse with Reciprocal Rank Fusion (RRF),
// then tag WHY each surfaced (semantic / keyword / both) so the officer sees the reasoning.
export interface HybridCase {
  crimeNo: string; district: string; date: string; crimeSubHead: string;
  clusterId: string; clusterLabel: string; solved: boolean; facts: string; language: string;
  cos: number; method: "both" | "semantic" | "keyword";
}
const STOP = new Set("the a an and or of to in on at by for with from is was were be been being this that these those had has have made off near next found kept were".split(" "));
const tokenize = (s: string) => (s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w));
function bm25(query: string, docsTok: string[][]): number[] {
  const N = docsTok.length || 1;
  const avgdl = docsTok.reduce((s, d) => s + d.length, 0) / N;
  const df = new Map<string, number>();
  for (const d of docsTok) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  const qt = [...new Set(tokenize(query))];
  const k1 = 1.5, b = 0.75;
  return docsTok.map((d) => {
    const tf = new Map<string, number>();
    for (const w of d) tf.set(w, (tf.get(w) ?? 0) + 1);
    let s = 0;
    for (const w of qt) {
      const f = tf.get(w) ?? 0;
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgdl));
    }
    return s;
  });
}
function rankOf(scores: number[]): number[] {
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const rank = new Array<number>(scores.length);
  order.forEach((i, r) => { rank[i] = r; });
  return rank;
}
// minCos = the same 55% credibility bar NETRA uses everywhere to call a link real. Sidebar FIRs
// below it are noise from unrelated series (e.g. an ATM or OTP-fraud case riding under a genuine
// shutter-burglary match) — we DROP them rather than pad the list to topK.
export async function hybridCases(query: string, qv: number[], topK = 12, minCos = 0.55): Promise<HybridCase[]> {
  const { cases } = await getCases();
  const cos = cases.map((c) => dot(qv, c.vector));
  const bm = bm25(query, cases.map((c) => tokenize(c.facts)));
  const dRank = rankOf(cos);
  const sRank = rankOf(bm);
  const K = 60;
  const fused = cases.map((_, i) => 1 / (K + dRank[i]) + (bm[i] > 0 ? 1 / (K + sRank[i]) : 0));
  // Apply the relevance floor FIRST (only genuinely-matched FIRs survive — the shown % is that FIR's
  // cosine, so nothing below the 55% bar can appear), THEN rank the survivors by fused relevance for
  // selection, and DISPLAY ordered by cosine so the % decreases down the list and the top row equals
  // the headline best-match %. Shows FEWER than topK (even zero) when the query has few real matches.
  return cases
    .map((_, i) => i)
    .filter((i) => cos[i] >= minCos)
    .sort((a, b) => fused[b] - fused[a])
    .slice(0, topK)
    .sort((a, b) => cos[b] - cos[a])
    .map((i) => {
      const hasD = dRank[i] < 15;
      const hasS = bm[i] > 0 && sRank[i] < 15;
      const { vector, ...meta } = cases[i];
      void vector;
      return { ...meta, cos: cos[i], method: hasD && hasS ? "both" : hasS ? "keyword" : "semantic" } as HybridCase;
    });
}

// Scan the UNSOLVED case pool for cold cases whose MO matches a signature (cosine ≥ threshold),
// excluding the series' own members. Returns real candidate cold cases for officer review.
export async function scanUnsolved(
  signature: number[], exclude: Set<string>, threshold = 0.7, topK = 8,
): Promise<(CaseVec & { score: number })[]> {
  const { cases } = await getCases();
  return cases
    .filter((c) => !c.solved && !exclude.has(c.crimeNo))
    .map((c) => ({ ...c, score: dot(signature, c.vector) }))
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function embedMatch(text: string): Promise<MatchResult> {
  const [extractor, cl, cs] = await Promise.all([getExtractor(), getClusters(), getCases()]);
  const out = await extractor(text, { pooling: "mean", normalize: true });
  const q = Array.from(out.data) as number[];
  // A cluster's match % = its BEST-matching member FIR's cosine (not the aggregate signature).
  // This keeps the headline cluster % equal to that FIR's % in the sidebar, and guarantees NO
  // sidebar FIR can ever score above the best-match cluster — for any query, permanently.
  const bestPerCluster = new Map<string, number>();
  for (const c of cs.cases) {
    const s = dot(q, c.vector);
    if (s > (bestPerCluster.get(c.clusterId) ?? -Infinity)) bestPerCluster.set(c.clusterId, s);
  }
  const ranked = cl.clusters
    .map((c) => {
      const { vector, ...meta } = c;
      const s = bestPerCluster.has(c.clusterId) ? (bestPerCluster.get(c.clusterId) as number) : dot(q, vector);
      return { ...meta, score: Math.max(0, Math.round(s * 100)) } as ClusterMatch;
    })
    .sort((a, b) => b.score - a.score);
  // Return ALL clusters ranked (the live-match panel slices the top few; the cluster list uses
  // the full set to re-rank every series card by its match % to the pasted FIR).
  if (!ranked.length) throw new Error("no clusters loaded"); // handled by the caller's fallback
  return { method: "semantic", best: ranked[0], matches: ranked };
}
