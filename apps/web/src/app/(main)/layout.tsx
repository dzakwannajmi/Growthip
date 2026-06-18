import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pt-6">
      <Navbar />
      {children}
    </div>
  );
}
