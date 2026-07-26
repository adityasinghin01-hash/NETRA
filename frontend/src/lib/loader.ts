// Memoized async loaders that DON'T cache failures. The naive pattern
// (`if (!p) p = fetch(...).then(r => r.json())`) memoizes a REJECTED promise on a
// transient network blip, permanently poisoning the loader for the whole session with
// no retry. These helpers clear the cache on rejection so the next call retries, and
// check response.ok so a non-OK HTML body doesn't get parsed as JSON.

// Fetch JSON with bounded retry + exponential backoff.
//
// The host serving this app was measured aborting transfers MID-BODY on cold requests — a 1.8MB
// file stopping at 1.2MB after 60s, then succeeding in 3s on the very next try. A plain
// `fetch().then(r => r.json())` turns that into a permanently empty map or chart, because the
// abort surfaces as a rejection from r.json() and every call site swallowed it. Retrying is the
// correct response precisely BECAUSE the failure is transient: the retry is what makes it work.
//
// `r.json()` is awaited inside the try on purpose — a stream that dies mid-body rejects there,
// not at the initial fetch(), so parsing has to be inside the retried block to be caught.
// T defaults to `any` to match what `r.json()` already returned at every call site — this helper
// is a drop-in for `fetch(u).then(r => r.json())`, so it must not tighten inference and force
// unrelated changes at 35 call sites.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchJson<T = any>(url: string, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`fetch ${r.status} for ${url}`);
      return (await r.json()) as T;
    } catch (e) {
      lastErr = e;
      // 400ms, then 800ms. Long enough to clear a transient stall, short enough that a genuinely
      // dead asset fails fast instead of holding a spinner for the length of a demo.
      if (attempt < tries - 1) await new Promise((res) => setTimeout(res, 400 * 2 ** attempt));
    }
  }
  throw lastErr;
}

// Memoize a JSON fetch. `url` is a thunk so BASE_URL is read at call time.
export function memoJson<T>(url: () => string): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => {
    if (!p) {
      p = fetchJson<T>(url()).catch((e) => {
        p = null; // don't cache the failure → the next call retries
        throw e;
      });
    }
    return p;
  };
}

// Memoize any async factory (e.g. the transformers.js pipeline load), same no-cache-on-failure rule.
export function memoAsync<T>(factory: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => {
    if (!p) {
      p = factory().catch((e) => {
        p = null;
        throw e;
      });
    }
    return p;
  };
}
