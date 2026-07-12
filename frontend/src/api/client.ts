// NETRA API client. Mock-first: develop against pipeline-derived mocks, then
// flip VITE_USE_MOCKS=false when the AppSail APIs land — no reshaping needed
// (mock payloads match docs/SYSTEM_DESIGN.md §4). See TEAMMATE_FRONTEND_GUIDE §5.
import seed from "@/mocks/seed.json";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";
const BASE = "/api/v1";

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
