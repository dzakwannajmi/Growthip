"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";

type Filter = "all" | "received" | "withdrawn";

export default function ActivityPage() {
  const [filter, setFilter] = useState<Filter>("all");

  return (
    <div className="p-4 md:p-8 lg:p-10 w-full" style={{ background: "#FAFAFA" }}>
      <div className="max-w-[700px] mx-auto pb-20 flex flex-col gap-6">

        <div className="mb-2">
          <h1 className="text-2xl font-extrabold text-[#0A0A0A]">Activity</h1>
          <p className="text-sm text-[#525252]">View all your tip transactions</p>
        </div>

        {/* Filter bar */}
        <div className="w-full bg-white rounded-2xl border border-[#E5E5E5] p-4 flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#525252] border-r border-[#E5E5E5] pr-4">
            <Icon icon="ph:funnel-bold" className="text-lg" />
            FILTER
          </div>
          <div className="flex gap-2">
            {(["all", "received", "withdrawn"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={
                  "px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors " +
                  (filter === f
                    ? "bg-[#0A0A0A] text-white font-bold"
                    : "text-[#525252] hover:bg-[#F5F5F5]")
                }
              >
                {f === "all" ? "All Tips" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Empty state */}
        <div className="w-full bg-white rounded-2xl border border-[#E5E5E5] p-16 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-[#F5F5F5] flex items-center justify-center mb-4">
            <Icon icon="ph:gift-bold" className="text-3xl text-[#A3A3A3]" />
          </div>
          <div className="font-bold text-[#0A0A0A] mb-1">No tips yet</div>
          <div className="text-[13px] text-[#737373]">Share your link to start receiving tips!</div>
        </div>

      </div>
    </div>
  );
}
