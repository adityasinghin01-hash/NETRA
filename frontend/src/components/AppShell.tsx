import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { gsap } from "gsap";
import { IS_MOCK } from "@/api/client";
import { getSession, clearSession } from "@/lib/auth";
import { Badge } from "./ui";
import Copilot from "./Copilot";
import logoImg from "@/assets/logo.png";

const NAV = [
  { to: "/map", label: "Command Map", icon: "map" },
  { to: "/linkage", label: "Linkage", icon: "network" },
  { to: "/analytics", label: "Analytics", icon: "bar-chart-3" },
  { to: "/cases", label: "Case Search", icon: "search" },
  { to: "/briefing", label: "Briefing", icon: "file-text" },
  { to: "/documents", label: "Documents", icon: "folder" },
  { to: "/alerts", label: "Alerts", icon: "bell" },
];

function NavIcon({ name, className = "" }: { name: string; className?: string }) {
  switch (name) {
    case "map":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
          <line x1="9" y1="3" x2="9" y2="18" />
          <line x1="15" y1="6" x2="15" y2="21" />
        </svg>
      );
    case "network":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="16" y="16" width="6" height="6" rx="1" />
          <rect x="2" y="16" width="6" height="6" rx="1" />
          <rect x="9" y="2" width="6" height="6" rx="1" />
          <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
          <path d="M12 12V8" />
        </svg>
      );
    case "bar-chart-3":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M18 17V9" />
          <path d="M13 17V5" />
          <path d="M8 17v-3" />
        </svg>
      );
    case "search":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case "file-text":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M10 9H8" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </svg>
      );
    case "folder":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
      );
    case "bell":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      );
    default:
      return null;
  }
}

export default function AppShell() {
  const nav = useNavigate();
  const location = useLocation();
  const session = getSession();
  const initials = session.roleLabel.split(" · ")[0];
  const [alertCount, setAlertCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}alerts-feed.json`)
      .then((r) => r.json())
      .then((a: { severity: string }[]) => setAlertCount(a.filter((x) => x.severity === "high").length))
      .catch(() => {});
  }, []);

  const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const item = e.currentTarget;
    const icon = item.querySelector(".nav-icon");
    gsap.to(item, { x: 4, duration: 0.2, ease: "power1.out" });
    if (icon && !item.classList.contains("text-cyan-400")) {
      gsap.to(icon, { scale: 1.1, duration: 0.2 });
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const item = e.currentTarget;
    const icon = item.querySelector(".nav-icon");
    gsap.to(item, { x: 0, duration: 0.2, ease: "power1.out" });
    if (icon && !item.classList.contains("text-cyan-400")) {
      gsap.to(icon, { scale: 1, duration: 0.2 });
    }
  };

  // Auto-close sidebar on small screens when route changes
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  return (
    <div className="relative flex h-screen overflow-hidden bg-[var(--color-bg)]">
      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* NETRA Sidebar Container */}
      <aside
        className={`w-64 bg-[#090d16] border-r border-slate-800/60 flex flex-col justify-between h-full select-none shrink-0 fixed inset-y-0 left-0 z-50 transition-all duration-300 ease-in-out md:static ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:hidden"
        }`}
      >
        {/* Top Header Section */}
        <div>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/40">
            <div className="flex items-center gap-3">
              {/* Official App Logo */}
              <div className="relative flex items-center justify-center shrink-0">
                <img src={logoImg} alt="NETRA Logo" className="w-8 h-8 object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
              </div>
              {/* Brand Title */}
              <span className="text-sm font-bold tracking-widest text-slate-100 uppercase">Netra</span>
            </div>
            {/* Menu Toggle Button */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded hover:bg-slate-800/40"
              title="Collapse menu"
              aria-label="Collapse menu"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" x2="20" y1="12" y2="12" />
                <line x1="4" x2="20" y1="6" y2="6" />
                <line x1="4" x2="20" y1="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="px-3 py-4 space-y-1 custom-scrollbar overflow-y-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className={({ isActive }) =>
                  `nav-item group relative flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "text-cyan-400 bg-cyan-500/5 border border-cyan-500/20 shadow-[0_0_12px_rgba(6,182,212,0.05)]"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <div className="absolute left-0 top-1/4 bottom-1/4 w-[3px] bg-cyan-500 rounded-r" />}
                    <div className="flex items-center gap-3">
                      <NavIcon
                        name={n.icon}
                        className={`nav-icon w-4 h-4 transition-colors ${
                          isActive ? "text-cyan-400" : "text-slate-500 group-hover:text-slate-300"
                        }`}
                      />
                      <span>{n.label}</span>
                    </div>
                    {n.to === "/alerts" && alertCount > 0 && (
                      <span className="text-amber-500 text-xs font-bold tnum">
                        {alertCount}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Bottom Footer Credentials & Profile Section */}
        <div className="border-t border-slate-800/40 bg-[#070a10] px-4 py-3.5 space-y-3">
          {/* User Profile Card with DGP / Initials Badge & Sign Out Button */}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800/60 bg-[#0c121e] p-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 border border-cyan-500/30 text-[10px] font-bold text-cyan-400">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-200 truncate">{session.roleLabel.split(" · ")[0]}</div>
                <div className="text-[10px] text-slate-400 truncate">{session.roleLabel.split(" · ")[1] ?? "Karnataka Police"}</div>
              </div>
            </div>
            <button
              onClick={() => {
                clearSession();
                nav("/login");
              }}
              className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-rose-400 transition-colors shrink-0 px-2 py-1 rounded hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20"
              title="Sign out"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>

          <div className="px-1 text-[10px] text-slate-500">
            <p className="font-semibold text-slate-400">Karnataka State Police</p>
            <p className="mt-0.5">Datathon 2026 • synthetic data</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 md:px-6 bg-[var(--color-surface)]/80 backdrop-blur-md z-30">
          <div className="flex items-center gap-3">
            {/* Show Hamburger button in header ONLY when sidebar is collapsed/closed */}
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 text-[var(--color-text)] hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-surface-2)] transition-colors focus:outline-none"
                title="Expand menu"
                aria-label="Open navigation menu"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}

            <div className="text-sm text-[var(--color-text-dim)] truncate">
              Jurisdiction: <span className="text-[var(--color-text)] font-medium">{session.label}</span>
              <span className="hidden sm:inline-block ml-2 text-xs text-[var(--color-text-mute)]">· {session.roleLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {IS_MOCK && <Badge tone="warn">MOCK DATA</Badge>}
            <NavLink to="/alerts" className="relative p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-[var(--color-surface-2)] transition-colors" title="Alert Center">
              <svg className="w-5 h-5 text-cyan-400 stroke-[2]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
              </svg>
              {alertCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[9px] font-semibold text-white">
                  {alertCount}
                </span>
              )}
            </NavLink>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
      <Copilot />
    </div>
  );
}
