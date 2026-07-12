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
