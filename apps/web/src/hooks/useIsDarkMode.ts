"use client";

import { useEffect, useState } from "react";

/**
 * Tracks whether dark mode is active by watching the `class` attribute on
 * <html> via MutationObserver — deliberately does NOT touch or depend on
 * ThemeToggle.tsx's own toggle logic at all, just observes its result
 * (`document.documentElement.classList.add/remove("dark")`).
 *
 * Needed by components whose colors are generated in JavaScript (hex
 * props, canvas/SVG generation, style objects) rather than plain Tailwind
 * `dark:` classes, since those can't react to CSS alone: WorldMap
 * (dotted-map SVG generation), CardNav (hex color props), HowItWorksFlow
 * (React Flow node/edge style objects).
 */
export function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    setIsDark(root.classList.contains("dark"));

    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains("dark"));
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  return isDark;
}