"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Re-applies dark mode styles on every client-side navigation.
// Needed because applyDark() in ThemeToggle only runs once on mount.
export default function ThemeApplier() {
  const pathname = usePathname();

  useEffect(() => {
    const theme = localStorage.getItem("growthip:theme");
    if (theme !== "dark") return;

    // Small delay to let the new page render first
    const timer = setTimeout(() => {
      const event = new CustomEvent("growthip:reapply-dark");
      window.dispatchEvent(event);
    }, 150);

    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
