import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setSession, DISTRICTS, type Role } from "@/lib/auth";
import logoImg from "@/assets/logo.png";

const ROLE_CHIP: { role: Role; label: string }[] = [
  { role: "hq", label: "HQ" },
  { role: "district", label: "District" },
  { role: "station", label: "Station" },
];

export default function Login() {
  const nav = useNavigate();
  const [role, setRole] = useState<Role>("hq");
  const [district, setDistrict] = useState<string>("Mysuru");
  const [email, setEmail] = useState("dgp@ksp.gov.in");
  const [pw, setPw] = useState("demo");

  function signIn(e: React.FormEvent) {
    e.preventDefault();
    setSession(role, role === "hq" ? null : district);
    nav("/map");
  }

  const roleLabel = role === "hq" ? "DGP" : role === "district" ? "SP" : "SHO";

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-[360px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
        <div className="mb-6 text-center">
          <img src={logoImg} alt="NETRA Logo" className="mx-auto w-14 h-14 object-contain drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]" />
          <div className="mt-2 text-lg font-semibold tracking-wide">NETRA</div>
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
            Sign in as {roleLabel}
          </button>
        </form>
        <div className="mt-4">
          <div className="mb-1.5 text-center text-[10px] uppercase tracking-wide text-[var(--color-text-mute)]">Sign in as</div>
          <div className="flex justify-center gap-2">
            {ROLE_CHIP.map((r) => (
              <button
                key={r.role}
                onClick={() => setRole(r.role)}
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
          {role !== "hq" && (
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            >
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>{d}{role === "station" ? " (station)" : " district"}</option>
              ))}
            </select>
          )}
        </div>
        <div className="mt-5 text-center text-[10px] text-[var(--color-text-mute)]">
          KSP Datathon 2026 prototype — synthetic data only
        </div>
      </div>
    </div>
  );
}
