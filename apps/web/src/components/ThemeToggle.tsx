"use client";
import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";

// Background: light → dark
const BG_MAP: Record<string, string> = {
  "white": "#1a1a1a",
  "#ffffff": "#1a1a1a",
  "#fafafa": "#111111",
  "#f5f5f5": "#1e1e1e",
  "#ebebeb": "#1e1e1e",
  "#e5e5e5": "#2a2a2a",
  "#f0f0f0": "#1e1e1e",
  "rgb(255, 255, 255)": "#1a1a1a",
  "rgb(250, 250, 250)": "#111111",
  "rgb(249, 250, 251)": "#141414",
  "rgb(245, 245, 245)": "#1e1e1e",
  "rgb(238, 238, 238)": "#1e1e1e",
  "rgb(240, 253, 244)": "#1a2e1a",
  "#f0fdf4": "#1a2e1a",
  "#eef2ff": "#1a1f2e",
  "#fffbeb": "#2b220d",
  "#fef2f2": "#2d1515",
  "#f5f3ff": "#1a1030",
  "#eff6ff": "#0d1f2b",
  "#fff7ed": "#2b1a0d",
  "#fce7f3": "#2b0d1a",
  "rgb(239, 246, 255)": "#0d1f2b",
  "rgb(254, 242, 242)": "#2b0d0d",
  "rgb(255, 251, 235)": "#2b220d",
  "rgb(245, 243, 255)": "#1a1030",
  "rgb(238, 242, 255)": "#0d1030",
};

// Text: dark → light (only dark text becomes light)
const TEXT_MAP: Record<string, string> = {
  "rgb(10, 10, 10)": "#f5f5f5",
  "rgb(23, 23, 23)": "#f0f0f0",
  "rgb(38, 38, 38)": "#e0e0e0",
  "rgb(64, 64, 64)": "#c0c0c0",
  "rgb(82, 82, 82)": "#b0b0b0",
  "rgb(115, 115, 115)": "#8a8a8a",
  "rgb(163, 163, 163)": "#6a6a6a",
};

// Border: light → dark
const BORDER_MAP: Record<string, string> = {
  "rgb(229, 229, 229)": "#2a2a2a",
  "rgb(212, 212, 212)": "#2a2a2a",
  "rgb(228, 228, 231)": "#2a2a2a",
  "rgb(245, 245, 245)": "#2a2a2a",
  "rgb(250, 250, 250)": "#2a2a2a",
  "rgb(255, 255, 255)": "#2a2a2a",
};

const BG_PROPS = ["background", "backgroundColor"];
const TEXT_PROPS = ["color"];
const BORDER_PROPS = ["borderColor", "borderTopColor", "borderBottomColor", "borderLeftColor", "borderRightColor"];
const STYLE_PROPS = [...BG_PROPS, ...TEXT_PROPS, ...BORDER_PROPS];

let observer: MutationObserver | null = null;
let isDark = false;

function colorElement(el: HTMLElement) {
  if (!isDark) return;
  // Skip aside — bg/border handled by Tailwind dark: variants
  if (el.tagName === "ASIDE" || el.closest("aside")) return;
  if (el.hasAttribute("data-no-dark") || el.closest("[data-no-dark]")) return;
  // Skip elements with green/red bg (copied button, disconnect, price badges)
  const inlineBg = el.style.background || el.style.backgroundColor;
  if (inlineBg) {
    const bg = inlineBg.toLowerCase();
    if (bg.includes("16a34a") || bg.includes("#16a34a") ||
        bg.includes("22, 163") || bg.includes("22c55e") ||
        bg.includes("239, 68") ||
        bg.includes("ef4444") || bg.includes("#ef4444") ||
        bg.includes("34, 197")) return;
  }

  const mapProp = (prop: string, map: Record<string, string>) => {
    const val = el.style[prop as any];
    if (!val) return;
    const computed = window.getComputedStyle(el)[prop as any];
    // Check inline val, computed value (rgb format)
    const mapped = map[val?.toLowerCase()] || map[computed?.toLowerCase()];
    if (mapped && !el.hasAttribute(`data-orig-${prop}`)) {
      el.setAttribute(`data-orig-${prop}`, el.style[prop as any] || "");
      el.style[prop as any] = mapped;
    }
  };

  BG_PROPS.forEach((p) => mapProp(p, BG_MAP));
  TEXT_PROPS.forEach((p) => mapProp(p, TEXT_MAP));
  BORDER_PROPS.forEach((p) => mapProp(p, BORDER_MAP));
}

function applyDark() {
  document.querySelectorAll<HTMLElement>("*").forEach(colorElement);
  document.body.style.background = "#0A0A0A";
  document.body.style.color = "#F5F5F5";
  // Sidebar handled by Tailwind dark: variants — no inline override needed

  // Inject hover + divider styles
  let styleEl = document.getElementById("growthip-dark-hover");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "growthip-dark-hover";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    html.dark [style*="height: 1px"] { background: #2a2a2a !important; }
    html.dark hr { border-color: #2a2a2a !important; }
    /* Dynamic state buttons */
    html.dark [data-copied="true"] { background: #16a34a !important; }
    html.dark [data-disconnect] { background: #2d1515 !important; border-color: #4a1a1a !important; }

    /* Sidebar: bg/border handled by Tailwind dark: variants on the element */
    html.dark aside a, html.dark aside button { color: #D4D4D4 !important; }

    /* Override Tailwind hover classes in dark mode */
    html.dark .hover\:bg-\[\#F5F5F5\]:hover,
    html.dark .hover\:bg-\[\#FAFAFA\]:hover { background: #252525 !important; }

    /* Settings preferences - base + hover */
    html.dark .hover\:bg-\[\#FAFAFA\] { background: #171717 !important; }
    html.dark .hover\:bg-\[\#FAFAFA\]:hover { background: #252525 !important; }

    /* Sidebar nav hover */
    html.dark .hover\:bg-\[\#F5F5F5\] { background: transparent !important; }
    html.dark .hover\:bg-\[\#F5F5F5\]:hover { background: #1E1E1E !important; }

    /* Sidebar text + icons */
    html.dark aside span { color: #C0C0C0 !important; }
    html.dark aside p { color: #C0C0C0 !important; }
    html.dark aside svg { color: #C0C0C0 !important; }
    html.dark aside .nav-item.active span { color: #FFFFFF !important; }
    html.dark aside .nav-item.active svg { color: #FFFFFF !important; }
    html.dark aside a { color: #C0C0C0 !important; }
    html.dark aside a.active, html.dark aside a[class*="active"] { color: #FFFFFF !important; }
    html.dark aside [class*="text-\[\#525252\]"] { color: #C0C0C0 !important; }
    html.dark aside [class*="text-\[\#0A0A0A\]"] { color: #F0F0F0 !important; }
    html.dark aside [class*="text-\[\#A3A3A3\]"] { color: #6A6A6A !important; }
    html.dark aside [class*="text-\[\#737373\]"] { color: #8A8A8A !important; }

    /* Settings preferences text */
    html.dark .hover\:bg-\[\#FAFAFA\] * { color: #D4D4D4 !important; }
    html.dark .hover\:bg-\[\#FAFAFA\] .font-bold { color: #F0F0F0 !important; }

    /* Global: kill ALL white hover effects in dark mode */
    html.dark *:hover { background-color: inherit; }
    html.dark button:hover:not([style*="background: #0A0A0A"]):not([style*="background: #22c55e"]):not([style*="background: #ef4444"]):not([style*="background: #F59E0B"]) {
      filter: brightness(1.3) !important;
    }
    html.dark a:hover { filter: brightness(1.2) !important; }

    /* Specific white hover overrides */
    html.dark .hover\:bg-\[\#F5F5F5\]:hover { background: #252525 !important; filter: none !important; }
    html.dark .hover\:bg-\[\#FAFAFA\]:hover { background: #252525 !important; filter: none !important; }
    html.dark [class*="hover:bg-light"]:hover { background: #252525 !important; filter: none !important; }

    /* Wallet modal + swap wallet buttons hover */
    html.dark [style*="background: #F9FAFB"]:hover,
    html.dark [style*="background: #F5F5F5"]:hover,
    html.dark [style*="background: #FAFAFA"]:hover { background: #252525 !important; }
  `;
}

function restoreLight() {
  // 1. Remove injected dark style FIRST so !important rules are gone
  document.getElementById("growthip-dark-hover")?.remove();

  // 2. Force remove ALL inline styles set by applyDark on every element
  document.querySelectorAll<HTMLElement>("*").forEach((el) => {
    // Remove data-orig attrs and restore/clear inline styles
    const hasOrigAttrs = Array.from(el.attributes).some(a => a.name.startsWith("data-orig-"));
    if (hasOrigAttrs) {
      STYLE_PROPS.forEach((prop) => {
        const orig = el.getAttribute(`data-orig-${prop}`);
        if (orig !== null) {
          if (orig === "") {
            el.style.removeProperty(prop.replace(/([A-Z])/g, "-$1").toLowerCase());
          } else {
            el.style[prop as any] = orig;
          }
          el.removeAttribute(`data-orig-${prop}`);
        }
      });
    } else {
      // Force remove inline styles even without data-orig (set by reapply)
      STYLE_PROPS.forEach((prop) => {
        const val = el.style[prop as any];
        if (!val) return;
        const cssKey = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
        el.style.removeProperty(cssKey);
      });
    }
  });

  // 3. Reset body and sidebar explicitly
  document.body.style.removeProperty("background");
  document.body.style.removeProperty("color");
  const aside = document.querySelector("aside");
  if (aside) {
    (aside as HTMLElement).style.removeProperty("background");
    (aside as HTMLElement).style.removeProperty("border-color");
  }
}

function startObserver() {
  if (observer) observer.disconnect();
  observer = new MutationObserver((mutations) => {
    if (!isDark) return;
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          colorElement(node as HTMLElement);
          (node as HTMLElement).querySelectorAll<HTMLElement>("*").forEach(colorElement);
        }
      });
      if (m.type === "attributes" && m.attributeName === "style") {
        const el = m.target as HTMLElement;
        // Clear stale data-orig so colorElement re-evaluates new style
        Array.from(el.attributes)
          .filter(a => a.name.startsWith("data-orig-"))
          .forEach(a => el.removeAttribute(a.name));
        colorElement(el);
      }
    });
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style"],
  });
}

function stopObserver() {
  observer?.disconnect();
  observer = null;
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("growthip:theme");
    if (saved === "dark") {
      isDark = true;
      setDark(true);
      document.documentElement.classList.add("dark");
      setTimeout(() => {
        applyDark();
        startObserver();
      }, 100);
    }

    // Re-apply dark on client-side navigation
    const handleReapply = () => {
      if (!isDark) return;
      // Reset all data-orig attrs so colorElement can re-map new elements
      document.querySelectorAll<HTMLElement>("[data-orig-background],[data-orig-backgroundColor],[data-orig-color]").forEach((el) => {
        Array.from(el.attributes)
          .filter(a => a.name.startsWith("data-orig-"))
          .forEach(a => el.removeAttribute(a.name));
      });
      applyDark();
      startObserver();
    };
    window.addEventListener("growthip:reapply-dark", handleReapply);
    return () => {
      stopObserver();
      window.removeEventListener("growthip:reapply-dark", handleReapply);
    };
  }, []);

  function toggle() {
    const next = !dark;
    isDark = next;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("growthip:theme", "dark");
      setTimeout(() => {
        applyDark();
        startObserver();
      }, 50);
    } else {
      stopObserver();
      restoreLight();
      document.documentElement.classList.remove("dark");
      localStorage.setItem("growthip:theme", "light");
    }
  }

  return (
    <button
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: 40, height: 40, borderRadius: "10px",
        border: "1px solid #E5E5E5",
        background: dark ? "#1A1A1A" : "#F5F5F5",
        cursor: "pointer", display: "flex",
        alignItems: "center", justifyContent: "center",
        transition: "all 0.3s ease",
      }}
    >
      {dark ? (
        <Icon icon="ph:moon-stars-bold" className="theme-toggle-moon"
          style={{ fontSize: "18px", color: "#818CF8" }} />
      ) : (
        <Icon icon="ph:sun-bold" className="theme-toggle-sun"
          style={{ fontSize: "18px", color: "#F59E0B" }} />
      )}
    </button>
  );
}
