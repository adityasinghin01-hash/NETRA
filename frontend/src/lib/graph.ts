// GraphRAG: reason over NETRA's crime knowledge graph (offenders ↔ rings ↔ clusters ↔
// districts). Entity-links the query, traverses 1–2 hops, and verbalizes the subgraph as
// grounded context the LLM (or template) can reason over — multi-hop answers flat search can't give.
export interface Entity { id: string; type: string; name: string; [k: string]: unknown }
export interface Relation { src: string; rel: string; dst: string; [k: string]: unknown }
interface KG { entities: Entity[]; relations: Relation[] }

let kgP: Promise<KG> | null = null;
function getKG(): Promise<KG> {
  if (!kgP) kgP = fetch(`${import.meta.env.BASE_URL}copilot-kg.json`).then((r) => r.json());
  return kgP;
}
export function preloadGraph() { getKG(); }

const REL_PHRASE: Record<string, string> = {
  co_offends: "co-offends with", member_of: "is a member of", leads: "leads/anchors",
  spans: "operates across", based_near: "is based near", predicted_tie: "has a predicted (emerging) tie to",
};

// Find entities named in the query (offenders, rings, clusters, districts).
function matchEntities(q: string, kg: KG): Entity[] {
  const lo = q.toLowerCase();
  const hits: Entity[] = [];
  for (const e of kg.entities) {
    const n = e.name.toLowerCase();
    if (n.length < 3) continue;
    // full-name or any significant word match
    if (lo.includes(n) || n.split(/\s+/).some((w) => w.length > 3 && lo.includes(w))) hits.push(e);
  }
  // de-dup by id, prefer offenders/clusters/rings over districts
  const seen = new Set<string>();
  return hits
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => rank(b.type) - rank(a.type))
    .slice(0, 4);
}
const rank = (t: string) => ({ offender: 3, cluster: 3, ring: 2, district: 1 } as Record<string, number>)[t] ?? 0;

export interface GraphContext { entities: Entity[]; facts: string[] }

// Traverse up to `hops` from the matched entities and return verbalized relation facts.
export async function graphContext(query: string, hops = 2): Promise<GraphContext | null> {
  const kg = await getKG();
  const seeds = matchEntities(query, kg);
  if (!seeds.length) return null;
  const byId = new Map(kg.entities.map((e) => [e.id, e]));
  const visited = new Set<string>(seeds.map((e) => e.id));
  let frontier = new Set<string>(seeds.map((e) => e.id));
  const facts: string[] = [];

  for (let h = 0; h < hops; h++) {
    const next = new Set<string>();
    for (const r of kg.relations) {
      const touchSrc = frontier.has(r.src), touchDst = frontier.has(r.dst);
      if (!touchSrc && !touchDst) continue;
      const s = byId.get(r.src), d = byId.get(r.dst);
      if (!s || !d) continue;
      const phrase = REL_PHRASE[r.rel] ?? r.rel;
      const extra = r.via ? ` (via ${(r.via as string[]).join(", ")})` : r.weight ? ` (${r.weight} shared cases)` : "";
      facts.push(`${s.name} ${phrase} ${d.name}${extra}.`);
      if (touchSrc && !visited.has(r.dst)) { next.add(r.dst); visited.add(r.dst); }
      if (touchDst && !visited.has(r.src)) { next.add(r.src); visited.add(r.src); }
    }
    frontier = next;
    if (!frontier.size) break;
  }
  // de-dup facts, cap
  const uniq = [...new Set(facts)].slice(0, 14);
  const entities = [...visited].map((id) => byId.get(id)!).filter(Boolean).slice(0, 12);
  return uniq.length ? { entities, facts: uniq } : null;
}
