"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    group: "Overview",
    items: [
      { href: "/dashboard",          icon: "📊", label: "Dashboard" },
      { href: "/dashboard/notes",    icon: "📝", label: "My Notes" },
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

  return (
    <aside className="flex h-full w-64 flex-col border-r border-white/10 bg-rich-black/80 backdrop-blur-xl">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-neon-violet text-sm font-black shadow-[0_0_30px_rgba(107,69,243,0.5)]">
          G
        </div>
        <div>
          <p className="text-sm font-black text-white">Growthip</p>
          <p className="text-xs text-soft-gray/50">Private tipping</p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {NAV_ITEMS.map((group) => (
          <div key={group.group}>
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-soft-gray/35">
              {group.group}
            </p>
            <div className="space-y-1">
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
                        : "text-soft-gray/60 hover:bg-white/[0.04] hover:text-white")
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
      <div className="border-t border-white/10 px-4 py-4 space-y-1">
        <div className="flex items-center gap-2 rounded-2xl px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-fresh-green animate-pulse" />
          <span className="text-xs text-soft-gray/50">Stellar Testnet</span>
        </div>
        <a
          href="https://github.com/dzakwannajmi/Growthip"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-soft-gray/60 transition hover:bg-white/[0.04] hover:text-white"
        >
          <span className="text-base">🔗</span>
          GitHub
        </a>
        <Link
          href="/"
          className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-soft-gray/60 transition hover:bg-white/[0.04] hover:text-white"
        >
          <span className="text-base">←</span>
          Back to Home
        </Link>
      </div>
    </aside>
  );
}