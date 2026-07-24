// Shared live-alert store. The Alert Center owned this state privately, which meant the nav bell
// had nothing to show a badge from and no way to react when a detection arrived. One module now
// owns the feed, the progressive-arrival queue and the workflow statuses, and every consumer
// (nav bell + Alert Center) reads the same snapshot — so a new alert lights up the bell in the
// same tick it lands on the page.
//
// Honest: the feed is precomputed by build_alerts.py; the store reveals real detections OVER TIME
// so the monitor reads as live. Nothing is fabricated — reveal-over-time only.
import { getSession } from "@/lib/auth";

export interface Alert {
  id: string; type: string; severity: string; district: string; crimeType: string;
  message: string; why: string; count: number; date: string; status: string;
  crimeNo?: string | null; clusterId?: string | null;
}

export const FLOW = ["New", "Acknowledged", "Assigned", "Resolved"];
export const SYNC_MS = 40000;   // feed re-sync + one queued detection surfaces
const INITIAL_SHOWN = 4;
const FLASH_MS = 7000;
const OVERRIDE_KEY = "netra_alert_status";

export interface LiveState {
  alerts: Alert[] | null;
  shown: string[];        // ids that have "arrived"
  queue: string[];        // ids still scanning
  justId: string | null;  // the one flashing NEW
  override: Record<string, string>;
  lastSync: Date | null;
}

// Statuses persist so acknowledging an alert survives navigating away and back — otherwise the
// bell count would jump back up the moment you left the page.
function loadOverride(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || "{}"); } catch { return {}; }
}
function saveOverride(o: Record<string, string>) {
  try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o)); } catch { /* ignore */ }
}

let state: LiveState = {
  alerts: null, shown: [], queue: [], justId: null, override: loadOverride(), lastSync: null,
};
const subs = new Set<() => void>();
// A new object identity per emit is what lets useSyncExternalStore detect the change.
function set(patch: Partial<LiveState>) {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}

const inScope = (a: Alert, scope: string | null) =>
  !scope || a.district.includes(scope) || a.district === "state-wide";

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let flashTimer: ReturnType<typeof setTimeout> | null = null;
let loadedOnce = false;

async function pull() {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}alerts-feed.json?t=${Date.now()}`, { cache: "no-store" });
    const d: Alert[] = await r.json();
    loadedOnce = true;
    const scope = getSession().district;
    const ids = d.filter((a) => inScope(a, scope)).map((a) => a.id);
    // Seed once; afterwards only APPEND genuinely-new ids, never reset the reveal (a plain re-seed
    // on every sync would snap the list back to the first few and new alerts would never surface).
    if (!state.shown.length && !state.queue.length) {
      set({ alerts: d, lastSync: new Date(), shown: ids.slice(0, INITIAL_SHOWN), queue: ids.slice(INITIAL_SHOWN) });
    } else {
      const known = new Set([...state.shown, ...state.queue]);
      const fresh = ids.filter((id) => !known.has(id));
      set({ alerts: d, lastSync: new Date(), queue: fresh.length ? [...state.queue, ...fresh] : state.queue });
    }
  } catch {
    // A transient failure on a later sync must not wipe an already-loaded feed.
    if (!loadedOnce) set({ alerts: [] });
  }
}

function revealNext() {
  if (!state.queue.length) return;
  const [next, ...queue] = state.queue;
  set({ shown: [next, ...state.shown], queue, justId: next });
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => set({ justId: null }), FLASH_MS);
}

function start() {
  if (started) return;
  started = true;
  void pull();
  timer = setInterval(() => { void pull().then(revealNext); }, SYNC_MS);
}

/** Advance an alert along New → Acknowledged → Assigned → Resolved. */
export function advanceStatus(id: string, current: string) {
  const i = FLOW.indexOf(current);
  const next = { ...state.override, [id]: FLOW[Math.min(i + 1, FLOW.length - 1)] };
  saveOverride(next);
  set({ override: next });
}

export function subscribe(cb: () => void) {
  subs.add(cb);
  start();
  return () => {
    subs.delete(cb);
    // The store is app-wide (the nav bell is always mounted); tear down only if nothing is left.
    if (subs.size === 0 && timer) { clearInterval(timer); timer = null; started = false; }
  };
}

export const getSnapshot = () => state;

/** Alerts that have arrived, in scope, with any workflow status applied. Newest arrival first. */
export function arrived(s: LiveState): Alert[] {
  const scope = getSession().district;
  const byId = new Map(
    (s.alerts ?? []).filter((a) => inScope(a, scope)).map((a) => [a.id, { ...a, status: s.override[a.id] ?? a.status }])
  );
  return s.shown.map((id) => byId.get(id)).filter(Boolean) as Alert[];
}
