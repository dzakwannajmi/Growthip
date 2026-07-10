"use client";

/**
 * DarkModeInit.tsx
 *
 * Lightweight dark-mode bootstrapper for route groups that don't render
 * the full ThemeToggle (which owns the heavier colorElement() runtime
 * DOM-remapping system, scoped only to [data-dashboard-shell] pages
 * still using inline styles). Landing page, /terms, and /privacy are
 * already pure Tailwind `dark:` className -- they only need the `dark`
 * class present on <html>, driven by the SAME localStorage key
 * ThemeToggle uses ("growthip:theme"), nothing more.
 *
 * Renders nothing; runs once on mount.
 */

import { useEffect } from "react";

export default function DarkModeInit() {
  useEffect(() => {
    const saved = localStorage.getItem("growthip:theme");
    if (saved === "dark") {
      document.documentElement.classList.add("dark");
    }
  }, []);

  return null;
}
