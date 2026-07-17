// Precompute per-CASE embeddings for semantic MO search in Case Search, using the SAME
// multilingual model the browser uses (one vector space → valid cosine). Corpus = every
// serial-cluster member FIR from crime-dna.json (already carries facts + metadata).
// Run: node scripts/embed-cases.mjs   (from frontend/)  or  node frontend/scripts/embed-cases.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@huggingface/transformers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const DNA = path.join(ROOT, "public/crime-dna.json");
const OUT = path.join(ROOT, "public/case-embeddings.json");

const dna = JSON.parse(fs.readFileSync(DNA, "utf-8"));
console.log(`loading model ${MODEL} …`);
const extractor = await pipeline("feature-extraction", MODEL);

const cases = [];
const seen = new Set();
for (const c of Object.values(dna)) {
  for (const m of c.members) {
    if (seen.has(m.caseNo)) continue;
    seen.add(m.caseNo);
    const out = await extractor(m.facts, { pooling: "mean", normalize: true });
    cases.push({
      crimeNo: m.caseNo,
      district: m.district,
      date: m.date,
      crimeSubHead: c.crimeType,
      clusterId: c.clusterId,
      clusterLabel: c.label,
      solved: m.solved,
      facts: m.facts,
      language: m.language ?? "en",
      vector: Array.from(out.data, (x) => +x.toFixed(6)),
    });
  }
}

fs.writeFileSync(OUT, JSON.stringify({ model: MODEL, dim: cases[0].vector.length, cases }));
console.log(`wrote ${OUT} — ${cases.length} case vectors, dim ${cases[0].vector.length}`);
