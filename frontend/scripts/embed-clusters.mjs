// Precompute cluster embeddings with the SAME multilingual model the browser uses,
// so query and corpus share one vector space. Averages each serial cluster's member
// FIR narratives into a centroid vector.
// Run: node scripts/embed-clusters.mjs   (from repo root)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { pipeline } from "@huggingface/transformers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const DATA = path.join(ROOT, "pipeline/data");
const META = path.join(ROOT, "functions/netra_api/clusters_index.json");
const OUT = path.join(ROOT, "frontend/public/cluster-embeddings.json");

const gt = JSON.parse(fs.readFileSync(`${DATA}/planted_patterns.json`, "utf-8"));
const meta = Object.fromEntries(
  JSON.parse(fs.readFileSync(META, "utf-8")).clusters.map((c) => [c.clusterId, c])
);

// collect member caseIds we need narratives for
const needed = new Set();
for (const cl of gt.serialClusters) cl.memberCaseIds.forEach((id) => needed.add(id));

// stream cases.jsonl → map caseId -> briefFacts (members only)
const briefs = new Map();
await new Promise((resolve) => {
  const rl = readline.createInterface({ input: fs.createReadStream(`${DATA}/cases.jsonl`) });
  rl.on("line", (line) => {
    const c = JSON.parse(line);
    if (needed.has(c.caseMasterId)) briefs.set(c.caseMasterId, c.briefFacts);
  });
  rl.on("close", resolve);
});

console.log(`loading model ${MODEL} …`);
const extractor = await pipeline("feature-extraction", MODEL);

function meanNormalize(vectors) {
  const dim = vectors[0].length;
  const avg = new Float64Array(dim);
  for (const v of vectors) for (let i = 0; i < dim; i++) avg[i] += v[i];
  for (let i = 0; i < dim; i++) avg[i] /= vectors.length;
  let n = 0;
  for (let i = 0; i < dim; i++) n += avg[i] * avg[i];
  n = Math.sqrt(n) || 1;
  return Array.from(avg, (x) => +(x / n).toFixed(6));
}

const clusters = [];
for (const cl of gt.serialClusters) {
  const texts = cl.memberCaseIds.map((id) => briefs.get(id)).filter(Boolean);
  const vecs = [];
  for (const t of texts) {
    const out = await extractor(t, { pooling: "mean", normalize: true });
    vecs.push(Array.from(out.data));
  }
  const m = meta[cl.id] || {};
  clusters.push({
    clusterId: cl.id, label: m.label ?? cl.label, crimeType: m.crimeType ?? "",
    districts: m.districts ?? [], memberCount: texts.length, confidence: m.confidence ?? 0.8,
    vector: meanNormalize(vecs),
  });
  console.log(`  ${cl.id} ${m.label ?? cl.label}: embedded ${texts.length} narratives`);
}

fs.writeFileSync(OUT, JSON.stringify({ model: MODEL, dim: clusters[0].vector.length, clusters }));
console.log(`\nwrote ${OUT} (${clusters.length} clusters, dim ${clusters[0].vector.length})`);
