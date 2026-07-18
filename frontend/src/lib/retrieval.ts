// Hybrid retrieval over the Copilot knowledge cards: dense (multilingual embeddings,
// same model as linkage) + sparse (BM25), fused with Reciprocal Rank Fusion. This is the
// grounding layer — every Copilot answer is built from the cards this returns, each cited.
import { embedText } from "@/lib/embedMatch";

export interface Card {
  id: string; type: string; title: string; text: string; cite: string;
  meta: Record<string, unknown>;
  vector: number[]; tf: Record<string, number>; len: number;
}
export interface Retrieved extends Card { score: number; dense: number; sparse: number }

interface Index { model: string; dim: number; idf: Record<string, number>; avgLen: number; cards: Card[] }

let idxP: Promise<Index> | null = null;
function getIndex(): Promise<Index> {
  if (!idxP)
    idxP = fetch(`${import.meta.env.BASE_URL}copilot-cards-embeddings.json`).then((r) => r.json());
  return idxP;
}
export function preloadRetrieval() { getIndex(); }

const STOP = new Set("the a an and or of to in on at for with by from is was were are be been that this it as who what which where when how".split(" "));
const tok = (s: string) => (s.toLowerCase().match(/[a-z0-9]{2,}/g) || []).filter((t) => !STOP.has(t));

function dot(a: number[], b: number[]) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

// BM25 score of a query against one card.
function bm25(qterms: string[], c: Card, idf: Record<string, number>, avgLen: number) {
  const k1 = 1.5, b = 0.75;
  let s = 0;
  for (const t of qterms) {
    const f = c.tf[t]; if (!f) continue;
    const id = idf[t] ?? 0;
    s += id * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (c.len / avgLen)));
  }
  return s;
}

// Reciprocal-rank fusion of dense and sparse rankings.
export async function retrieve(query: string, k = 8): Promise<Retrieved[]> {
  const idx = await getIndex();
  const q = await embedText(query);
  const qterms = tok(query);

  const dense = idx.cards.map((c, i) => ({ i, s: dot(q, c.vector) }));
  const sparse = idx.cards.map((c, i) => ({ i, s: bm25(qterms, c, idx.idf, idx.avgLen) }));
  const dRank = [...dense].sort((a, b) => b.s - a.s);
  const sRank = [...sparse].sort((a, b) => b.s - a.s);

  const rrf = new Map<number, number>();
  const C = 60;
  dRank.forEach((x, r) => rrf.set(x.i, (rrf.get(x.i) ?? 0) + 1 / (C + r)));
  sRank.forEach((x, r) => rrf.set(x.i, (rrf.get(x.i) ?? 0) + 1 / (C + r)));

  return [...rrf.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([i, score]) => ({ ...idx.cards[i], score, dense: dense[i].s, sparse: sparse[i].s }));
}

// A confidence proxy: top dense similarity + margin over #2, and dense/sparse agreement.
export function confidenceFrom(hits: Retrieved[]): number {
  if (!hits.length) return 0;
  const top = hits[0].dense;
  const margin = hits.length > 1 ? top - hits[1].dense : top;
  const sparseAgrees = hits[0].sparse > 0 ? 0.1 : 0;
  return Math.max(0, Math.min(1, top * 0.7 + margin * 1.5 + sparseAgrees));
}
