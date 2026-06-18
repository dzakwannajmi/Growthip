import type { ReactNode } from "react";
import DashboardSidebar from "@/components/DashboardSidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 flex overflow-hidden">
      <DashboardSidebar />
      <main className="flex-1 overflow-y-auto bg-gradient-to-br from-midnight-blue via-dark-indigo to-black-forest">
        {children}
      </main>
    </div>
  );
}
