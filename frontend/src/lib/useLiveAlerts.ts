// React binding for the shared live-alert store. Any component that calls this re-renders the
// instant a detection arrives or a status changes — which is what makes the nav bell live.
import { useSyncExternalStore } from "react";
import { subscribe, getSnapshot, arrived, type Alert, type LiveState } from "@/lib/liveAlerts";

export function useLiveAlerts(): LiveState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface AlertCounts {
  unread: number;   // arrived + still "New" → the bell badge
  open: number;     // anything not Resolved
  high: number;     // high severity, not Resolved
  incoming: number; // detections still scanning (not yet surfaced)
  list: Alert[];
}

export function useAlertCounts(): AlertCounts {
  const s = useLiveAlerts();
  const list = arrived(s);
  return {
    unread: list.filter((a) => a.status === "New").length,
    open: list.filter((a) => a.status !== "Resolved").length,
    high: list.filter((a) => a.severity === "high" && a.status !== "Resolved").length,
    incoming: s.queue.length,
    list,
  };
}
