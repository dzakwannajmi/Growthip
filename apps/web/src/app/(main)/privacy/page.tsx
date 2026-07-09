import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@iconify/react";

export const metadata: Metadata = {
  title: "Privacy Policy — Growthip",
  description: "How Growthip handles data — wallet-based, no accounts, encrypted private notes.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#171717]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="mx-auto max-w-3xl px-6 py-20">
        <Link href="/" className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#737373] hover:text-[#0A0A0A] transition-colors mb-10">
          <Icon icon="ph:arrow-left-bold" className="w-4 h-4" /> Back to home
        </Link>

        <h1 className="text-3xl md:text-4xl font-black text-[#0A0A0A] tracking-tight mb-3">Privacy Policy</h1>
        <p className="text-[14px] text-[#A3A3A3] mb-12">Last updated: July 2026</p>

        <div className="prose-custom flex flex-col gap-8 text-[15px] leading-relaxed text-[#404040]">

          <section>
            <h2 className="text-lg font-bold text-[#0A0A0A] mb-2">No accounts, no sign-up</h2>
            <p>
              Growthip does not ask you to create an account, provide an email address, or submit any personal
              information. You interact with the protocol by connecting a Stellar wallet (Freighter or xBull).
              We never see or store your private keys.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#0A0A0A] mb-2">What&apos;s public on-chain</h2>
            <p>
              Stellar is a public blockchain. Deposits, claims, and transaction amounts are permanently visible
              to anyone who looks — this is inherent to how blockchains work, and Growthip cannot change or
              hide that. What Growthip&apos;s zero-knowledge design specifically protects is the{" "}
              <strong>link between a deposit and a claim</strong> — not the amounts or addresses themselves.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#0A0A0A] mb-2">Private notes are encrypted client-side</h2>
            <p>
              When you send a tip, a private note is encrypted in your browser (X25519 ECDH + AES-GCM) before
              it ever leaves your device. Growthip has no server that stores or has access to the contents of
              that note — only the intended recipient&apos;s browser can decrypt it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#0A0A0A] mb-2">Local storage</h2>
            <p>
              Some non-sensitive convenience data — like your display name, avatar choice, or a list of
              campaigns you&apos;ve created — is stored in your browser&apos;s local storage, scoped to your
              wallet address. This data never leaves your device and is not visible to Growthip.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#0A0A0A] mb-2">Testnet prototype</h2>
            <p>
              Growthip is currently an experimental prototype running on Stellar Testnet. It has not undergone
              a formal security audit. Please do not use real funds or Mainnet assets.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#0A0A0A] mb-2">Questions</h2>
            <p>
              If you have questions about how Growthip handles data, open an issue on{" "}
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