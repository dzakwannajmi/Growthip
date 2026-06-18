"use client";

export default function ActivityPage() {
  return (
    <div className="flex-1 overflow-y-auto custom-scroll p-4 md:p-8 lg:p-10 w-full bg-light-50 dark:bg-dark-base">
      <div className="max-w-[700px] mx-auto pb-20 flex flex-col gap-6">
        <div className="mb-2">
          <h1 className="text-2xl font-extrabold text-light-950 dark:text-dark-950">Activity</h1>
          <p className="text-sm text-light-600 dark:text-dark-500">View all your tip transactions</p>
        </div>
        <div className="w-full bg-light-base dark:bg-dark-50 rounded-2xl border border-light-200 dark:border-dark-100 p-4 flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-light-600 dark:text-dark-400 border-r border-light-200 dark:border-dark-200 pr-4">
            FILTER
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-1.5 rounded-lg text-sm font-bold bg-light-950 dark:bg-dark-950 text-light-base dark:text-dark-base">All Tips</button>
            <button className="text-light-600 dark:text-dark-400 hover:bg-light-100 dark:hover:bg-dark-100 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors">Received</button>
            <button className="text-light-600 dark:text-dark-400 hover:bg-light-100 dark:hover:bg-dark-100 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors">Withdrawn</button>
          </div>
        </div>
        <div className="w-full bg-light-base dark:bg-dark-50 rounded-2xl border border-light-200 dark:border-dark-100 p-16 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-light-100 dark:bg-dark-100 flex items-center justify-center mb-4 text-3xl">🎁</div>
          <div className="font-bold text-light-950 dark:text-dark-900 mb-1">No tips yet</div>
          <div className="text-[13px] text-light-500 dark:text-dark-500">Share your link to start receiving tips!</div>
        </div>
      </div>
    </div>
  );
}
