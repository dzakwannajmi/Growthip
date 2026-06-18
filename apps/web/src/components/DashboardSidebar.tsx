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
  Activity,
  Settings,
  Crown,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard",          icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/notes",    icon: FileText,        label: "My Notes" },
  { href: "/dashboard/activity", icon: Activity,        label: "Activity" },
  { href: "/dashboard/analytics",icon: BarChart3,       label: "Analytics", premium: true },
];

const BOTTOM_ITEMS = [
  { href: "/dashboard/deposit",  icon: Send,  label: "Send Tip" },
  { href: "/dashboard/claim",    icon: Lock,  label: "Claim Tip" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

interface TooltipProps { label: string; show: boolean }

function SpeechBubble({ label, show }: TooltipProps) {
  if (!show) return null;
  return (
    <div className="absolute top-1/2 -translate-y-1/2 left-[calc(100%+8px)] flex items-center pointer-events-none z-[100]">
      <div className="w-0 h-0 border-y-[6px] border-y-transparent border-r-[8px] border-r-light-200 dark:border-r-dark-300" />
      <div className="bg-light-200 dark:bg-dark-300 text-dark-base dark:text-light-50 text-[13px] font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap shadow-md">
        {label}
      </div>
    </div>
  );
}

export default function DashboardSidebar() {
  const pathname                = usePathname();
  const [open, setOpen]         = useState(true);
  const [hovered, setHovered]   = useState<string | null>(null);

  return (
    <aside
      style={{ width: open ? "256px" : "88px" }}
      className="relative h-full flex-shrink-0 flex flex-col bg-light-base dark:bg-dark-base border-r border-light-200 dark:border-dark-100 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
    >
      {/* Header / Brand */}
      <div
        className="px-6 py-6 flex items-center gap-3 shrink-0 relative z-20"
        style={{ justifyContent: open ? "flex-start" : "center", paddingLeft: open ? undefined : "0", paddingRight: open ? undefined : "0" }}
      >
        <div
          className="relative group flex-shrink-0"
          onMouseEnter={() => !open && setHovered("logo")}
          onMouseLeave={() => setHovered(null)}
        >
          <button
            onClick={() => setOpen(!open)}
            className="relative w-10 h-10 rounded-full hover:bg-light-200 dark:hover:bg-dark-100 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer text-light-950 dark:text-dark-900"
          >
            <span className="font-extrabold text-xl font-sans">G</span>
          </button>
          <SpeechBubble label={open ? "Close sidebar" : "Open sidebar"} show={hovered === "logo"} />
        </div>
        {open && (
          <span className="font-extrabold text-light-950 dark:text-dark-950 text-xl tracking-tight cursor-default">
            Growthip
          </span>
        )}
      </div>

      {/* Nav */}
      <div
        className="flex-1 flex flex-col justify-between pb-4"
        style={{ overflowY: open ? "auto" : "visible" }}
      >
        <nav className="flex flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href === "/dashboard" && pathname === "/dashboard");
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
                    "nav-item w-full relative flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors " +
                    (!open ? "justify-center px-0 py-0 w-12 h-12 mx-auto" : "pl-4") + " " +
                    (active
                      ? "bg-light-200 dark:bg-dark-100 text-light-950 dark:text-dark-950 font-bold"
                      : "text-light-600 dark:text-dark-400 hover:bg-light-100 dark:hover:bg-dark-50 font-medium")
                  }
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {open && (
                    <div className="flex items-center justify-between w-full">
                      <span className="whitespace-nowrap">{item.label}</span>
                      {item.premium && <Crown size={13} className="text-light-950 dark:text-dark-950" />}
                    </div>
                  )}
                </Link>
                {!open && <SpeechBubble label={item.label} show={hovered === item.href} />}
              </div>
            );
          })}

          {/* Divider */}
          <div className={
            "h-px bg-light-200 dark:bg-dark-100 my-2 " +
            (open ? "mx-4" : "w-12 mx-auto")
          } />

          {BOTTOM_ITEMS.map((item) => {
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
                    "nav-item w-full relative flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors " +
                    (!open ? "justify-center px-0 py-0 w-12 h-12 mx-auto" : "pl-4") + " " +
                    (active
                      ? "bg-light-200 dark:bg-dark-100 text-light-950 dark:text-dark-950 font-bold"
                      : "text-light-600 dark:text-dark-400 hover:bg-light-100 dark:hover:bg-dark-50 font-medium")
                  }
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {open && <span className="whitespace-nowrap">{item.label}</span>}
                </Link>
                {!open && <SpeechBubble label={item.label} show={hovered === item.href} />}
              </div>
            );
          })}

          {/* Back to Home */}
          <div
            className="relative group"
            onMouseEnter={() => !open && setHovered("home")}
            onMouseLeave={() => setHovered(null)}
          >
            <Link
              href="/"
              className={
                "nav-item w-full relative flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-light-600 dark:text-dark-400 hover:bg-light-100 dark:hover:bg-dark-50 transition-colors " +
                (!open ? "justify-center px-0 py-0 w-12 h-12 mx-auto" : "pl-4")
              }
            >
              <Home size={18} className="flex-shrink-0" />
              {open && <span className="whitespace-nowrap">Back to Home</span>}
            </Link>
            {!open && <SpeechBubble label="Back to Home" show={hovered === "home"} />}
          </div>
        </nav>

        {/* Profile footer */}
        {open && (
          <div className="px-3 mt-4">
            <button className="w-full relative group flex items-center gap-3 p-3 rounded-xl hover:bg-light-100 dark:hover:bg-dark-50 transition-colors">
              <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center font-bold text-white text-sm flex-shrink-0 overflow-hidden">
                C
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold text-light-950 dark:text-dark-950 leading-tight">@creator</span>
                <span className="text-[10px] text-light-500 dark:text-dark-500 leading-tight mt-0.5">Free Plan</span>
              </div>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}