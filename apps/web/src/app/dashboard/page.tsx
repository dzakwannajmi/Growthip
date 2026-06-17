"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

function StatsLoading() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div className="h-24 animate-pulse rounded-3xl bg-white/[0.04]" />
      <div className="h-24 animate-pulse rounded-3xl bg-white/[0.04]" />
      <div className="h-24 animate-pulse rounded-3xl bg-white/[0.04]" />
      <div className="h-24 animate-pulse rounded-3xl bg-white/[0.04]" />
    </div>
  );
}

function NotesLoading() {
  return <div className="h-40 animate-pulse rounded-3xl bg-white/[0.04]" />;
}

const DashboardStats = dynamic(() => import("@/components/DashboardStats"), {
  ssr: false,
  loading: StatsLoading,
});

const PendingNotes = dynamic(() => import("@/components/PendingNotes"), {
  ssr: false,
  loading: NotesLoading,
});

export default function DashboardPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link
              href="/"
              className="mb-2 flex items-center gap-2 text-sm text-soft-gray/50 hover:text-white"
            >
              Back
            </Link>
            <h1 className="text-3xl font-black tracking-tight text-white">
              Creator Dashboard
            </h1>
            <p className="mt-1 text-sm text-soft-gray/60">
              Anonymous pool statistics and your pending tips
            </p>
          </div>
          <Link
            href="/deposit"
            className="rounded-full bg-fresh-green px-5 py-2.5 text-sm font-black text-midnight-blue transition hover:scale-[1.02]"
          >
            Send a tip
          </Link>
        </div>

        <section className="mb-8">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-soft-gray/45">
            Pool Statistics
          </p>
          <DashboardStats />
        </section>

        <section className="mb-8">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-soft-gray/45">
            Your Private Notes
          </p>
          <PendingNotes />
        </section>

        <div className="rounded-3xl border border-coral-red/20 bg-coral-red/10 p-5">
          <p className="text-sm font-bold text-coral-red">Privacy Notice</p>
          <p className="mt-2 text-sm leading-7 text-soft-gray/75">
            Pool statistics are anonymized. Your private notes are stored
            locally in your browser only. Clearing browser data will delete
            them permanently.
          </p>
        </div>
      </div>
    </main>
  );
}