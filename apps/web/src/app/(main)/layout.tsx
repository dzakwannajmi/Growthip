import type { ReactNode } from "react";
import DarkModeInit from "@/components/DarkModeInit";

// (main) route group layout — intentionally minimal.
// The landing page (page.tsx) owns its own <nav> and full-page layout.
//
// DarkModeInit is mounted here because this route group never renders
// ThemeToggle (that only lives in dashboard/layout.tsx) -- without it,
// pages here never read the saved theme preference, so a hard reload
// of e.g. /terms or /privacy always starts light regardless of what
// the user last toggled.
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DarkModeInit />
      {children}
    </>
  );
}
