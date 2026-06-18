"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Send,
  Lock,
  BarChart3,
  Home,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";

const NAV_ITEMS = [
  {
    group: "Overview",
    items: [
      { href: "/dashboard/analytics", icon: BarChart3,      label: "Analytics" },
      { href: "/dashboard/notes",     icon: FileText,        label: "My Notes" },
    ],
  },
  {
    group: "Actions",
    items: [
      { href: "/dashboard/deposit",   icon: Send,            label: "Send Tip" },
      { href: "/dashboard/claim",     icon: Lock,            label: "Claim Tip" },
    ],
  },
];

interface TooltipProps {
  label: string;
  visible: boolean;
}

function Tooltip({ label, visible }: TooltipProps) {
  if (!visible) return null;
  return (
    <div className="absolute top-1/2 -translate-y-1/2 left-[calc(100%+12px)] flex items-center pointer-events-none z-[100]">
      <div className="w-0 h-0 border-y-[6px] border-y-transparent border-r-[8px] border-r-white/20" />
      <div className="bg-white/10 backdrop-blur-xl text-white text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg border border-white/10">
        {label}
      </div>
    </div>
  );
}

export default function DashboardSidebar() {
  const pathname  = usePathname();
  const [open, setOpen] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <aside
      style={{ width: open ? "224px" : "72px" }}
      className="sticky top-0 h-screen flex-shrink-0 flex flex-col border-r border-white/10 bg-rich-black backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-visible"
    >
      {/* Header / Logo */}
      <div
        className="flex items-center border-b border-white/10 px-4 py-5 shrink-0"
        style={{ gap: open ? "12px" : "0", justifyContent: open ? "flex-start" : "center" }}
      >
        <div
          className="relative group flex-shrink-0"
          onMouseEnter={() => !open && setHovered("logo")}
          onMouseLeave={() => setHovered(null)}
        >
          <button
            onClick={() => setOpen(!open)}
            className="w-9 h-9 rounded-full bg-neon-violet flex items-center justify-center text-white font-black text-sm shadow-[0_0_20px_rgba(107,69,243,0.5)] hover:scale-110 transition-transform"
          >
            {open ? <ChevronLeft size={16} /> : <span className="font-black">G</span>}
          </button>
          {!open && (
            <Tooltip label="Open sidebar" visible={hovered === "logo"} />
          )}
        </div>

        {open && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white truncate">Growthip</p>
            <p className="text-xs text-soft-gray/45 truncate">Private tipping</p>
          </div>
        )}

        {open && (
          <button
            onClick={() => setOpen(false)}
            className="flex-shrink-0 p-1.5 rounded-lg text-soft-gray/40 hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <Menu size={14} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav
        className="flex-1 px-2 py-4 space-y-4"
        style={{ overflowY: open ? "auto" : "visible" }}
      >
        {NAV_ITEMS.map((group) => (
          <div key={group.group}>
            {open && (
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-widest text-soft-gray/30">
                {group.group}
              </p>
            )}
            {!open && <div className="h-px bg-white/5 mx-2 mb-2" />}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                const Icon   = item.icon;
                return (
                  <div
                    key={item.href}
                    className="relative group"
                    onMouseEnter={() => !open && setHovered(item.href)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <Link
                      href={item.href}
                      className={
                        "flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150 " +
                        (open ? "gap-3" : "justify-center w-10 h-10 mx-auto") + " " +
                        (active
                          ? "bg-neon-violet/15 text-neon-violet"
                          : "text-soft-gray/55 hover:bg-white/[0.05] hover:text-white")
                      }
                    >
                      <Icon size={18} className="flex-shrink-0" />
                      {open && <span className="whitespace-nowrap">{item.label}</span>}
                    </Link>
                    {!open && (
                      <Tooltip label={item.label} visible={hovered === item.href} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 px-2 py-3 space-y-0.5 shrink-0">
        {/* Testnet indicator */}
        <div
          className={
            "flex items-center gap-2 rounded-xl px-3 py-2 " +
            (!open ? "justify-center" : "")
          }
        >
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-fresh-green animate-pulse" />
          {open && (
            <span className="text-xs text-soft-gray/45 whitespace-nowrap">
              Stellar Testnet
            </span>
          )}
        </div>

        {/* GitHub */}
        <div
          className="relative group"
          onMouseEnter={() => !open && setHovered("github")}
          onMouseLeave={() => setHovered(null)}
        >
          <a
            href="https://github.com/dzakwannajmi/Growthip"
            target="_blank"
            rel="noreferrer"
            className={
              "flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold text-soft-gray/55 transition-all hover:bg-white/[0.05] hover:text-white " +
              (open ? "gap-3" : "justify-center w-10 h-10 mx-auto")
            }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
            </svg>
            {open && <span className="whitespace-nowrap">GitHub</span>}
          </a>
          {!open && <Tooltip label="GitHub" visible={hovered === "github"} />}
        </div>

        {/* Back to Home */}
        <div
          className="relative group"
          onMouseEnter={() => !open && setHovered("home")}
          onMouseLeave={() => setHovered(null)}
        >
          <Link
            href="/"
            className={
              "flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold text-soft-gray/55 transition-all hover:bg-white/[0.05] hover:text-white " +
              (open ? "gap-3" : "justify-center w-10 h-10 mx-auto")
            }
          >
            <Home size={16} className="flex-shrink-0" />
            {open && <span className="whitespace-nowrap">Back to Home</span>}
          </Link>
          {!open && <Tooltip label="Back to Home" visible={hovered === "home"} />}
        </div>
      </div>
    </aside>
  );
}