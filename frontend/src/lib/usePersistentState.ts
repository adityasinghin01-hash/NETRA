import { useEffect, useState } from "react";

// A useState that SURVIVES route unmount/remount (React Router unmounts a page on navigation, which
// otherwise resets all its useState back to defaults). Mirrors the value to sessionStorage under a
// stable key, so leaving a screen and coming back keeps the tab, selection or filters you had.
// Use ONLY for user view-state (tabs, selected item, filters) — not for fetched data or transient
// loading flags. sessionStorage (not local) so it clears when the tab closes, and it's per-session.
export function usePersistentState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [val, setVal] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(val));
    } catch {
      /* quota / serialization — non-fatal, just lose persistence for this key */
    }
  }, [key, val]);
  return [val, setVal];
}
