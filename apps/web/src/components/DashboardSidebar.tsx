"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";

const NAV_ITEMS = [
  { href: "/dashboard",           icon: "ph:house-line-bold",    label: "Dashboard" },
  { href: "/dashboard/notes",     icon: "ph:note-bold",          label: "My Notes" },
  { href: "/dashboard/activity",  icon: "ph:activity-bold",      label: "Activities" },
  { href: "/dashboard/analytics", icon: "ph:chart-bar-bold",     label: "Analytics", premium: true },
];

const BOTTOM_ITEMS = [
  { href: "/dashboard/deposit",   icon: "ph:paper-plane-tilt-bold", label: "Send Tip" },
  { href: "/dashboard/claim",     icon: "ph:lock-key-bold",          label: "Claim Tip" },
  { href: "/dashboard/settings",  icon: "ph:gear-six-bold",          label: "Settings" },
];

interface TooltipProps { label: string; show: boolean; premium?: boolean }

function SpeechBubble({ label, show, premium }: TooltipProps) {
  if (!show) return null;
  return (
    <div className="absolute top-1/2 -translate-y-1/2 left-[calc(100%+8px)] flex items-center pointer-events-none z-[100]">
      <div className="w-0 h-0 border-y-[6px] border-y-transparent border-r-[8px] border-r-light-200 dark:border-r-light-200" />
      <div className="bg-light-200 dark:bg-light-200 text-dark-base text-[13px] font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap shadow-md flex items-center gap-1.5">
        {label}
        {premium && <Icon icon="ph:crown-simple-fill" className="text-dark-base" />}
      </div>
    </div>
  );
}

export default function DashboardSidebar() {
  const pathname              = usePathname();
  const [open, setOpen]       = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <aside
      id="sidebar"
      style={{ width: open ? "256px" : "88px" }}
      className={
        "relative h-full flex-shrink-0 flex flex-col bg-light-base dark:bg-dark-base border-r border-light-200 dark:border-dark-100 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] " +
        (!open ? "overflow-visible" : "overflow-hidden")
      }
    >
      {/* Header / Brand */}
      <div
        className="px-6 py-6 flex items-center gap-3 brand-header relative shrink-0 z-20"
        style={{ justifyContent: open ? "flex-start" : "center" }}
      >
        <div
          className="relative group flex-shrink-0"
          onMouseEnter={() => setHovered("logo")}
          onMouseLeave={() => setHovered(null)}
        >
          <button
            onClick={() => setOpen(!open)}
            className="relative w-10 h-10 rounded-full hover:bg-light-200 dark:hover:bg-dark-100 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer text-light-950 dark:text-dark-900"
          >
            {/* G logo — normal, toggle icon on hover is handled via CSS */}
            <span className="font-extrabold text-xl">G</span>
          </button>
          <SpeechBubble label={open ? "Close sidebar" : "Open sidebar"} show={!open && hovered === "logo"} />
        </div>
        {open && (
          <span className="font-extrabold text-light-950 dark:text-dark-950 text-xl tracking-tight cursor-default sidebar-text">
            Growthip
          </span>
        )}
      </div>

      {/* Scrollable Nav */}
      <div
        className="flex-1 flex flex-col justify-between pb-4"
        style={{ overflowY: open ? "auto" : "visible" }}
      >
        <nav className="flex flex-col gap-1 px-3" id="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <div
                key={item.href}
                className="relative group"
                onMouseEnter={() => setHovered(item.href)}
                onMouseLeave={() => setHovered(null)}
              >
                <Link
                  href={item.href}
                  className={
                    "nav-item w-full relative flex items-center gap-3 py-3 rounded-xl text-light-600 dark:text-dark-400 hover:bg-light-100 dark:hover:bg-dark-50 transition-colors text-left text-sm " +
                    (open ? "px-4" : "justify-center px-0 w-12 h-12 mx-auto") + " " +
                    (active ? "active" : "")
                  }
                >
                  <Icon icon={item.icon} className="text-xl flex-shrink-0" />
                  {open && (
                    <div className="flex items-center justify-between w-full sidebar-text">
                      <span className="whitespace-nowrap">{item.label}</span>
                      {item.premium && (
                        <Icon icon="ph:crown-simple-fill" className="text-light-950 dark:text-dark-950 text-sm" />
                      )}
                    </div>
                  )}
                </Link>
                <SpeechBubble label={item.label} show={!open && hovered === item.href} premium={item.premium} />
              </div>
            );
          })}

          {/* Divider */}
          <div className={
            "h-px bg-light-200 dark:bg-dark-100 my-2 divider " +
            (open ? "mx-4" : "w-12 mx-auto")
          } />

          {BOTTOM_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <div
                key={item.href}
                className="relative group"
                onMouseEnter={() => setHovered(item.href)}
                onMouseLeave={() => setHovered(null)}
              >
                <Link
                  href={item.href}
                  className={
                    "nav-item w-full relative flex items-center gap-3 py-3 rounded-xl text-light-600 dark:text-dark-400 hover:bg-light-100 dark:hover:bg-dark-50 transition-colors text-left text-sm " +
                    (open ? "px-4" : "justify-center px-0 w-12 h-12 mx-auto") + " " +
                    (active ? "active" : "")
                  }
                >
                  <Icon icon={item.icon} className="text-xl flex-shrink-0" />
                  {open && <span className="whitespace-nowrap sidebar-text">{item.label}</span>}
                </Link>
                <SpeechBubble label={item.label} show={!open && hovered === item.href} />
              </div>
            );
          })}

          {/* Back to Home */}
          <div
            className="relative group"
            onMouseEnter={() => setHovered("home")}
            onMouseLeave={() => setHovered(null)}
          >
            <Link
              href="/"
              className={
                "nav-item w-full relative flex items-center gap-3 py-3 rounded-xl text-light-600 dark:text-dark-400 hover:bg-light-100 dark:hover:bg-dark-50 transition-colors text-left text-sm " +
                (open ? "px-4" : "justify-center px-0 w-12 h-12 mx-auto")
              }
            >
              <Icon icon="ph:arrow-circle-left-bold" className="text-xl flex-shrink-0" />
              {open && <span className="whitespace-nowrap sidebar-text">Back to Home</span>}
            </Link>
            <SpeechBubble label="Back to Home" show={!open && hovered === "home"} />
          </div>
        </nav>

        {/* Premium upgrade card */}
        {open && (
          <div className="px-3 mt-4">
            <div className="sidebar-premium rounded-2xl bg-light-950 dark:bg-dark-950 text-light-base dark:text-dark-base p-4">
              <div className="flex items-center gap-2 font-bold text-sm mb-1">
                <Icon icon="ph:star-four-bold" className="text-base" />
                Upgrade to Premium
              </div>
              <p className="text-[11px] opacity-70 mb-3">100 XLM for unlimited features</p>
              <ul className="space-y-1.5 mb-4">
                {["Unlimited withdrawals", "Advanced analytics", "Bulk withdraw"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[11px] opacity-80">
                    <span className="w-1.5 h-1.5 rounded-full bg-fresh-green flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button className="w-full bg-light-base dark:bg-dark-base text-light-950 dark:text-dark-950 font-bold text-xs py-2 rounded-xl transition hover:opacity-90">
                Upgrade Now
              </button>
            </div>
          </div>
        )}

        {/* Profile footer */}
        <div className="px-3 mt-4">
          <div
            className="relative group"
            onMouseEnter={() => setHovered("profile")}
            onMouseLeave={() => setHovered(null)}
          >
            <button
              className={
                "w-full relative flex items-center gap-3 p-3 rounded-xl hover:bg-light-100 dark:hover:bg-dark-50 transition-colors " +
                (open ? "" : "justify-center")
              }
            >
              <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center font-bold text-white text-sm flex-shrink-0 overflow-hidden">
                CR
              </div>
              {open && (
                <div className="flex flex-col text-left sidebar-text">
                  <span className="text-sm font-bold text-light-950 dark:text-dark-950 leading-tight">@creator</span>
                  <span className="text-[10px] text-light-500 dark:text-dark-500 leading-tight mt-0.5">Free Plan</span>
                </div>
              )}
            </button>
            <SpeechBubble label="Profile" show={!open && hovered === "profile"} />
          </div>
        </div>
      </div>
    </aside>
  );
}