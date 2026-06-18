"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    group: "Overview",
    items: [
      { href: "/dashboard", icon: "📊", label: "Dashboard" },
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
  const pathname  = usePathname();
  const [open, setOpen] = useState(true);

  return (
    <>
      {/* Collapsed toggle button */}
      {!open && (
        <div className="fixed left-0 top-0 z-50 flex h-full w-14 flex-col items-center border-r border-white/10 bg-rich-black/90 backdrop-blur-xl py-4 gap-3">
          {/* Logo mini */}
          <button
            onClick={() => setOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-full bg-neon-violet text-sm font-black shadow-[0_0_30px_rgba(107,69,243,0.5)] transition hover:scale-110"
            title="Open sidebar"
          >
            G
          </button>
          <div className="mt-2 flex flex-col gap-3">
            {NAV_ITEMS.flatMap((g) => g.items).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={
                  "grid h-9 w-9 place-items-center rounded-2xl text-base transition " +
                  (pathname === item.href
                    ? "bg-neon-violet/20 text-neon-violet"
                    : "text-soft-gray/50 hover:bg-white/[0.06] hover:text-white")
                }
              >
                {item.icon}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Full sidebar */}
      {open && (
        <aside className="flex h-full w-60 flex-shrink-0 flex-col border-r border-white/10 bg-rich-black/90 backdrop-blur-xl">
          {/* Logo + toggle */}
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-neon-violet text-sm font-black shadow-[0_0_24px_rgba(107,69,243,0.5)]">
                G
              </div>
              <div>
                <p className="text-sm font-black text-white">Growthip</p>
                <p className="text-xs text-soft-gray/45">Private tipping</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-xl p-1.5 text-soft-gray/40 transition hover:bg-white/[0.06] hover:text-white"
              title="Collapse sidebar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-5">
            {NAV_ITEMS.map((group) => (
              <div key={group.group}>
                <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-widest text-soft-gray/30">
                  {group.group}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={
                          "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition " +
                          (active
                            ? "bg-neon-violet/15 text-neon-violet"
                            : "text-soft-gray/55 hover:bg-white/[0.04] hover:text-white")
                        }
                      >
                        <span className="text-base">{item.icon}</span>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="border-t border-white/10 px-3 py-3 space-y-0.5">
            <div className="flex items-center gap-2 rounded-2xl px-3 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-fresh-green animate-pulse" />
              <span className="text-xs text-soft-gray/45">Stellar Testnet</span>
            </div>
            <a
              href="https://github.com/dzakwannajmi/Growthip"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-soft-gray/55 transition hover:bg-white/[0.04] hover:text-white"
            >
              <span className="text-base">🔗</span>
              GitHub
            </a>
            <Link
              href="/"
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-soft-gray/55 transition hover:bg-white/[0.04] hover:text-white"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
                <path d="M19 12H5M5 12l7-7M5 12l7 7" />
              </svg>
              Back to Home
            </Link>
          </div>
        </aside>
      )}

      {/* Spacer when collapsed */}
      {!open && <div className="w-14 flex-shrink-0" />}
    </>
  );
}