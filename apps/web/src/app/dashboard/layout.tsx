import type { ReactNode } from "react";
import DashboardSidebar from "@/components/DashboardSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import ThemeApplier from "@/components/ThemeApplier";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark:bg-[#0A0A0A]" style={{ display: "flex", height: "100dvh", overflow: "hidden", background: "#FAFAFA" }}>
      <DashboardSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <main
          className="custom-scroll dark:bg-[#0A0A0A]"
          style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: "#FAFAFA" }}
        >
          {children}
        </main>
        {/* Hidden ThemeToggle ensures applyDark() runs on all dashboard pages */}
        <div style={{ display: "none" }}><ThemeToggle /></div>
        <ThemeApplier />
      </div>
    </div>
  );
}
