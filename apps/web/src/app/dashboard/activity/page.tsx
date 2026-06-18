"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";

type Filter = "all" | "received" | "withdrawn";

export default function ActivityPage() {
  const [filter, setFilter] = useState<Filter>("all");

  return (
    <div className="p-4 md:p-8 lg:p-10 w-full min-h-full" style={{ background: "#FAFAFA" }}>
      <div className="max-w-[700px] mx-auto pb-20 flex flex-col gap-6">
        <div className="mb-2">
          <h1 className="text-2xl font-extrabold" style={{ color: "#0A0A0A" }}>Activity</h1>
          <p className="text-sm" style={{ color: "#525252" }}>View all your tip transactions</p>
        </div>
        <div className="w-full rounded-2xl p-4 flex items-center gap-4" style={{ background: "white", border: "1px solid #E5E5E5" }}>
          <div className="flex items-center gap-2 text-sm font-semibold pr-4" style={{ color: "#525252", borderRight: "1px solid #E5E5E5" }}>
            <Icon icon="ph:funnel-bold" className="text-lg" />
            FILTER
          </div>
          <div className="flex gap-2">
            {(["all", "received", "withdrawn"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                style={filter === f
                  ? { background: "#0A0A0A", color: "white", fontWeight: 700 }
                  : { color: "#525252" }
                }
              >
                {f === "all" ? "All Tips" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="w-full rounded-2xl p-16 flex flex-col items-center justify-center text-center" style={{ background: "white", border: "1px solid #E5E5E5" }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "#F5F5F5" }}>
            <Icon icon="ph:gift-bold" className="text-3xl" style={{ color: "#A3A3A3" }} />
          </div>
          <div className="font-bold mb-1" style={{ color: "#0A0A0A" }}>No tips yet</div>
          <div className="text-sm" style={{ color: "#737373" }}>Share your link to start receiving tips!</div>
        </div>
      </div>
    </div>
  );
}
