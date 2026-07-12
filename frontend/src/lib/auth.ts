// Demo auth: a role + jurisdiction session in localStorage. HQ sees the whole
// state; a District/Station officer picks their jurisdiction at sign-in and the
// app scopes every screen to it.
export type Role = "hq" | "district" | "station";

export interface Session {
  role: Role;
  label: string; // jurisdiction shown in the top bar
  roleLabel: string; // rank/role
  district: string | null; // null = whole state (HQ)
}

export const DISTRICTS = [
  "Bengaluru Urban", "Bengaluru Rural", "Ramanagara", "Kolar", "Chikkaballapura",
  "Tumakuru", "Mysuru", "Mandya", "Hassan", "Chamarajanagar", "Kodagu",
  "Dakshina Kannada", "Udupi", "Uttara Kannada", "Chikkamagaluru", "Shivamogga",
  "Davanagere", "Chitradurga", "Ballari", "Vijayanagara", "Koppal", "Raichur",
  "Yadgir", "Kalaburagi", "Bidar", "Vijayapura", "Bagalkot", "Belagavi",
  "Dharwad", "Gadag", "Haveri",
];

const KEY = "netra_session";

export function buildSession(role: Role, district: string | null): Session {
  if (role === "hq" || !district) {
    return { role: "hq", label: "Karnataka (HQ)", roleLabel: "DGP · State HQ", district: null };
  }
  if (role === "station") {
    return { role, label: `${district} — Station`, roleLabel: "SHO · Station", district };
  }
  return { role: "district", label: `${district} District`, roleLabel: "SP · District", district };
}

export function getSession(): Session {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const { role, district } = JSON.parse(raw);
      return buildSession(role, district ?? null);
    }
  } catch {
    /* ignore */
  }
  return buildSession("hq", null);
}

export function setSession(role: Role, district: string | null) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ role, district }));
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
