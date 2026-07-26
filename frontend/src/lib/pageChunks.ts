// The lazy page-chunk loaders, kept in their own module so AppShell can trigger prefetching
// without importing App.tsx (App -> AppShell -> App would be a circular import).
//
// Every page used to be a static import in App.tsx, so the entry bundle carried MapLibre + deck.gl
// + Recharts + react-force-graph + the transformers runtime — 3.4MB that had to arrive before the
// LOGIN screen could paint. Each page is its own chunk now.
export const pageImports = {
  map: () => import("@/pages/CommandMap"),
  linkage: () => import("@/pages/Linkage"),
  analytics: () => import("@/pages/Analytics"),
  cases: () => import("@/pages/Cases"),
  briefing: () => import("@/pages/Briefing"),
  documents: () => import("@/pages/DocumentCenter"),
  alerts: () => import("@/pages/AlertCenter"),
};

// Pull every remaining page chunk during idle time, once the first route is on screen.
// Splitting alone would trade one slow load for seven possible ones — on a host that stalls cold
// requests, a chunk fetched at click time is a chunk that can hang mid-demo. Prefetching on idle
// means the chunk is already in cache before anyone touches the nav, so navigation stays as instant
// as it was with the single bundle. Failures are swallowed: this is opportunistic, and React.lazy
// fetches for real on navigation if a prefetch didn't land.
export function prefetchPages() {
  const run = () => {
    for (const load of Object.values(pageImports)) load().catch(() => {});
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1200);
}
