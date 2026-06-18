"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    group: "Overview",
    items: [
      { href: "/dashboard",       icon: "📊", label: "Dashboard" },
      { href: "/dashboard/notes", icon: "📝", label: "My Notes" },
    ],
  },
  {
    group: "Actions",
    items: [
      { href: "/deposit", icon: "💸", label: "Send Tip" },
      { href: "/claim",   icon: "🔐", label: "Claim Tip" },
    ],
  },
];

export default function DashboardSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);

  return (
    <aside
      style={{ width: open ? "224px" : "56px" }}
      className="sticky top-0 h-screen flex-shrink-0 flex flex-col border-r border-white/10 bg-rich-black/90 backdrop-blur-xl transition-all duration-200 overflow-hidden"
    >
      {/* Logo + toggle */}
      <div className="flex items-center border-b border-white/10 px-3 py-4 gap-2">
        <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-neon-violet text-sm font-black shadow-[0_0_24px_rgba(107,69,243,0.5)]">
          G
        </div>
        {open && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white truncate">Growthip</p>
            <p className="text-xs text-soft-gray/45 truncate">Private tipping</p>
          </div>
        )}
        <button
          onClick={() => setOpen(!open)}
          className="flex-shrink-0 rounded-xl p-1.5 text-soft-gray/40 transition hover:bg-white/[0.06] hover:text-white"
          title={open ? "Collapse" : "Expand"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {open
              ? <path d="M15 18l-6-6 6-6" />
              : <path d="M9 18l6-6-6-6" />
            }
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-4">
        {NAV_ITEMS.map((group) => (
          <div key={group.group}>
            {open && (
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-widest text-soft-gray/30">
                {group.group}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={!open ? item.label : undefined}
                    className={
                      "flex items-center rounded-2xl px-3 py-2.5 text-sm font-semibold transition " +
                      (open ? "gap-3" : "justify-center") + " " +
                      (active
                        ? "bg-neon-violet/15 text-neon-violet"
                        : "text-soft-gray/55 hover:bg-white/[0.04] hover:text-white")
                    }
                  >
                    <span className="flex-shrink-0 text-base">{item.icon}</span>
                    {open && <span className="whitespace-nowrap">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 px-2 py-3 space-y-0.5">
        <div className={"flex items-center gap-2 rounded-2xl px-3 py-2 " + (!open ? "justify-center" : "")}>
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-fresh-green animate-pulse" />
          {open && <span className="whitespace-nowrap text-xs text-soft-gray/45">Stellar Testnet</span>}
        </div>

        <a
          href="https://github.com/dzakwannajmi/Growthip"
          target="_blank"
          rel="noreferrer"
          title={!open ? "GitHub" : undefined}
          className={"flex items-center rounded-2xl px-3 py-2.5 text-sm font-semibold text-soft-gray/55 transition hover:bg-white/[0.04] hover:text-white " + (open ? "gap-3" : "justify-center")}
        >
          <span className="flex-shrink-0 text-base">🔗</span>
          {open && <span className="whitespace-nowrap">GitHub</span>}
        </a>

        <Link
          href="/"
          title={!open ? "Back to Home" : undefined}
          className={"flex items-center rounded-2xl px-3 py-2.5 text-sm font-semibold text-soft-gray/55 transition hover:bg-white/[0.04] hover:text-white " + (open ? "gap-3" : "justify-center")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
            <path d="M19 12H5M5 12l7-7M5 12l7 7" />
          </svg>
          {open && <span className="whitespace-nowrap">Back to Home</span>}
        </Link>
      </div>
    </aside>
  );
}