import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@iconify/react";
import TocSidebar from "@/components/TocSidebar";
import { slugify } from "@/lib/slugify";

export const metadata: Metadata = {
  title: "Privacy Policy — Growthip",
  description: "How Growthip handles data — wallet-based, no accounts, encrypted private notes.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#0A0A0A] text-[#171717] dark:text-[#E5E5E5]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="mx-auto max-w-5xl px-6 py-20 flex gap-16">
        <aside className="hidden lg:block w-52 shrink-0">
          <div className="sticky top-20">
            <TocSidebar items={PRIVACY_SECTIONS} />
          </div>
        </aside>

        <div className="max-w-3xl min-w-0">
        <Link href="/" className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#737373] dark:text-[#8A8A8A] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors mb-10">
          <Icon icon="ph:arrow-left-bold" className="w-4 h-4" /> Back to home
        </Link>

        <h1 className="text-3xl md:text-4xl font-black text-[#0A0A0A] dark:text-[#F5F5F5] tracking-tight mb-3">Privacy Policy</h1>
        <p className="text-[14px] text-[#A3A3A3] dark:text-[#6A6A6A] mb-12">Last updated: July 2026</p>

        <div className="prose-custom flex flex-col gap-8 text-[15px] leading-relaxed text-[#404040] dark:text-[#B0B0B0]">

          <section id={slugify(PRIVACY_SECTIONS[0])}>
            <h2 className="text-lg font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">No accounts, no sign-up</h2>
            <p>
              Growthip does not ask you to create an account, provide an email address, or submit any personal
              information. You interact with the protocol by connecting a Stellar wallet (Freighter or xBull).
              We never see or store your private keys.
            </p>
          </section>

          <section id={slugify(PRIVACY_SECTIONS[1])}>
            <h2 className="text-lg font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">What&apos;s public on-chain</h2>
            <p>
              Stellar is a public blockchain. Deposits, claims, and transaction amounts are permanently visible
              to anyone who looks — this is inherent to how blockchains work, and Growthip cannot change or
              hide that. What Growthip&apos;s zero-knowledge design specifically protects is the{" "}
              <strong>link between a deposit and a claim</strong> — not the amounts or addresses themselves.
            </p>
          </section>

          <section id={slugify(PRIVACY_SECTIONS[2])}>
            <h2 className="text-lg font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">Private notes are encrypted client-side</h2>
            <p>
              When you send a tip, a private note is encrypted in your browser (X25519 ECDH + AES-GCM) before
              it ever leaves your device. Growthip has no server that stores or has access to the contents of
              that note — only the intended recipient&apos;s browser can decrypt it.
            </p>
          </section>

          <section id={slugify(PRIVACY_SECTIONS[3])}>
            <h2 className="text-lg font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">Local storage</h2>
            <p>
              Some non-sensitive convenience data — like your display name, avatar choice, or a list of
              campaigns you&apos;ve created — is stored in your browser&apos;s local storage, scoped to your
              wallet address. This data never leaves your device and is not visible to Growthip.
            </p>
          </section>

          <section id={slugify(PRIVACY_SECTIONS[4])}>
            <h2 className="text-lg font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">What&apos;s stored where, exactly</h2>
            <p>If you activate Private Notes, three distinct things exist across three distinct places:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>
                <strong>On-chain (public, permanent):</strong> the encrypted tip message itself. Anyone can
                read the ciphertext bytes; without your private key, they are computationally meaningless.
              </li>
              <li>
                <strong>Browser local storage (this device only, encrypted at rest):</strong> your encryption
                identity — an X25519 keypair whose private half is wrapped with AES-GCM under your password
                and, separately, your recovery phrase. Growthip cannot read this even in principle; it never
                leaves your device unencrypted.
              </li>
              <li>
                <strong>Browser local storage (this device only, plaintext):</strong> the decrypted contents
                of tips you&apos;ve already viewed — once a note is successfully decrypted, its plaintext
                (amount, message, claim data) is cached locally so it doesn&apos;t need to be re-decrypted
                on every visit. This is why previously-viewed tips remain accessible even if your encryption
                identity is later lost — only <em>future, not-yet-seen</em> tips depend on that identity
                still being available.
              </li>
            </ul>
            <p className="mt-2">
              Growthip has no backend server and no database. Every one of the three items above lives
              either on the public Stellar ledger or inside your own browser — never on infrastructure
              Growthip operates or has access to. This also means Growthip has no ability to reset a
              forgotten password, reissue a lost identity, or recover encrypted notes on your behalf under
              any circumstance. See{" "}
              <Link href="/terms" className="text-[#00B2FF] dark:text-[#00B2FF] font-semibold hover:underline">
                Terms of Service
              </Link>{" "}
              for what this means if access is lost.
            </p>
          </section>

          <section id={slugify(PRIVACY_SECTIONS[5])}>
            <h2 className="text-lg font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">Testnet prototype</h2>
            <p>
              Growthip is currently an experimental prototype running on Stellar Testnet. It has not undergone
              a formal security audit. Please do not use real funds or Mainnet assets.
            </p>
          </section>

          <section id={slugify(PRIVACY_SECTIONS[6])}>
            <h2 className="text-lg font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">Questions</h2>
            <p>
              If you have questions about how Growthip handles data, open an issue on{" "}
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

const PRIVACY_SECTIONS = [
  "No accounts, no sign-up",
  "What's public on-chain",
  "Private notes are encrypted client-side",
  "Local storage",
  "What's stored where, exactly",
  "Testnet prototype",
  "Questions",
];