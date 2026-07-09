import type { ReactNode } from "react";

// (main) route group layout — intentionally minimal.
// The landing page (page.tsx) owns its own <nav> and full-page layout.
export default function MainLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
