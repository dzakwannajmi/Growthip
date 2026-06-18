import type { ReactNode } from "react";
import DashboardSidebar from "@/components/DashboardSidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <DashboardSidebar />
      <main className="flex-1 overflow-y-auto px-0 py-0">
        <div className="min-h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
