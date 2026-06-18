"use client";

import dynamic from "next/dynamic";

const PendingNotes = dynamic(() => import("@/components/PendingNotes"), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-3xl bg-white/[0.04]" />,
});

export default function NotesPage() {
  return (
    <div className="px-8 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-white">My Notes</h1>
        <p className="mt-1 text-sm text-soft-gray/60">
          Your private notes stored locally in this browser.
        </p>
      </div>
      <PendingNotes />
    </div>
  );
}
