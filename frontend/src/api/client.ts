// NETRA API client. Mock-first: develop against pipeline-derived mocks, then
// flip VITE_USE_MOCKS=false when the AppSail APIs land — no reshaping needed
// (mock payloads match docs/SYSTEM_DESIGN.md §4). See TEAMMATE_FRONTEND_GUIDE §5.
import seed from "@/mocks/seed.json";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";
// Live API: the Catalyst Advanced I/O function, same origin as the hosted client.
// Reads dashboard payloads from Data Store: /server/netra_api/data/<rkey>
const BASE = "/server/netra_api/data";

// Map an API path (without /api/v1) to a key in the mock seed.
const MOCK_KEYS: Record<string, string> = {
  "/geo/districts": "geo/districts",
  "/stats/summary": "stats/summary",
  "/stats/trends": "stats/trends",
  "/stats/outcomes": "stats/outcomes",
  "/linkage/clusters": "linkage/clusters",
  "/alerts": "alerts",
  "/network/graph": "network/graph",
  "/data-quality": "data-quality",
  "/cases/sample": "cases/sample",
  "/briefings/today": "briefings/today",
};

export async function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 180)); // simulate latency so loading states show
    const key = MOCK_KEYS[path.split("?")[0]];
    if (key && key in (seed as Record<string, unknown>)) {
      return (seed as Record<string, unknown>)[key] as T;
    }
    throw new Error(`No mock for ${path}`);
  }
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
  });
  if (!res.ok) throw new Error(`API ${res.status} for ${path}`);
  const body = await res.json();
  return (body.data ?? body) as T;
}

export const IS_MOCK = USE_MOCKS;

export interface ClusterMatch {
  clusterId: string;
  label: string;
  crimeType: string;
  districts: string[];
  memberCount: number;
  confidence: number;
  score: number;
}
export interface MatchResult {
  method: string;
  best: ClusterMatch;
  matches: ClusterMatch[];
}

export interface Party { name: string; age?: number | null; gender?: string; priorCases?: number; historySheeter?: boolean }
export interface Forensic {
  weapon: string;
  tools: string[];
  evidenceRecovered: string[];
  fingerprint: string;
  seizure: { memoNo: string; panchnama: string; seizingOfficer: string; malkhana: string; custody: string };
  fsl: { ref: string; status: string } | null;
}
export interface CaseRow {
  crimeNo: string;
  registeredDate: string;
  districtName: string;
  crimeSubHead: string;
  gravity: string;
  status: string;
  language: string;
  briefFacts: string;
  complainant?: Party | null;
  accused?: Party[];
  forensic?: Forensic | null;
}

// Case search over the 50k Cases table (filters + FIR-number lookup, paginated).
export async function searchCases(
  params: Record<string, string>
): Promise<{ items: CaseRow[]; hasMore: boolean; page: number }> {
  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 200));
    const sample = ((seed as Record<string, unknown>)["cases/sample"] as CaseRow[]) ?? [];
    return { items: sample, hasMore: false, page: 0 };
  }
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString();
  const res = await fetch(`/server/netra_api/cases?${qs}`);
  if (!res.ok) throw new Error(`search failed (${res.status})`);
  return res.json();
}

// Look up ONE FIR by its crime number. The Copilot's knowledge-card corpus only holds aggregates
// (clusters, districts, alerts…), not the 50k individual records — so to answer "tell me about FIR
// <n>" it must query the live Cases table (the same source Case Search uses, backend ?q=<firNo>).
// Returns null when not found, so the Copilot can say so honestly instead of implying it exists.
export async function lookupFir(firNo: string): Promise<CaseRow | null> {
  const num = String(firNo).replace(/\D/g, "");
  if (num.length < 6) return null;
  if (USE_MOCKS) {
    const sample = ((seed as Record<string, unknown>)["cases/sample"] as CaseRow[]) ?? [];
    return sample.find((c) => String(c.crimeNo) === num) ?? null;
  }
  // Retry once: the Advanced I/O function can cold-start and time out the first hit, which showed up
  // as a spurious "I don't hold the full FIR record" that worked on the reworded retry.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`/server/netra_api/cases?q=${encodeURIComponent(num)}`);
      if (res.ok) {
        const body = await res.json();
        const items: CaseRow[] = body.items ?? [];
        const hit = items.find((c) => String(c.crimeNo) === num) ?? null;
        if (hit) return hit;
      }
    } catch {
      /* fall through to retry */
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400)); // brief cold-start backoff
  }
  return null;
}

// Live case-linkage match: POST a FIR narrative, get the best-matching serial cluster.
export async function matchFir(text: string): Promise<MatchResult> {
  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 500));
    const clusters = (seed as Record<string, unknown>)["linkage/clusters"] as ClusterMatch[];
    const best = { ...clusters[0], score: 82 };
    return { method: "keyword", best, matches: clusters.slice(0, 5).map((c, i) => ({ ...c, score: 82 - i * 20 })) };
  }
  const res = await fetch("/server/netra_api/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`match failed (${res.status})`);
  return res.json();
}
