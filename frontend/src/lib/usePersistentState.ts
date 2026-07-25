import { useEffect, useState } from "react";

// Bump this to make the whole app "feel new": every persisted view-state (tabs, selections,
// filters, AND the map camera — which uses nsKey too) is stored under this version, so changing it
// makes the previous state invisible and the app opens at defaults again. Persistence within a
// session still works normally. Bump it right before publishing a fresh demo/submission link.
export const STORAGE_VERSION = "v2";
export const nsKey = (key: string) => `${STORAGE_VERSION}:${key}`;

// A useState that SURVIVES route unmount/remount (React Router unmounts a page on navigation, which
// otherwise resets all its useState back to defaults). Mirrors the value to sessionStorage under a
// stable key, so leaving a screen and coming back keeps the tab, selection or filters you had.
// Use ONLY for user view-state (tabs, selected item, filters) — not for fetched data or transient
// loading flags. sessionStorage (not local) so it clears when the tab closes, and it's per-session.
export function usePersistentState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const k = nsKey(key);
  const [val, setVal] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(k);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(k, JSON.stringify(val));
    } catch {
      /* quota / serialization — non-fatal, just lose persistence for this key */
    }
  }, [k, val]);
  return [val, setVal];
}
