import type { ReactNode } from "react";
import DashboardSidebar from "@/components/DashboardSidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden", background: "#FAFAFA" }}>
      <DashboardSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <main
          className="custom-scroll"
          style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: "#FAFAFA" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
