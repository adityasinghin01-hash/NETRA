// Lightweight demo auth: a role-scoped session in localStorage. Maps the police
// hierarchy (HQ / District / Station) to a jurisdiction; the app scopes data to it.
export type Role = "hq" | "district" | "station";

export interface Session {
  role: Role;
  label: string; // jurisdiction shown in the top bar
  roleLabel: string; // rank/role
  district: string | null; // null = whole state (HQ)
}

export const SESSIONS: Record<Role, Session> = {
  hq: { role: "hq", label: "Karnataka (HQ)", roleLabel: "DGP · State HQ", district: null },
  district: { role: "district", label: "Mysuru District", roleLabel: "SP · District", district: "Mysuru" },
  station: { role: "station", label: "Whitefield, Bengaluru Urban", roleLabel: "SHO · Station", district: "Bengaluru Urban" },
};

const KEY = "netra_session";

export function getSession(): Session {
  try {
    const r = localStorage.getItem(KEY) as Role | null;
    if (r && SESSIONS[r]) return SESSIONS[r];
  } catch {
    /* ignore */
  }
  return SESSIONS.hq;
}

export function setSession(role: Role) {
  try {
    localStorage.setItem(KEY, role);
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
