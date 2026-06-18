"use client";

export default function SettingsPage() {
  return (
    <div className="flex-1 overflow-y-auto custom-scroll p-4 md:p-8 lg:p-10 w-full bg-light-50 dark:bg-dark-base">
      <div className="max-w-[700px] mx-auto pb-20 flex flex-col gap-6">
        <div className="mb-2">
          <h1 className="text-2xl font-extrabold text-light-950 dark:text-dark-950">Settings</h1>
          <p className="text-sm text-light-600 dark:text-dark-500">Manage your account preferences</p>
        </div>
        <div className="flex items-center gap-4 mb-2">
          <div className="w-14 h-14 rounded-full bg-light-200 dark:bg-dark-100 flex items-center justify-center font-bold text-light-950 dark:text-dark-950 text-xl border border-light-300 dark:border-dark-200">C</div>
          <div>
            <div className="font-bold text-lg text-light-950 dark:text-dark-950">@creator</div>
            <div className="text-[11px] text-light-500 dark:text-dark-500">growthip.vercel.app/tip/creator</div>
          </div>
        </div>
        <div className="w-full bg-light-base dark:bg-dark-50 rounded-2xl border border-light-200 dark:border-dark-100 p-6">
          <p className="text-xs font-bold text-light-500 dark:text-dark-500 uppercase tracking-widest mb-3">Preferences</p>
          <div className="space-y-2">
            <button className="w-full bg-light-50 dark:bg-dark-100 hover:bg-light-100 dark:hover:bg-dark-200 rounded-xl border border-light-200 dark:border-dark-100 p-4 flex items-center justify-between transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-light-100 dark:bg-dark-200 flex items-center justify-center text-light-950 dark:text-dark-950 text-sm">👤</div>
                <div className="text-left">
                  <div className="font-bold text-sm text-light-950 dark:text-dark-900">Avatar Customization</div>
                  <div className="text-[11px] text-light-500 dark:text-dark-500">Change your profile appearance</div>
                </div>
              </div>
              <span className="text-light-400 dark:text-dark-400">›</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
