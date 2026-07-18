// Real semantic case-linkage matching, in the browser.
// Loads a multilingual sentence-transformer (transformers.js) — the SAME model used
// to precompute cluster-embeddings.json — embeds the pasted FIR (English or Kannada)
// and ranks serial clusters by cosine similarity. Same vector space = valid cosine.
import { pipeline, env } from "@huggingface/transformers";
import type { MatchResult, ClusterMatch } from "@/api/client";

const MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

env.allowLocalModels = false; // always fetch the model from the HF CDN

interface ClusterVec extends Omit<ClusterMatch, "score"> {
  vector: number[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractorP: Promise<any> | null = null;
let clustersP: Promise<{ clusters: ClusterVec[] }> | null = null;

function getExtractor() {
  if (!extractorP) extractorP = pipeline("feature-extraction", MODEL);
  return extractorP;
}
function getClusters() {
  if (!clustersP)
    clustersP = fetch(`${import.meta.env.BASE_URL}cluster-embeddings.json`).then((r) => r.json());
  return clustersP;
}

// Start downloading the model + vectors ahead of time so the first click is fast.
export function preloadEmbedder() {
  getExtractor();
  getClusters();
}

function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
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
let casesP: Promise<{ cases: CaseVec[] }> | null = null;
function getCases() {
  if (!casesP) casesP = fetch(`${import.meta.env.BASE_URL}case-embeddings.json`).then((r) => r.json());
  return casesP;
}
// The member FIRs of a series (used for its unsolved leads + its signature centroid).
export async function seriesCases(clusterId: string): Promise<CaseVec[]> {
  const { cases } = await getCases();
  return cases.filter((c) => c.clusterId === clusterId);
}
// Normalized mean of vectors — the honest "signature" of a confirmed set of FIRs.
export function centroid(vecs: number[][]): number[] {
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
  const [extractor, data] = await Promise.all([getExtractor(), getClusters()]);
  const out = await extractor(text, { pooling: "mean", normalize: true });
  const q = Array.from(out.data) as number[];
  const ranked = data.clusters
    .map((c) => {
      const { vector, ...meta } = c;
      return { ...meta, score: Math.max(0, Math.round(dot(q, vector) * 100)) } as ClusterMatch;
    })
    .sort((a, b) => b.score - a.score);
  // Return ALL clusters ranked (the live-match panel slices the top few; the cluster list uses
  // the full set to re-rank every series card by its match % to the pasted FIR).
  return { method: "semantic", best: ranked[0], matches: ranked };
}
