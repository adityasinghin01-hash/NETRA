import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setSession, SESSIONS, type Role } from "@/lib/auth";

const ROLE_EMAIL: Record<Role, string> = {
  hq: "dgp@ksp.gov.in",
  district: "sp.mysuru@ksp.gov.in",
  station: "sho.whitefield@ksp.gov.in",
};
const ROLE_CHIP: { role: Role; label: string }[] = [
  { role: "hq", label: "HQ" },
  { role: "district", label: "District" },
  { role: "station", label: "Station" },
];

export default function Login() {
  const nav = useNavigate();
  const [role, setRole] = useState<Role>("hq");
  const [email, setEmail] = useState(ROLE_EMAIL.hq);
  const [pw, setPw] = useState("demo");

  function signIn(e: React.FormEvent) {
    e.preventDefault();
    setSession(role);
    nav("/map");
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-[360px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
        <div className="mb-6 text-center">
          <div className="text-3xl">👁️</div>
          <div className="mt-1 text-lg font-semibold tracking-wide">NETRA</div>
          <div className="text-xs text-[var(--color-text-dim)]">Crime intelligence for Karnataka Police</div>
        </div>
        <form onSubmit={signIn} className="space-y-3">
          <input
            type="email"
            placeholder="Official email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <input
            type="password"
            placeholder="Password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-[var(--color-accent)] py-2 text-sm font-medium text-[var(--color-bg)] transition-opacity hover:opacity-90"
          >
            Sign in as {SESSIONS[role].roleLabel.split(" · ")[0]}
          </button>
        </form>
        <div className="mt-4">
          <div className="mb-1.5 text-center text-[10px] uppercase tracking-wide text-[var(--color-text-mute)]">Sign in as</div>
          <div className="flex justify-center gap-2">
            {ROLE_CHIP.map((r) => (
              <button
                key={r.role}
                onClick={() => {
                  setRole(r.role);
                  setEmail(ROLE_EMAIL[r.role]);
                }}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  role === r.role
                    ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                    : "border-[var(--color-border-strong)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="mt-2 text-center text-[10px] text-[var(--color-text-mute)]">{SESSIONS[role].label}</div>
        </div>
        <div className="mt-5 text-center text-[10px] text-[var(--color-text-mute)]">
          KSP Datathon 2026 prototype — synthetic data only
        </div>
      </div>
    </div>
  );
}
