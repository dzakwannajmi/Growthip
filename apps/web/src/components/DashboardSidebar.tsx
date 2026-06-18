"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";

const NAV_ITEMS = [
  { href: "/dashboard",           icon: "ph:house-line-bold",       label: "Dashboard" },
  { href: "/dashboard/notes",     icon: "ph:note-bold",             label: "My Notes" },
  { href: "/dashboard/activity",  icon: "ph:activity-bold",         label: "Activities" },
  { href: "/dashboard/analytics", icon: "ph:chart-bar-bold",        label: "Analytics", premium: true },
];

const BOTTOM_ITEMS = [
  { href: "/dashboard/deposit",   icon: "ph:paper-plane-tilt-bold", label: "Send Tip" },
  { href: "/dashboard/claim",     icon: "ph:lock-key-bold",         label: "Claim Tip" },
  { href: "/dashboard/settings",  icon: "ph:gear-six-bold",         label: "Settings" },
];

function SpeechBubble({ label, show, premium }: { label: string; show: boolean; premium?: boolean }) {
  if (!show) return null;
  return (
    <div className="absolute top-1/2 -translate-y-1/2 left-[calc(100%+8px)] flex items-center pointer-events-none z-[100]">
      <div className="w-0 h-0 border-y-[6px] border-y-transparent border-r-[8px] border-r-[#E5E5E5]" />
      <div className="bg-[#E5E5E5] text-[#0A0A0A] text-[13px] font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap shadow-md flex items-center gap-1.5">
        {label}
        {premium && <Icon icon="ph:crown-simple-fill" />}
      </div>
    </div>
  );
}

export default function DashboardSidebar() {
  const pathname              = usePathname();
  const [open, setOpen]       = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);

  const collapsed = !open;

  return (
    <aside
      style={{
        width: collapsed ? "88px" : "256px",
        transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        overflow: collapsed ? "visible" : "hidden",
      }}
      className="relative h-full flex-shrink-0 flex flex-col bg-white border-r border-[#E5E5E5]"
    >
      {/* Brand header */}
      <div
        className="px-6 py-6 flex items-center gap-3 shrink-0 relative z-20"
        style={{ justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? "24px 0" : undefined }}
      >
        <div
          className="relative group"
          onMouseEnter={() => setHovered("logo")}
          onMouseLeave={() => setHovered(null)}
        >
          <button
            onClick={() => setOpen(!open)}
            className="w-10 h-10 rounded-full hover:bg-[#F5F5F5] flex items-center justify-center transition-colors cursor-pointer text-[#0A0A0A]"
          >
            <span className="font-extrabold text-xl">G</span>
          </button>
          {collapsed && <SpeechBubble label="Open sidebar" show={hovered === "logo"} />}
        </div>
        {!collapsed && (
          <span className="font-extrabold text-[#0A0A0A] text-xl tracking-tight">Growthip</span>
        )}
      </div>

      {/* Nav body */}
      <div
        className="flex-1 flex flex-col justify-between pb-4"
        style={{ overflowY: collapsed ? "visible" : "auto" }}
      >
        <nav className="flex flex-col gap-1 px-3">
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
                  style={collapsed ? { width: 48, height: 48, justifyContent: "center", padding: 0, margin: "0 auto", display: "flex", alignItems: "center", borderRadius: 12 } : {}}
                  className={[
                    "flex items-center gap-3 rounded-xl transition-colors text-sm",
                    collapsed ? "" : "px-4 py-3 w-full",
                    active
                      ? "bg-[#E5E5E5] text-[#0A0A0A] font-bold"
                      : "text-[#525252] hover:bg-[#F5F5F5] font-medium",
                  ].join(" ")}
                >
                  <Icon icon={item.icon} className="text-xl flex-shrink-0" />
                  {!collapsed && (
                    <div className="flex items-center justify-between w-full">
                      <span className="whitespace-nowrap">{item.label}</span>
                      {item.premium && <Icon icon="ph:crown-simple-fill" className="text-[#0A0A0A] text-sm" />}
                    </div>
                  )}
                </Link>
                {collapsed && <SpeechBubble label={item.label} show={hovered === item.href} premium={item.premium} />}
              </div>
            );
          })}

          {/* Divider */}
          <div
            style={collapsed ? { width: 48, margin: "8px auto" } : { margin: "8px 16px" }}
            className="h-px bg-[#E5E5E5]"
          />

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
                  style={collapsed ? { width: 48, height: 48, justifyContent: "center", padding: 0, margin: "0 auto", display: "flex", alignItems: "center", borderRadius: 12 } : {}}
                  className={[
                    "flex items-center gap-3 rounded-xl transition-colors text-sm",
                    collapsed ? "" : "px-4 py-3 w-full",
                    active
                      ? "bg-[#E5E5E5] text-[#0A0A0A] font-bold"
                      : "text-[#525252] hover:bg-[#F5F5F5] font-medium",
                  ].join(" ")}
                >
                  <Icon icon={item.icon} className="text-xl flex-shrink-0" />
                  {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                </Link>
                {collapsed && <SpeechBubble label={item.label} show={hovered === item.href} />}
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
              style={collapsed ? { width: 48, height: 48, justifyContent: "center", padding: 0, margin: "0 auto", display: "flex", alignItems: "center", borderRadius: 12 } : {}}
              className={[
                "flex items-center gap-3 rounded-xl transition-colors text-sm font-medium text-[#525252] hover:bg-[#F5F5F5]",
                collapsed ? "" : "px-4 py-3 w-full",
              ].join(" ")}
            >
              <Icon icon="ph:arrow-circle-left-bold" className="text-xl flex-shrink-0" />
              {!collapsed && <span className="whitespace-nowrap">Back to Home</span>}
            </Link>
            {collapsed && <SpeechBubble label="Back to Home" show={hovered === "home"} />}
          </div>
        </nav>

        {/* Premium card */}
        {!collapsed && (
          <div className="px-3 mt-4">
            <div className="rounded-2xl bg-[#0A0A0A] text-white p-4">
              <div className="flex items-center gap-2 font-bold text-sm mb-1">
                <Icon icon="ph:star-four-bold" />
                Upgrade to Premium
              </div>
              <p className="text-[11px] opacity-60 mb-3">100 XLM for unlimited features</p>
              <ul className="space-y-1.5 mb-4">
                {["Unlimited withdrawals", "Advanced analytics", "Bulk withdraw"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[11px] opacity-75">
                    <span className="w-1.5 h-1.5 rounded-full bg-white flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button className="w-full bg-white text-[#0A0A0A] font-bold text-xs py-2 rounded-xl hover:opacity-90 transition-opacity">
                Upgrade Now
              </button>
            </div>
          </div>
        )}

        {/* Profile */}
        <div className="px-3 mt-4">
          <div
            className="relative group"
            onMouseEnter={() => setHovered("profile")}
            onMouseLeave={() => setHovered(null)}
          >
            <button
              style={collapsed ? { width: 48, height: 48, justifyContent: "center", padding: 0, margin: "0 auto", display: "flex", alignItems: "center", borderRadius: 12 } : {}}
              className={[
                "flex items-center gap-3 rounded-xl hover:bg-[#F5F5F5] transition-colors",
                collapsed ? "" : "w-full p-3",
              ].join(" ")}
            >
              <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
                CR
              </div>
              {!collapsed && (
                <div className="flex flex-col text-left">
                  <span className="text-sm font-bold text-[#0A0A0A] leading-tight">@creator</span>
                  <span className="text-[10px] text-[#737373] leading-tight mt-0.5">Free Plan</span>
                </div>
              )}
            </button>
            {collapsed && <SpeechBubble label="Profile" show={hovered === "profile"} />}
          </div>
        </div>
      </div>
    </aside>
  );
}