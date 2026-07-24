// Memoized async loaders that DON'T cache failures. The naive pattern
// (`if (!p) p = fetch(...).then(r => r.json())`) memoizes a REJECTED promise on a
// transient network blip, permanently poisoning the loader for the whole session with
// no retry. These helpers clear the cache on rejection so the next call retries, and
// check response.ok so a non-OK HTML body doesn't get parsed as JSON.

// Memoize a JSON fetch. `url` is a thunk so BASE_URL is read at call time.
export function memoJson<T>(url: () => string): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => {
    if (!p) {
      p = fetch(url())
        .then((r) => {
          if (!r.ok) throw new Error(`fetch ${r.status} for ${url()}`);
          return r.json() as Promise<T>;
        })
        .catch((e) => {
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
