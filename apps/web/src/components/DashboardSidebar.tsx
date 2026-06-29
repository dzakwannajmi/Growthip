"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";
import { useRegistryClient } from "@/lib/registryClient";
import { getProfile, avatarUrlFor } from "@/lib/profile";

const NAV_ITEMS = [
  { href: "/dashboard",           icon: "ph:house-line-bold",       label: "Dashboard" },
  { href: "/dashboard/activity",  icon: "ph:activity-bold",         label: "Activities" },
  { href: "/dashboard/analytics", icon: "ph:chart-bar-bold",        label: "Analytics", premium: true },
  { href: "/dashboard/links",     icon: "ph:link-bold",            label: "Links" },

];

const ACTION_ITEMS: { href: string; icon: string; label: string }[] = [];

function SpeechBubble({ label, show, premium }: { label: string; show: boolean; premium?: boolean }) {
  if (!show) return null;
  return (
    <div className="absolute top-1/2 -translate-y-1/2 left-[calc(100%+16px)] hidden md:flex items-center pointer-events-none z-[100]">
      <div className="w-0 h-0 border-y-[6px] border-y-transparent border-r-[8px] border-r-[#E5E5E5]" />
      <div className="bg-[#E5E5E5] text-[#0A0A0A] text-[13px] font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap shadow-md flex items-center gap-1.5">
        {label}
        {premium && <Icon icon="ph:crown-simple-fill" />}
      </div>
    </div>
  );
}

function NavLink({ item, collapsed, hovered, setHovered }: {
  item: { href: string; icon: string; label: string; premium?: boolean };
  collapsed: boolean;
  hovered: string | null;
  setHovered: (v: string | null) => void;
}) {
  const pathname = usePathname();
  const active   = pathname === item.href;

  return (
    <div
      className="relative group"
      onMouseEnter={() => setHovered(item.href)}
      onMouseLeave={() => setHovered(null)}
    >
      <Link
        href={item.href}
        style={collapsed
          ? { width: 48, height: 48, justifyContent: "center", padding: 0, margin: "0 auto", display: "flex", alignItems: "center", borderRadius: 12 }
          : {}
        }
        className={[
          "flex items-center gap-3 rounded-xl transition-all duration-200 text-sm relative overflow-hidden",
          collapsed ? "" : "px-4 py-3 w-full",
          active
            ? "bg-[#1A1A1A] text-white font-bold"
            : "text-[#525252] hover:bg-[#F0F0F0] hover:text-[#0A0A0A] font-medium",
        ].join(" ")}
      >
        {/* Orange left indicator — clips perfectly via overflow-hidden on parent */}
        {active && (
          <span className="absolute left-0 top-0 bottom-0 w-[6px] h-full bg-[#F59E0B]" />
        )}
        <Icon
          icon={item.icon}
          className={["text-xl flex-shrink-0", active ? "text-white" : ""].join(" ")}
        />
        {!collapsed && (
          <div className="flex items-center justify-between w-full">
            <span className="whitespace-nowrap">{item.label}</span>
            {item.premium && (
              <Icon
                icon="ph:crown-simple-fill"
                className={["text-sm", active ? "text-yellow-400" : "text-[#0A0A0A]"].join(" ")}
              />
            )}
          </div>
        )}
      </Link>
      {collapsed && <SpeechBubble label={item.label} show={hovered === item.href} premium={item.premium} />}
    </div>
  );
}

export default function DashboardSidebar() {
  const [open, setOpen]         = useState(true);
  const [hovered, setHovered]   = useState<string | null>(null);
  const [logoHover, setLogoHover] = useState(false);

  // Real connected-wallet profile data, replacing the previous hardcoded
  // "CR" / "@creator" / "Free Plan" placeholder.
  const [address, setAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isPremium, setIsPremium] = useState(false);
  const { isReady: registryReady, buildRegistryClient } = useRegistryClient();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const load = () => setAddress(localStorage.getItem("growthip:wallet") ?? "");
    load();
    const interval = setInterval(load, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!address) { setDisplayName(""); return; }
    setDisplayName(getProfile(address).displayName);
  }, [address]);

  useEffect(() => {
    if (!address || !registryReady) { setIsPremium(false); return; }
    (async () => {
      try {
        const client = buildRegistryClient(address);
        const result = await client.is_premium({ recipient: address });
        setIsPremium(result.result === true);
      } catch {
        setIsPremium(false);
      }
    })();
  }, [address, registryReady, buildRegistryClient]);
  const collapsed               = !open;

  return (
    <aside
      style={{
        width: collapsed ? "88px" : "256px",
        transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        overflow: collapsed ? "visible" : "hidden",
      }}
      className="relative h-full flex-shrink-0 flex flex-col bg-white border-r border-[#E5E5E5]"
    >
      {/* Brand */}
      <div
        className="px-6 py-6 flex items-center gap-3 shrink-0 relative z-20"
        style={{ justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? "24px 0" : undefined }}
      >
        <div
          className="relative"
          onMouseEnter={() => setLogoHover(true)}
          onMouseLeave={() => setLogoHover(false)}
        >
          <button
            onClick={() => setOpen(!open)}
            className="w-10 h-10 rounded-full hover:bg-[#F5F5F5] flex items-center justify-center transition-colors cursor-pointer text-[#0A0A0A]"
          >
            {logoHover
              ? <Icon icon="ph:sidebar-simple" className="text-2xl" />
              : <img src="/growthip-logo.png" alt="Growthip" className="w-7 h-7 object-contain" />
            }
          </button>
          {collapsed && (
            <div className="absolute top-1/2 -translate-y-1/2 left-[calc(100%+16px)] flex items-center pointer-events-none z-[100]" style={{ display: logoHover ? "flex" : "none" }}>
              <div className="w-0 h-0 border-y-[6px] border-y-transparent border-r-[8px] border-r-[#E5E5E5]" />
              <div className="bg-[#E5E5E5] text-[#0A0A0A] text-[13px] font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap shadow-md">
                Open sidebar
              </div>
            </div>
          )}
        </div>
        {!collapsed && (
          <span className="font-extrabold text-[#0A0A0A] text-xl tracking-tight">Growthip</span>
        )}
      </div>

      {/* Nav */}
      <div
        className="flex-1 flex flex-col pb-4"
        style={{ overflowY: collapsed ? "visible" : "auto" }}
      >
        <nav className="flex flex-col gap-1 px-3 flex-1">
          {/* Main nav */}
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} hovered={hovered} setHovered={setHovered} />
          ))}



          {/* Back to Home */}
          <div
            className="relative group"
            onMouseEnter={() => setHovered("home")}
            onMouseLeave={() => setHovered(null)}
          >
            <Link
              href="/"
              style={collapsed
                ? { width: 48, height: 48, justifyContent: "center", padding: 0, margin: "0 auto", display: "flex", alignItems: "center", borderRadius: 12 }
                : {}
              }
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

        {/* Premium card -- only shown if not already premium, and
            reflects the actual feature set + price (6 XLM one-time, see
            growthip-creator-registry). Previously hardcoded to a
            nonexistent "100 XLM" / "Unlimited withdrawals" / "Bulk
            withdraw" feature set that doesn't exist in this protocol. */}
        {!collapsed && !isPremium && (
          <div className="px-3 mt-2">
            <div className="rounded-2xl bg-[#0A0A0A] text-white p-4">
              <div className="flex items-center gap-2 font-bold text-sm mb-1">
                <Icon icon="ph:star-four-bold" />
                Upgrade to Premium
              </div>
              <p className="text-[11px] opacity-60 mb-3">6 XLM one-time, unlocks:</p>
              <ul className="space-y-1.5 mb-4">
                {["Encrypted private notes", "Creator analytics dashboard"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[11px] opacity-75">
                    <span className="w-1.5 h-1.5 rounded-full bg-white flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/dashboard/settings"
                className="w-full bg-white text-[#0A0A0A] font-bold text-xs py-2 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center"
              >
                Upgrade Now
              </Link>
            </div>
          </div>
        )}

        {/* Settings + Profile - bottom of sidebar */}
        <div className="px-3 mt-3 space-y-1">
          {/* Theme Toggle */}
          <div style={{ display: "flex", justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? "0" : "0 8px", marginBottom: "4px" }}>
            <ThemeToggle />
          </div>
          {/* Settings */}
          <div
            className="relative group"
            onMouseEnter={() => setHovered("settings")}
            onMouseLeave={() => setHovered(null)}
          >
            <Link
              href="/dashboard/settings"
              style={collapsed
                ? { width: 48, height: 48, justifyContent: "center", padding: 0, margin: "0 auto", display: "flex", alignItems: "center", borderRadius: 12 }
                : {}
              }
              className={[
                "flex items-center gap-3 rounded-xl transition-colors text-sm font-medium text-[#525252] hover:bg-[#F5F5F5]",
                collapsed ? "" : "px-4 py-3 w-full",
              ].join(" ")}
            >
              <Icon icon="ph:gear-six-bold" className="text-xl flex-shrink-0" />
              {!collapsed && <span className="whitespace-nowrap">Settings</span>}
            </Link>
            {collapsed && <SpeechBubble label="Settings" show={hovered === "settings"} />}
          </div>

          {/* Profile */}
          <div
            className="relative group"
            onMouseEnter={() => setHovered("profile")}
            onMouseLeave={() => setHovered(null)}
          >
            <Link
              href="/dashboard/profile"
              style={collapsed
                ? { width: 48, height: 48, justifyContent: "center", padding: 0, margin: "0 auto", display: "flex", alignItems: "center", borderRadius: 12, textDecoration: "none" }
                : { textDecoration: "none" }
              }
              className={[
                "flex items-center gap-3 rounded-xl hover:bg-[#F5F5F5] transition-colors",
                collapsed ? "" : "w-full p-3",
              ].join(" ")}
            >
              {address ? (
                <img
                  src={avatarUrlFor(address)}
                  alt="avatar"
                  className="w-9 h-9 rounded-full flex-shrink-0"
                  style={{ background: "#F5F5F5", border: "1px solid #E5E5E5" }}
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#E5E5E5] flex items-center justify-center font-bold text-[#A3A3A3] text-sm flex-shrink-0">
                  ?
                </div>
              )}
              {!collapsed && (
                <div className="flex flex-col text-left min-w-0">
                  <span className="text-sm font-bold text-[#0A0A0A] leading-tight truncate">
                    {displayName || (address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "Not connected")}
                  </span>
                  <span className="text-[10px] text-[#737373] leading-tight mt-0.5">
                    {isPremium ? "Premium" : "Free Plan"}
                  </span>
                </div>
              )}
            </Link>
            {collapsed && <SpeechBubble label="Profile" show={hovered === "profile"} />}
          </div>
        </div>
      </div>
    </aside>
  );
}