import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@iconify/react";

export const metadata: Metadata = {
  title: "Terms of Service — Growthip",
  description: "Terms for using the Growthip testnet prototype.",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#171717]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="mx-auto max-w-3xl px-6 py-20">
        <Link href="/" className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#737373] hover:text-[#0A0A0A] transition-colors mb-10">
          <Icon icon="ph:arrow-left-bold" className="w-4 h-4" /> Back to home
        </Link>

        <h1 className="text-3xl md:text-4xl font-black text-[#0A0A0A] tracking-tight mb-3">Terms of Service</h1>
        <p className="text-[14px] text-[#A3A3A3] mb-12">Last updated: July 2026</p>

        <div className="prose-custom flex flex-col gap-8 text-[15px] leading-relaxed text-[#404040]">

          <section>
            <h2 className="text-lg font-bold text-[#0A0A0A] mb-2">Experimental testnet software</h2>
            <p>
              Growthip is a hackathon prototype running on Stellar Testnet. It is provided{" "}
              <strong>as-is, without warranty of any kind</strong>. The smart contracts have not undergone a
              formal security audit. Do not use real funds, Mainnet assets, or rely on Growthip for anything
              beyond experimentation.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#0A0A0A] mb-2">You are responsible for your wallet</h2>
            <p>
              Growthip never holds custody of your funds or private keys. You are solely responsible for
              securing your Stellar wallet (Freighter or xBull) and any private notes generated when you
              send or claim a tip. Lost private notes cannot be recovered by Growthip — we have no access
              to them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#0A0A0A] mb-2">No guarantee of availability</h2>
            <p>
              As an actively developed prototype, Growthip&apos;s frontend, contracts, or testnet
              infrastructure may change, break, or become unavailable without notice. There is no uptime
              guarantee or committed support response time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#0A0A0A] mb-2">Open source</h2>
            <p>
              Growthip&apos;s code is open source under the Apache 2.0 license. You&apos;re welcome to read,
              audit, fork, or contribute to it on{" "}
              <a
                href="https://github.com/dzakwannajmi/Growthip"
                target="_blank"
                rel="noreferrer"
                className="text-[#6b45f3] font-semibold hover:underline"
              >
                GitHub
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#0A0A0A] mb-2">Platform fee</h2>
            <p>
              Growthip charges a transparent 1% platform fee on deposits, verifiable on-chain via the pool
              contract&apos;s <code className="text-[13px] bg-[#F5F5F5] px-1.5 py-0.5 rounded">accumulated_fees()</code> function.
              This is disclosed in full on the{" "}
              <Link href="/#fees" className="text-[#6b45f3] font-semibold hover:underline">Fees section</Link>{" "}
              of the landing page.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#0A0A0A] mb-2">Questions</h2>
            <p>
              Questions about these terms can be raised as an issue on{" "}
              <a
                href="https://github.com/dzakwannajmi/Growthip/issues"
                target="_blank"
                rel="noreferrer"
                className="text-[#6b45f3] font-semibold hover:underline"
              >
                GitHub
              </a>.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}