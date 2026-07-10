import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@iconify/react";
import TocSidebar from "@/components/TocSidebar";
import { slugify } from "@/lib/slugify";

export const metadata: Metadata = {
  title: "Terms of Service — Growthip",
  description: "Terms for using the Growthip testnet prototype.",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#0A0A0A] text-[#171717] dark:text-[#E5E5E5]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="mx-auto max-w-5xl px-6 py-20 flex gap-16">
        <aside className="hidden lg:block w-52 shrink-0">
          <div className="sticky top-20">
            <TocSidebar items={TERMS_SECTIONS} />
          </div>
        </aside>

        <div className="max-w-3xl min-w-0">
        <Link href="/" className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#737373] dark:text-[#8A8A8A] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors mb-10">
          <Icon icon="ph:arrow-left-bold" className="w-4 h-4" /> Back to home
        </Link>

        <h1 className="text-3xl md:text-4xl font-black text-[#0A0A0A] dark:text-[#F5F5F5] tracking-tight mb-3">Terms of Service</h1>
        <p className="text-[14px] text-[#A3A3A3] dark:text-[#6A6A6A] mb-12">Last updated: July 2026</p>

        <div className="prose-custom flex flex-col gap-8 text-[15px] leading-relaxed text-[#404040] dark:text-[#B0B0B0]">

          <section id={slugify(TERMS_SECTIONS[0])}>
            <h2 className="text-lg font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">Experimental testnet software</h2>
            <p>
              Growthip is a hackathon prototype running on Stellar Testnet. It is provided{" "}
              <strong>as-is, without warranty of any kind</strong>. The smart contracts have not undergone a
              formal security audit. Do not use real funds, Mainnet assets, or rely on Growthip for anything
              beyond experimentation.
            </p>
          </section>

          <section id={slugify(TERMS_SECTIONS[1])}>
            <h2 className="text-lg font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">You are responsible for your wallet</h2>
            <p>
              Growthip never holds custody of your funds or private keys. You are solely responsible for
              securing your Stellar wallet (Freighter or xBull) and any private notes generated when you
              send or claim a tip. Lost private notes cannot be recovered by Growthip — we have no access
              to them.
            </p>
          </section>

          <section id={slugify(TERMS_SECTIONS[2])}>
            <h2 className="text-lg font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">How private note encryption actually works — and what &quot;lost&quot; means</h2>
            <p>
              If you activate Private Notes (the optional 6 XLM premium feature), incoming tip data is
              encrypted client-side and can only be decrypted by an encryption key that lives in two parts:
            </p>
            <ol className="list-decimal pl-5 mt-2 space-y-1.5">
              <li>
                An <strong>encryption identity</strong> stored in this browser&apos;s local storage, protected
                by AES-GCM wrapping. This identity is what your password or recovery phrase unlocks.
              </li>
              <li>
                Your <strong>password or 12-word recovery phrase</strong>, which unwraps that identity. Either
                one works on its own — but only if the identity from step 1 is still present somewhere
                accessible to you.
              </li>
            </ol>
            <p className="mt-2">
              These two parts protect different failure modes, and <strong>you need both, together, to
              recover access on a new device or browser</strong>. Concretely:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>
                If you stay on the same browser and device, forgetting your password is recoverable via your
                recovery phrase — the identity is still sitting in local storage.
              </li>
              <li>
                If you switch devices, reinstall your browser, or clear browsing data <strong>without having
                downloaded a backup file first</strong>, your recovery phrase alone cannot rebuild the
                identity it&apos;s meant to unlock. This is not a bug or an oversight — the recovery phrase is
                a key to a specific lock, not a seed that regenerates the lock from nothing.
              </li>
              <li>
                Tips you have already viewed once in your Activity page are safe regardless — their contents
                are already decrypted and stored locally. This risk applies only to tips that arrive{" "}
                <em>after</em> you lose access to your encryption identity.
              </li>
            </ul>
            <p className="mt-2">
              Growthip has no server and no account-recovery process of any kind. If both the identity and
              your ability to unlock it are gone, any future encrypted tips are permanently unreadable —
              the funds remain locked in the pool contract indefinitely, retrievable by no one, including
              Growthip. Download your backup file (Settings → Security &amp; Private Notes → Export Backup)
              as soon as you activate this feature, and store it somewhere separate from the device you
              generated it on.
            </p>
          </section>

          <section id={slugify(TERMS_SECTIONS[3])}>
            <h2 className="text-lg font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">No guarantee of availability</h2>
            <p>
              As an actively developed prototype, Growthip&apos;s frontend, contracts, or testnet
              infrastructure may change, break, or become unavailable without notice. There is no uptime
              guarantee or committed support response time.
            </p>
          </section>

          <section id={slugify(TERMS_SECTIONS[4])}>
            <h2 className="text-lg font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">Open source</h2>
            <p>
              Growthip&apos;s code is open source under the Apache 2.0 license. You&apos;re welcome to read,
              audit, fork, or contribute to it on{" "}
              <a
                href="https://github.com/dzakwannajmi/Growthip"
                target="_blank"
                rel="noreferrer"
                className="text-[#00B2FF] dark:text-[#00B2FF] font-semibold hover:underline"
              >
                GitHub
              </a>.
            </p>
          </section>

          <section id={slugify(TERMS_SECTIONS[5])}>
            <h2 className="text-lg font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">Platform fee</h2>
            <p>
              Growthip charges a transparent 1% platform fee on deposits, verifiable on-chain via the pool
              contract&apos;s <code className="text-[13px] bg-[#F5F5F5] dark:bg-[#2A2A2A] px-1.5 py-0.5 rounded">accumulated_fees()</code> function.
              This is disclosed in full on the{" "}
              <Link href="/#fees" className="text-[#00B2FF] dark:text-[#00B2FF] font-semibold hover:underline">Fees section</Link>{" "}
              of the landing page.
            </p>
          </section>

          <section id={slugify(TERMS_SECTIONS[6])}>
            <h2 className="text-lg font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">Questions</h2>
            <p>
              Questions about these terms can be raised as an issue on{" "}
              <a
                href="https://github.com/dzakwannajmi/Growthip/issues"
                target="_blank"
                rel="noreferrer"
                className="text-[#00B2FF] dark:text-[#00B2FF] font-semibold hover:underline"
              >
                GitHub
              </a>.
            </p>
          </section>

        </div>
        </div>
      </div>
    </div>
  );
}

const TERMS_SECTIONS = [
  "Experimental testnet software",
  "You are responsible for your wallet",
  'How private note encryption actually works — and what "lost" means',
  "No guarantee of availability",
  "Open source",
  "Platform fee",
  "Questions",
];