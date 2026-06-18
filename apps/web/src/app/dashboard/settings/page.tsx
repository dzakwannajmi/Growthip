"use client";

import { Icon } from "@iconify/react";

export default function SettingsPage() {
  return (
    <div className="p-4 md:p-8 lg:p-10 w-full min-h-full" style={{ background: "#FAFAFA" }}>
      <div className="max-w-[700px] mx-auto pb-20 flex flex-col gap-6">
        <div className="mb-2">
          <h1 className="text-2xl font-extrabold" style={{ color: "#0A0A0A" }}>Settings</h1>
          <p className="text-sm" style={{ color: "#525252" }}>Manage your account preferences</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl" style={{ background: "#E5E5E5", color: "#0A0A0A", border: "1px solid #D4D4D4" }}>C</div>
          <div>
            <div className="font-bold text-lg" style={{ color: "#0A0A0A" }}>@creator</div>
            <div className="text-xs flex items-center gap-1" style={{ color: "#737373" }}>
              <Icon icon="ph:link" />
              growthip.vercel.app/tip/creator
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#737373" }}>Preferences</p>
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #E5E5E5", background: "white" }}>
            <button className="w-full p-4 flex items-center justify-between transition-colors hover:bg-[#FAFAFA]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F5F5F5" }}>
                  <Icon icon="ph:user-circle-bold" className="text-xl" style={{ color: "#0A0A0A" }} />
                </div>
                <div className="text-left">
                  <div className="font-bold text-sm" style={{ color: "#0A0A0A" }}>Avatar Customization</div>
                  <div className="text-xs" style={{ color: "#737373" }}>Change your profile appearance</div>
                </div>
              </div>
              <Icon icon="ph:caret-right-bold" style={{ color: "#A3A3A3" }} />
            </button>
            <div style={{ height: "1px", background: "#E5E5E5" }} />
            <button className="w-full p-4 flex items-center justify-between transition-colors hover:bg-[#FAFAFA]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F5F5F5" }}>
                  <Icon icon="ph:bell-bold" className="text-xl" style={{ color: "#0A0A0A" }} />
                </div>
                <div className="text-left">
                  <div className="font-bold text-sm" style={{ color: "#0A0A0A" }}>Notifications</div>
                  <div className="text-xs" style={{ color: "#737373" }}>Manage your notification preferences</div>
                </div>
              </div>
              <Icon icon="ph:caret-right-bold" style={{ color: "#A3A3A3" }} />
            </button>
            <div style={{ height: "1px", background: "#E5E5E5" }} />
            <button className="w-full p-4 flex items-center justify-between transition-colors hover:bg-[#FAFAFA]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F5F5F5" }}>
                  <Icon icon="ph:shield-check-bold" className="text-xl" style={{ color: "#0A0A0A" }} />
                </div>
                <div className="text-left">
                  <div className="font-bold text-sm" style={{ color: "#0A0A0A" }}>Security</div>
                  <div className="text-xs" style={{ color: "#737373" }}>Manage your account security</div>
                </div>
              </div>
              <Icon icon="ph:caret-right-bold" style={{ color: "#A3A3A3" }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
