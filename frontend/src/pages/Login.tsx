import { useState } from "react";
import { useNavigate } from "react-router-dom";

const DEMO_ROLES = [
  { role: "HQ", email: "dgp@ksp.gov.in" },
  { role: "District", email: "sp.mysuru@ksp.gov.in" },
  { role: "Station", email: "sho.whitefield@ksp.gov.in" },
];

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-[360px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
        <div className="mb-6 text-center">
          <div className="text-3xl">👁️</div>
          <div className="mt-1 text-lg font-semibold tracking-wide">NETRA</div>
          <div className="text-xs text-[var(--color-text-dim)]">Crime intelligence for Karnataka Police</div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            nav("/map");
          }}
          className="space-y-3"
        >
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
            Sign in
          </button>
        </form>
        <div className="mt-4 flex justify-center gap-2">
          {DEMO_ROLES.map((r) => (
            <button
              key={r.role}
              onClick={() => {
                setEmail(r.email);
                setPw("demo");
              }}
              className="rounded-full border border-[var(--color-border-strong)] px-2.5 py-1 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-accent)]"
            >
              {r.role}
            </button>
          ))}
        </div>
        <div className="mt-6 text-center text-[10px] text-[var(--color-text-mute)]">
          KSP Datathon 2026 prototype — synthetic data only
        </div>
      </div>
    </div>
  );
}
