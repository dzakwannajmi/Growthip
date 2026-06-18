"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Icon } from "@iconify/react";

function StatsLoading() {
  return (
    <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(4, 1fr)" }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ height: "96px", borderRadius: "16px", background: "#F5F5F5", animation: "pulse 2s infinite" }} />
      ))}
    </div>
  );
}

function NotesLoading() {
  return <div style={{ height: "160px", borderRadius: "16px", background: "#F5F5F5" }} />;
}

const DashboardStats = dynamic(() => import("@/components/DashboardStats"), {
  ssr: false,
  loading: StatsLoading,
});

const PendingNotes = dynamic(() => import("@/components/PendingNotes"), {
  ssr: false,
  loading: NotesLoading,
});

export default function AnalyticsPage() {
  return (
    <div className="p-4 md:p-8 lg:p-10 w-full" style={{ background: "#FAFAFA" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto", paddingBottom: "80px", display: "flex", flexDirection: "column", gap: "24px" }}>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0A0A0A" }}>Analytics</h1>
            <p style={{ fontSize: "14px", color: "#737373", marginTop: "4px" }}>Pool statistics and your private notes</p>
          </div>
          <Link
            href="/dashboard/deposit"
            style={{
              padding: "10px 20px",
              borderRadius: "999px",
              background: "#0A0A0A",
              color: "white",
              fontSize: "14px",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Send a tip
          </Link>
        </div>

        <div>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>
            Pool Statistics
          </p>
          <DashboardStats />
        </div>

        <div>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>
            Your Private Notes
          </p>
          <PendingNotes />
        </div>

        <div style={{ borderRadius: "16px", border: "1px solid #FCA5A5", background: "#FEF2F2", padding: "20px" }}>
          <p style={{ fontSize: "14px", fontWeight: 700, color: "#EF4444" }}>Privacy Notice</p>
          <p style={{ fontSize: "14px", color: "#737373", marginTop: "8px", lineHeight: "1.6" }}>
            Pool statistics are anonymized. Your private notes are stored locally in your browser only.
          </p>
        </div>

      </div>
    </div>
  );
}
