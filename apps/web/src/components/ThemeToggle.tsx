"use client";
import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";

const DARK_STYLES = `
  /* Main layout */
  html, body, main, #__next, [data-nextjs-scroll-focus-boundary] { background: #0A0A0A !important; }
  div[style] { color: inherit; }
  body { background: #0A0A0A !important; color: #F5F5F5 !important; }
  aside { background: #111111 !important; border-color: #262626 !important; }
  nav { background: #111111 !important; border-color: #262626 !important; }
  
  /* Cards & surfaces */
  .rounded-2xl, .rounded-xl, .rounded-lg { background: #171717 !important; border-color: #262626 !important; }
  
  /* Override all white/light backgrounds */
  [style*="background: white"], [style*="background:white"],
  [style*='background: "white"'] { background: #1A1A1A !important; }
  [style*="background: #FAFAFA"] { background: #111111 !important; }
  [style*="background: #F9FAFB"] { background: #141414 !important; }
  [style*="background: #F5F5F5"] { background: #1E1E1E !important; }
  [style*="background: #F0FDF4"] { background: #0D2B1A !important; }
  [style*="background: #EFF6FF"] { background: #0D1F2B !important; }
  [style*="background: #FEF2F2"] { background: #2B0D0D !important; }
  [style*="background: #FFFBEB"] { background: #2B220D !important; }
  
  /* Text colors */
  [style*="color: #0A0A0A"], [style*="color: #171717"],
  [style*="color: #262626"] { color: #F5F5F5 !important; }
  [style*="color: #525252"] { color: #A3A3A3 !important; }
  [style*="color: #737373"] { color: #8A8A8A !important; }
  
  /* Text visibility */
  p, h1, h2, h3, h4, h5, h6, span, label, div {
    color: inherit;
  }
  [style*="color: #0A0A0A"],
  [style*="color: #171717"],
  [style*="color: #262626"],
  [style*="color: #404040"] { color: #F5F5F5 !important; }
  [style*="color: #525252"] { color: #B0B0B0 !important; }
  [style*="color: #737373"] { color: #8A8A8A !important; }
  [style*="color: #A3A3A3"] { color: #6A6A6A !important; }
  
  /* Borders */
  [style*="border: 1px solid #E5E5E5"],
  [style*="border-bottom: 1px solid #E5E5E5"],
  [style*="borderBottom: 1px solid #E5E5E5"] { border-color: #2A2A2A !important; }
  [style*="border: 1px solid #D4D4D4"] { border-color: #2A2A2A !important; }
  
  /* Inputs */
  input, textarea, select { 
    background: #1A1A1A !important; 
    color: #F5F5F5 !important; 
    border-color: #2A2A2A !important; 
  }
  
  /* Nav items */
  .nav-item.active { background: #262626 !important; color: #FAFAFA !important; }
  .nav-item:hover { background: #1A1A1A !important; }
  
  /* Modals */
  [style*="background: rgba(0,0,0"] { background: rgba(0,0,0,0.7) !important; }
`;

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("growthip:theme");
    if (saved === "dark") {
      setDark(true);
      applyDark(true);
    }
  }, []);

  function applyDark(on: boolean) {
    let el = document.getElementById("growthip-dark-mode");
    if (on) {
      if (!el) {
        el = document.createElement("style");
        el.id = "growthip-dark-mode";
        document.head.appendChild(el);
      }
      el.textContent = DARK_STYLES;
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      el?.remove();
      document.documentElement.removeAttribute("data-theme");
    }
  }

  function toggle() {
    const next = !dark;
    setDark(next);
    applyDark(next);
    localStorage.setItem("growthip:theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: 40, height: 40, borderRadius: "10px",
        border: `1px solid ${dark ? "#2A2A2A" : "#E5E5E5"}`,
        background: dark ? "#1A1A1A" : "#F5F5F5",
        cursor: "pointer", display: "flex",
        alignItems: "center", justifyContent: "center",
        transition: "all 0.3s ease",
      }}
    >
      {dark ? (
        <Icon
          icon="ph:moon-stars-bold"
          className="theme-toggle-moon"
          style={{ fontSize: "18px", color: "#818CF8" }}
        />
      ) : (
        <Icon
          icon="ph:sun-bold"
          className="theme-toggle-sun"
          style={{ fontSize: "18px", color: "#F59E0B" }}
        />
      )}
    </button>
  );
}
