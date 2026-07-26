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

// Warm the remaining page chunks so clicking a nav item never waits on the network — but STRICTLY
// in the background, behind whatever the officer is actually looking at.
//
// Measured on the live host: firing all seven at once on idle made Analytics (494kB) take 16
// SECONDS and starved the Command Map's own basemap tiles and incident data, which were competing
// for the same few connections. Prefetching that fights the visible page is worse than no
// prefetching. Two rules fix it:
//   1. SEQUENTIAL — one chunk at a time, so at most one prefetch is ever in flight.
//   2. LATE — a real delay after mount, so the current page's data lands first.
// Order is cheapest-and-likeliest first; Analytics is last because it is by far the heaviest.
const PREFETCH_ORDER = ["alerts", "cases", "linkage", "briefing", "documents", "map", "analytics"] as const;

// How long to stay out of the way before warming anything. The map's tiles + JSON need roughly
// this long on a cold load; starting sooner is what caused the contention above.
const PREFETCH_DELAY_MS = 8000;

let prefetched = false;

export function prefetchPages() {
  if (prefetched) return; // shell can remount on navigation; warm once per page load
  prefetched = true;

  const run = async () => {
    for (const key of PREFETCH_ORDER) {
      // Sequential on purpose — `await` here is the whole point, not an oversight.
      await pageImports[key]().catch(() => {});
    }
  };

  setTimeout(() => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => void run(), { timeout: 4000 });
    else void run();
  }, PREFETCH_DELAY_MS);
}
