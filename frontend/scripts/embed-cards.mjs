// Embed the Copilot's knowledge cards with the SAME multilingual model the browser uses,
// so query and corpus share one vector space (valid cosine). Also emits a BM25 index
// (idf + per-card term frequencies) for hybrid dense+sparse retrieval.
// Run: node scripts/embed-cards.mjs   (from frontend/)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@huggingface/transformers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const CARDS = path.join(ROOT, "public/copilot-cards.json");
const OUT = path.join(ROOT, "public/copilot-cards-embeddings.json");

const cards = JSON.parse(fs.readFileSync(CARDS, "utf-8"));
console.log(`embedding ${cards.length} cards with ${MODEL} …`);
const extractor = await pipeline("feature-extraction", MODEL);

// --- BM25 index over card text ---
const STOP = new Set("the a an and or of to in on at for with by from is was were are be been that this it as who what which where when how".split(" "));
const tokenize = (s) => (s.toLowerCase().match(/[a-z0-9]{2,}/g) || []).filter((t) => !STOP.has(t));
const df = {};
const tfs = cards.map((c) => {
  const toks = tokenize(`${c.title} ${c.text}`);
  const tf = {};
  for (const t of toks) tf[t] = (tf[t] || 0) + 1;
  for (const t of new Set(toks)) df[t] = (df[t] || 0) + 1;
  return { tf, len: toks.length };
});
const N = cards.length;
const idf = {};
for (const t in df) idf[t] = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
const avgLen = tfs.reduce((s, x) => s + x.len, 0) / N;

const out = [];
for (let i = 0; i < cards.length; i++) {
  const c = cards[i];
  const o = await extractor(`${c.title}. ${c.text}`, { pooling: "mean", normalize: true });
  out.push({
    id: c.id, type: c.type, title: c.title, text: c.text, cite: c.cite, meta: c.meta,
    vector: Array.from(o.data, (x) => +x.toFixed(6)),
    tf: tfs[i].tf, len: tfs[i].len,
  });
}
fs.writeFileSync(OUT, JSON.stringify({ model: MODEL, dim: out[0].vector.length, idf, avgLen, cards: out }));
console.log(`wrote ${OUT} — ${out.length} cards, dim ${out[0].vector.length}, ${Object.keys(idf).length} terms`);
