import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { IS_MOCK } from "@/api/client";
import { getSession, clearSession } from "@/lib/auth";
import { Badge } from "./ui";
import Copilot from "./Copilot";
import VoiceMode from "./VoiceMode";

const NAV = [
  { to: "/map", label: "Command Map", icon: "🗺️" },
  { to: "/linkage", label: "Linkage", icon: "🕸️" },
  { to: "/analytics", label: "Analytics", icon: "📊" },
  { to: "/cases", label: "Case Search", icon: "🔎" },
  { to: "/briefing", label: "Briefing", icon: "📄" },
  { to: "/documents", label: "Documents", icon: "📁" },
  { to: "/alerts", label: "Alerts", icon: "🔔" },
];

export default function AppShell() {
  const nav = useNavigate();
  const session = getSession();
  const initials = session.roleLabel.split(" · ")[0];
  const [alertCount, setAlertCount] = useState(0);
  const [talk, setTalk] = useState(false);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}alerts-feed.json`).then((r) => r.json())
      .then((a: { severity: string }[]) => setAlertCount(a.filter((x) => x.severity === "high").length))
      .catch(() => {});
  }, []);
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="text-lg">👁️</span>
          <span className="font-semibold tracking-wide text-[var(--color-text)]">NETRA</span>
        </div>
        <nav className="flex-1 px-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-[var(--color-surface-2)] text-[var(--color-accent)]"
                    : "text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                }`
              }
            >
              <span>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-[var(--color-border)] px-4 py-3 text-xs text-[var(--color-text-mute)]">
          Karnataka State Police
          <div className="mt-1">Datathon 2026 · synthetic data</div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-6">
          <div className="text-sm text-[var(--color-text-dim)]">
            Jurisdiction: <span className="text-[var(--color-text)]">{session.label}</span>
            <span className="ml-2 text-xs text-[var(--color-text-mute)]">· {session.roleLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            {IS_MOCK && <Badge tone="warn">MOCK DATA</Badge>}
            <NavLink to="/alerts" className="relative text-lg" title="Alert Center">
              🔔
              {alertCount > 0 && (
                <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[9px] font-semibold text-white">
                  {alertCount}
                </span>
              )}
            </NavLink>
            <button
              onClick={() => {
                clearSession();
                nav("/login");
              }}
              className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-accent)]"
            >
              Sign out
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[10px] font-medium">
              {initials}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      <Copilot onOpenTalk={() => setTalk(true)} />
      <VoiceMode open={talk} onClose={() => setTalk(false)} />
    </div>
  );
}
