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

// The learning FLYWHEEL, for real: feeding a confirmed FIR nudges that cluster's
// signature vector toward it (and re-normalizes), so every subsequent match to the
// same MO scores higher. Mutates the in-memory cluster vector — the more confirmed
// examples NETRA sees, the sharper the signature. (Client-side demo; no persistence.)
export async function reinforceCluster(clusterId: string, q: number[], alpha = 0.4) {
  const data = await getClusters();
  const c = data.clusters.find((x) => x.clusterId === clusterId);
  if (!c) return;
  for (let i = 0; i < c.vector.length; i++) c.vector[i] += alpha * q[i];
  normalize(c.vector);
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
  return { method: "semantic", best: ranked[0], matches: ranked.slice(0, 5) };
}
