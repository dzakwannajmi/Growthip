"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { config } from "@/lib/config";
import CardNav, { type CardNavItem } from "@/components/CardNav";
import { WorldMap } from "@/components/WorldMap";
import { HowItWorksFlow } from "@/components/HowItWorksFlow";
import ThemeToggle from "@/components/ThemeToggle";
import { useIsDarkMode } from "@/hooks/useIsDarkMode";

function FAQItem({ question, answer, isOpen, onClick, isLast }: {
  question: string; answer: string; isOpen: boolean; onClick: () => void; isLast?: boolean;
}) {
  return (
    <div className={isLast ? "" : "border-b border-[#E5E5E5] dark:border-[#2A2A2A]"}>
      <button onClick={onClick} className="w-full text-left px-8 lg:px-10 py-7 flex items-center justify-between gap-4 focus:outline-none group">
        <span className="font-bold text-[16px] text-[#0A0A0A] dark:text-[#F5F5F5] group-hover:text-[#6b45f3] transition-colors">{question}</span>
        <Icon icon="ph:caret-down-bold" className={"w-4 h-4 text-[#A3A3A3] dark:text-[#6A6A6A] shrink-0 transition-transform duration-300" + (isOpen ? " rotate-180" : "")} />
      </button>
      <div className={"px-8 lg:px-10 text-[#525252] dark:text-[#A3A3A3] text-[15px] leading-relaxed transition-all duration-300 ease-in-out overflow-hidden" + (isOpen ? " max-h-96 pb-7 opacity-100" : " max-h-0 opacity-0")}>
        {answer}
      </div>
    </div>
  );
}

function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [isHovered, setIsHovered] = useState(false);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    setIsHovered(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rotateX = ((y - cy) / cy) * -15;
    const rotateY = ((x - cx) / cx) * 15;
    setStyle({
      transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02,1.02,1.02)`,
      transition: "transform 0.1s ease-out",
      zIndex: 10,
      boxShadow: "0 25px 50px -12px rgba(107,69,243,0.25)",
    });
  }

  function handleMouseLeave() {
    setIsHovered(false);
    setStyle({
      transform: "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)",
      transition: "transform 0.5s ease-out",
      zIndex: 1,
      boxShadow: "none",
    });
  }

  return (
    <div className={className} style={{ ...style, transformStyle: "preserve-3d" }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <div style={{ transform: isHovered ? "translateZ(40px)" : "translateZ(0px)", transition: "transform 0.3s ease-out" }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Small "+" cross marks at the four corners of a bordered box — a thin,
 * technical/blueprint accent (inspired by Vercel/Geist-style design
 * systems). Parent must be `position: relative` for correct placement.
 */
function CornerMarks() {
  // Plain Fragment of 4 absolute-positioned marks. This component must
  // ONLY ever be placed inside a `position: relative` container that is
  // NOT itself `display: grid` — if the immediate parent is a grid, this
  // becomes a grid item, and an absolutely-positioned grid item's
  // containing block can resolve unpredictably (observed jumping all the
  // way to a distant ancestor). Callers must wrap their grid content in
  // its own inner <div className="grid ..."> sibling, keeping this
  // component in the outer non-grid relative wrapper.
  const positions: React.CSSProperties[] = [
    { top: "-4px", left: "-4px" },
    { top: "-4px", right: "-4px" },
    { bottom: "-4px", left: "-4px" },
    { bottom: "-4px", right: "-4px" },
  ];
  return (
    <>
      {positions.map((pos, i) => (
        <div key={i} className="absolute w-2 h-2 pointer-events-none z-10" style={pos}>
          <svg viewBox="0 0 8 8" className="w-full h-full">
            <line x1="0" y1="4" x2="8" y2="4" stroke="#6b45f3" strokeWidth="1" />
            <line x1="4" y1="0" x2="4" y2="8" stroke="#6b45f3" strokeWidth="1" />
          </svg>
        </div>
      ))}
    </>
  );
}

/** Light-stroke variant of CornerMarks for use on dark backgrounds. Same non-grid-parent rule applies. */
function CornerMarksLight() {
  const positions: React.CSSProperties[] = [
    { top: "8px", left: "8px" },
    { top: "8px", right: "8px" },
    { bottom: "8px", left: "8px" },
    { bottom: "8px", right: "8px" },
  ];
  return (
    <>
      {positions.map((pos, i) => (
        <div key={i} className="absolute w-2 h-2 pointer-events-none z-10" style={pos}>
          <svg viewBox="0 0 8 8" className="w-full h-full">
            <line x1="0" y1="4" x2="8" y2="4" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
            <line x1="4" y1="0" x2="4" y2="8" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
          </svg>
        </div>
      ))}
    </>
  );
}

/**
 * Two small marks (left + right edge) positioned relative to whatever
 * element renders them — NOT relative to a shared outer box. Use this
 * inside each stacked row of a list so the marks land exactly on that
 * row's own actual top/bottom edge, regardless of how tall that specific
 * row happens to be (no percentage-based guessing, which breaks the
 * moment rows have unequal heights).
 */
function EdgeMarkPair({ edge }: { edge: "top" | "bottom" }) {
  const vertical = edge === "top" ? { top: "-4px" } : { bottom: "-4px" };
  return (
    <>
      <div className="absolute w-2 h-2 pointer-events-none z-10" style={{ ...vertical, left: "-4px" }}>
        <svg viewBox="0 0 8 8" className="w-full h-full">
          <line x1="0" y1="4" x2="8" y2="4" stroke="#6b45f3" strokeWidth="1" />
          <line x1="4" y1="0" x2="4" y2="8" stroke="#6b45f3" strokeWidth="1" />
        </svg>
      </div>
      <div className="absolute w-2 h-2 pointer-events-none z-10" style={{ ...vertical, right: "-4px" }}>
        <svg viewBox="0 0 8 8" className="w-full h-full">
          <line x1="0" y1="4" x2="8" y2="4" stroke="#6b45f3" strokeWidth="1" />
          <line x1="4" y1="0" x2="4" y2="8" stroke="#6b45f3" strokeWidth="1" />
        </svg>
      </div>
    </>
  );
}

export default function Home() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const isDark = useIsDarkMode();

  const faqs = [
    { q: "How does the privacy mechanism work?", a: "In short: your tip is mixed into a shared pool so it can't be traced back to you, and only your chosen creator can claim it. For the technically curious — when you send a tip, your funds go into a shared smart contract pool, and your browser generates a mathematical 'commitment'. When a creator claims the tip, they provide a Zero-Knowledge Proof (Groth16) that matches the commitment. The smart contract verifies this proof without ever revealing which specific tip belongs to which creator." },
    { q: "What wallets are supported?", a: "Growthip supports Freighter and xBull wallet. Both are Stellar browser extensions. Connect either one to start tipping or receiving tips. Make sure your wallet is set to Stellar Testnet." },
    { q: "Which tokens can I use to tip?", a: "The protocol currently supports XLM and USDC on the Stellar Testnet, each with its own dedicated pool. Because the pools are modular, EURC and other Stellar assets are planned next." },
    { q: "Is there a platform fee?", a: "Yes — a transparent 1% platform fee, calculated on the actual amount deposited. The creator receives 99% of every tip, sent directly to their wallet on claim. The 1% accrues on-chain in the pool contract and is publicly auditable via the contract's accumulated_fees() function — anyone can verify the exact total at any time. This fee funds ongoing maintenance, infrastructure, and feature development to keep the protocol sustainable. Standard Stellar network fees still apply on top, as with any on-chain transaction." },
    { q: "Where does the 1% fee go?", a: "It accrues inside the pool smart contract's own storage, not to any hidden account — you can read the running total on-chain via accumulated_fees(). It is withdrawn later in batches via an admin-gated withdraw_fees() call, deliberately disconnected in time from any individual claim so that a specific claim cannot be linked to a treasury transfer. The treasury address is public, so aggregate fee revenue is fully observable." },
    { q: "Is Growthip fully audited?", a: "Not yet. Growthip is currently a hackathon prototype running experimentally on the Stellar Testnet. The smart contracts have not undergone a formal security audit. Please do not use real funds or Mainnet assets." },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#0A0A0A] text-[#171717] dark:text-[#F5F5F5] relative overflow-hidden" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap'); .glass-nav { background: rgba(255,255,255,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid #E5E5E5; } ::selection { background: #6b45f3; color: white; } html { scroll-behavior: smooth; }` }} />

      <div className="absolute top-[-10%] left-[-5%] w-[40rem] h-[40rem] bg-[#6b45f3] opacity-[0.04] rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-10%] w-[35rem] h-[35rem] bg-[#7ffc58] opacity-[0.06] rounded-full blur-[100px] pointer-events-none" />

      <CardNav
        logo="/growthip-logo.png"
        logoAlt="Growthip"
        baseColor="#FFFFFF"
        menuColor="#0A0A0A"
        buttonBgColor="#0A0A0A"
        buttonTextColor="#FFFFFF"
        items={
          [
            {
              label: "How it works",
              bgColor: "#F3EEFF",
              textColor: "#0A0A0A",
              links: [
                { label: "See the flow", href: "#how-it-works", ariaLabel: "Go to How it works section" },
              ],
            },
            {
              label: "Features",
              bgColor: "#0A0A0A",
              textColor: "#FFFFFF",
              links: [
                { label: "Explore features", href: "#features", ariaLabel: "Go to Features section" },
              ],
            },
            {
              label: "Fees & FAQ",
              bgColor: "#FFFFFF",
              textColor: "#0A0A0A",
              links: [
                { label: "Read FAQ", href: "#faq", ariaLabel: "Go to FAQ section" },
                { label: "See fees", href: "#fees", ariaLabel: "Go to Fees section" },
              ],
            },
          ] as CardNavItem[]
        }
      />

      <main className="pt-20 pb-20">
        <section className="relative w-full min-h-screen overflow-hidden bg-[#FAFAFA]">
          {/* absolute inset-0 — WorldMap now fills this fixed-height
              section exactly (h-full internally), eliminating the
              aspect-ratio subpixel gap that let the page's light
              background peek through at the very bottom edge. */}
          <div className="absolute inset-0">
            <WorldMap
              lineColor="#6b45f3"
              dots={[
                { start: { lat: -6.21, lng: 106.85 }, end: { lat: 35.68, lng: 139.65 } },
                { start: { lat: 51.51, lng: -0.13 }, end: { lat: 40.71, lng: -74.01 } },
                { start: { lat: 25.20, lng: 55.27 }, end: { lat: -33.87, lng: 151.21 } },
                { start: { lat: -23.55, lng: -46.63 }, end: { lat: -1.29, lng: 36.82 } },
                { start: { lat: 1.35, lng: 103.82 }, end: { lat: 48.86, lng: 2.35 } },
              ]}
            />
          </div>

          {/* Text overlay — normal flow (below map) on mobile since the map
              is short there (fixed 2:1 aspect ratio); overlays bottom-left
              on md+ where the map is tall enough to host it comfortably. */}
          <div className="relative md:absolute md:inset-x-0 md:bottom-20 z-10 px-8 lg:px-16 py-10 md:pb-0 md:pt-0">
            <div className="max-w-xl flex flex-col gap-6">
              <h1 className="text-4xl md:text-5xl lg:text-[3.25rem] font-black tracking-tight text-[#0A0A0A] dark:text-[#F5F5F5] leading-[1.1]">
                Tip creators privately.
                <br />
                <span className="text-[#6b45f3]">No one can link you to it.</span>
              </h1>

              <p className="text-base md:text-lg leading-relaxed text-[#525252] dark:text-[#A3A3A3] max-w-md">
                Support your favorite creators without anyone linking your identity to the tip — only your chosen creator can claim it.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Link href="/dashboard" className="flex items-center gap-2 rounded-full bg-[#0A0A0A] px-7 py-3.5 text-sm font-bold text-white transition-all hover:bg-[#262626] hover:scale-[1.02] shadow-lg shadow-black/10">
                  Start Tipping <Icon icon="ph:arrow-up-right-bold" className="w-4 h-4" />
                </Link>
                <a href="#how-it-works" className="flex items-center gap-2 rounded-full border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#171717] px-7 py-3.5 text-sm font-bold text-[#0A0A0A] dark:text-[#F5F5F5] transition-all hover:bg-[#F5F5F5] dark:hover:bg-[#1E1E1E] shadow-sm">
                  <Icon icon="ph:arrow-down-bold" className="w-4 h-4" /> How it works
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Dashboard preview — real product screenshot, browser-mockup frame */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center mb-12">
            <p className="text-[13px] font-bold uppercase tracking-widest text-[#6b45f3] mb-3">Built for privacy</p>
            <h2 className="text-3xl md:text-4xl font-black text-[#0A0A0A] dark:text-[#F5F5F5] tracking-tight leading-snug">Everything you tip. Nothing you reveal.</h2>
            <p className="mt-4 text-[16px] text-[#737373] dark:text-[#8A8A8A] max-w-xl mx-auto">Check your balance, tokens, and withdrawals — end-to-end encrypted, so only you can read what&apos;s inside.</p>
          </div>

          <div className="rounded-[24px] border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#171717] shadow-[0_20px_60px_rgba(0,0,0,0.08)] overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#FAFAFA] dark:bg-[#111111]">
              <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
              <span className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
              <span className="w-3 h-3 rounded-full bg-[#28C840]" />
            </div>
            <img
              src="/dashboard-preview.png"
              alt="Growthip dashboard preview"
              className="w-full h-auto block select-none [-webkit-user-drag:none]"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-24">
          <div className="max-w-2xl mb-12 text-center md:text-left mx-auto md:mx-0">
            <p className="text-[13px] font-bold uppercase tracking-widest text-[#6b45f3] mb-3">Why Growthip?</p>
            <h2 className="text-3xl md:text-4xl font-black text-[#0A0A0A] dark:text-[#F5F5F5] tracking-tight leading-snug">The ultimate way to support creators privately.</h2>
          </div>
          <div className="relative border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#171717]">
            <CornerMarks />
            <div className="grid md:grid-cols-2">
            {[
              { icon: "hugeicons:absolute", title: "Cryptographic Privacy", desc: "Tip freely without being linked. ZK proofs ensure nobody can prove which deposit corresponds to which claim." },
              { icon: "ph:lightning-bold", title: "Lightning Fast", desc: "Tips settle in under a second, with network fees so small you'll barely notice them. Support a creator and move on." },
              { icon: "ph:lock-key-bold", title: "Trustless Smart Contracts", desc: "No middlemen or centralized servers holding your funds. Everything is enforced purely by immutable code." },
              { icon: "ph:hand-coins-bold", title: "Direct to Creators", desc: "Creators receive 99% of every tip straight to their wallet on claim. A flat 1% platform fee — transparent and verifiable on-chain — keeps the protocol sustainable." },
            ].map((r, i, arr) => {
              const isLeftCol = i % 2 === 0;
              const isLastRow = i >= arr.length - 2;
              const cellClasses = [
                "relative p-8 md:p-10 flex gap-5 border-[#E5E5E5] dark:border-[#2A2A2A]",
                isLeftCol ? "md:border-r" : "",
                !isLastRow ? "border-b" : "",
              ].filter(Boolean).join(" ");
              return (
                <div key={r.title} className={cellClasses}>
                  <CornerMarks />
                  <div className="w-14 h-14 rounded-2xl bg-[#F5F5F5] dark:bg-[#1E1E1E] flex items-center justify-center shrink-0 text-[#6b45f3]">
                    <Icon icon={r.icon} className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-[18px] font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">{r.title}</h3>
                    <p className="text-[15px] leading-relaxed text-[#737373] dark:text-[#8A8A8A]">{r.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-24 border-t border-[#E5E5E5]/50">
          <div className="text-center md:text-left mb-16">
            <p className="text-[13px] font-bold uppercase tracking-widest text-[#6b45f3] mb-3">How it works</p>
            <h2 className="text-3xl md:text-5xl font-black text-[#0A0A0A] dark:text-[#F5F5F5] tracking-tight leading-tight">How Growthip protects<br className="hidden md:block" /> your privacy.</h2>
          </div>

          <div className="relative border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#171717] mb-6 p-4">
            <CornerMarks />
            <HowItWorksFlow />
          </div>

          <div className="relative border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#171717]">
            <CornerMarks />
            <div className="grid md:grid-cols-3">
            {[
              { step: "01", icon: "ph:paper-plane-tilt-bold", title: "You send a tip", desc: "A fixed-value tip goes to a shared smart contract. A secret code is mathematically created on your device — nobody can link this deposit back to you as the sender." },
              { step: "02", icon: "ph:database-bold", title: "Network verifies securely", desc: "The blockchain stores your deposit and the creator\u2019s claim as separate, public events. What stays hidden is the cryptographic link between them." },
              { step: "03", icon: "ph:check-circle-bold", title: "Creator claims instantly", desc: "The creator decrypts a private note and generates their own zero-knowledge proof right in their browser. The funds are sent directly and instantly to their wallet." },
            ].map((item, i, arr) => {
              const isLastCol = i === arr.length - 1;
              const cellClasses = ["relative p-8", !isLastCol ? "border-b md:border-b-0 md:border-r border-[#E5E5E5] dark:border-[#2A2A2A]" : ""].filter(Boolean).join(" ");
              return (
                <div key={item.step} className={cellClasses}>
                  <CornerMarks />
                  <div className="flex items-center justify-between mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-[#F5F5F5] dark:bg-[#1E1E1E] flex items-center justify-center">
                      <Icon icon={item.icon} className="w-7 h-7 text-[#0A0A0A] dark:text-[#F5F5F5]" />
                    </div>
                    <span className="text-[13px] font-black text-[#A3A3A3] dark:text-[#6A6A6A] uppercase tracking-widest">Step {item.step}</span>
                  </div>
                  <h3 className="text-xl font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-3">{item.title}</h3>
                  <p className="text-[15px] leading-relaxed text-[#525252] dark:text-[#A3A3A3]">{item.desc}</p>
                </div>
              );
            })}
          </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-24">
          <div className="text-center mb-16">
            <p className="text-[13px] font-bold uppercase tracking-widest text-[#6b45f3] mb-3">Privacy by Design</p>
            <h2 className="text-3xl md:text-5xl font-black text-[#0A0A0A] dark:text-[#F5F5F5] tracking-tight leading-tight">Simple for you,<br />secure underneath.</h2>
          </div>
          <div className="relative border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#171717]">
            <CornerMarks />
            <div className="grid md:grid-cols-3">
            {[
              { icon: "ph:shield-check-bold", title: "Truly Anonymous", desc: "Your tip is proven valid without ever revealing who you are. Not to the creator, not to us, not to anyone watching the blockchain." },
              { icon: "ph:tree-structure-bold", title: "No Sneaky Servers", desc: "Your tipping data isn't stored on a central server. Everything is verified by the network, so no one can secretly peek." },
              { icon: "ph:prohibit-bold", title: "One-Time Tip Tickets", desc: "Every tip comes with a unique, digital ticket. Once your favorite creator claims it, it can never be used again." },
              { icon: "ph:link-bold", title: "Locked to the Creator", desc: "Your tip is mathematically tied to your chosen creator. Nobody else can claim it — not even the platform." },
              { icon: "ph:globe-hemisphere-west-bold", title: "Stays on Your Device", desc: "All the security checks happen directly inside your web browser. Your private secrets never leave your phone or computer." },
              { icon: "ph:coins-bold", title: "Flexible Tipping Options", desc: "Tip easily using XLM or USDC right now. We are adding more crypto options soon to make supporting creators effortless." },
            ].map((f, i, arr) => {
              const isLastCol = i % 3 === 2;
              const isLastRow = i >= arr.length - 3;
              const isMobileLast = i === arr.length - 1;
              const cellClasses = [
                "relative p-7 border-[#E5E5E5] dark:border-[#2A2A2A]",
                !isMobileLast ? "border-b" : "",
                !isLastCol ? "md:border-r" : "",
                isLastRow ? "md:border-b-0" : "md:border-b",
              ].filter(Boolean).join(" ");
              return (
                <div key={i} className={cellClasses}>
                  <CornerMarks />
                  <div className="w-12 h-12 rounded-xl bg-[#F5F5F5] dark:bg-[#1E1E1E] text-[#6b45f3] flex items-center justify-center mb-5">
                    <Icon icon={f.icon} className="w-6 h-6" />
                  </div>
                  <h3 className="text-[17px] font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-2">{f.title}</h3>
                  <p className="text-[14px] leading-relaxed text-[#737373] dark:text-[#8A8A8A]">{f.desc}</p>
                </div>
              );
            })}
          </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-16 text-center">
          <h2 className="text-4xl md:text-5xl font-black text-[#0A0A0A] dark:text-[#F5F5F5] tracking-tight mb-6">Built on Stellar</h2>
          <p className="text-[16px] text-[#737373] dark:text-[#8A8A8A] mb-16">Powered by cutting-edge blockchain technology</p>
          <div className="grid grid-cols-2 md:grid-cols-4 items-center justify-items-center gap-12">
            {[
              { name: "Stellar", img: isDark ? "/icons/Stellar-White.png" : "/icons/Stellar-Dark.png", rounded: false },
              { name: "Freighter", img: "/icons/freighter.png", rounded: true },
              { name: "xBull Wallet", img: "/icons/xbull.png", rounded: true },
              { name: "Soroban", img: "/icons/Soroban.avif", rounded: false, scale: true },
            ].map((w) => (
              <div key={w.name} className="flex flex-col items-center gap-4 cursor-default">
                <div className={`flex items-center justify-center overflow-hidden flex-shrink-0 ${w.rounded ? "w-20 h-20 rounded-full" : "w-[204px] h-16"}`}>
                  <img src={w.img} alt={w.name} className={w.rounded ? "w-full h-full object-cover" : "w-full h-full object-contain"} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
                <span className="text-[15px] font-medium text-[#737373] dark:text-[#8A8A8A]">{w.name}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="metrics" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-24">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] items-start">
            {/* Left column */}
            <div>
              <h2 className="text-3xl md:text-4xl font-black text-[#0A0A0A] dark:text-[#F5F5F5] tracking-tight leading-snug mb-4">
                Real numbers<br />behind the privacy.
              </h2>
              <p className="text-[15px] leading-relaxed text-[#737373] dark:text-[#8A8A8A] max-w-sm">
                Every figure below is verifiable on-chain or in the open-source contract code — not marketing copy. Growthip is an active testnet prototype, not a production-audited system yet.
              </p>
            </div>

            {/* Right column — stat rows */}
            <div className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#171717]">
              {[
                { value: "1%",  label: "Platform fee — verifiable via accumulated_fees()", tag: "On-chain" },
                { value: "2",   label: "Tokens supported today — XLM and USDC, EURC planned next", tag: "Multi-token" },
                { value: "<1s", label: "Typical tip settlement time on Stellar testnet", tag: "Testnet" },
              ].map((stat, i) => (
                <div
                  key={stat.value}
                  className={"relative flex items-center justify-between gap-6 px-8 py-8" + (i !== 2 ? " border-b border-[#E5E5E5] dark:border-[#2A2A2A]" : "")}
                >
                  {i === 0 && <EdgeMarkPair edge="top" />}
                  <EdgeMarkPair edge="bottom" />
                  <div>
                    <p className="text-4xl md:text-5xl font-black text-[#0A0A0A] dark:text-[#F5F5F5] tracking-tight">{stat.value}</p>
                    <p className="text-[13px] text-[#737373] dark:text-[#8A8A8A] mt-1 max-w-xs">{stat.label}</p>
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#6b45f3] border border-[#6b45f3]/20 bg-[#6b45f3]/5 rounded-full px-3 py-1.5 whitespace-nowrap shrink-0">
                    {stat.tag}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom highlight card — the actual privacy guarantee, not a fabricated testimonial */}
          <div className="relative mt-10 border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#171717]">
            <CornerMarks />
            <div className="grid md:grid-cols-2">
            <div className="p-10 border-b md:border-b-0 md:border-r border-[#E5E5E5] dark:border-[#2A2A2A] flex items-center">
              <p className="text-2xl md:text-3xl font-bold text-[#0A0A0A] dark:text-[#F5F5F5] leading-snug">
                The link between your tip and your identity <span className="text-[#6b45f3]">stays hidden</span> — that is the one guarantee the protocol enforces.
              </p>
            </div>
            <div className="p-10 flex flex-col justify-center gap-5">
              <p className="text-[14px] leading-relaxed text-[#737373] dark:text-[#8A8A8A]">
                Your deposit and the creator&apos;s claim exist on-chain as two separate, public events. Zero-knowledge proofs verify a claim is valid without revealing which deposit it came from — the cryptographic link itself is what&apos;s private, not the amounts or addresses.
              </p>
              <a href="https://github.com/dzakwannajmi/Growthip/blob/main/README.md" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[13px] font-bold text-[#0A0A0A] dark:text-[#F5F5F5] border border-[#E5E5E5] dark:border-[#2A2A2A] rounded-full px-5 py-2.5 w-fit hover:bg-[#F5F5F5] dark:hover:bg-[#1E1E1E] transition-colors">
                Read the technical writeup <Icon icon="ph:arrow-right-bold" className="w-4 h-4" />
              </a>
            </div>
            </div>
          </div>
        </section>

        <section id="fees" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-24">
          <div className="max-w-2xl mb-12 text-center md:text-left mx-auto md:mx-0">
            <p className="text-[13px] font-bold uppercase tracking-widest text-[#6b45f3] mb-3">Transparent Fees</p>
            <h2 className="text-3xl md:text-4xl font-black text-[#0A0A0A] dark:text-[#F5F5F5] tracking-tight leading-snug">A platform fee built for sustainability.</h2>
            <p className="mt-5 text-[16px] leading-relaxed text-[#737373] dark:text-[#8A8A8A]">No hidden cuts, no surprises. Growthip charges a flat 1% platform fee, calculated on the actual amount deposited — and every stroop of it is verifiable on-chain.</p>
          </div>

          <div className="relative border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#171717]">
            <CornerMarks />
            <div className="grid md:grid-cols-2">

            <div className="p-10 lg:p-14 border-b md:border-b-0 md:border-r border-[#E5E5E5] dark:border-[#2A2A2A] flex flex-col justify-center">
              <CornerMarks />
              <div className="flex items-end justify-between mb-8">
                <div>
                  <p className="text-[13px] font-bold uppercase tracking-widest text-[#137333] mb-2">Creator receives</p>
                  <p className="text-6xl font-black text-[#0A0A0A] dark:text-[#F5F5F5] leading-none">99<span className="text-3xl">%</span></p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold uppercase tracking-widest text-[#6b45f3] mb-2">Platform fee</p>
                  <p className="text-6xl font-black text-[#6b45f3] leading-none">1<span className="text-3xl">%</span></p>
                </div>
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#E5E5E5] dark:bg-[#2A2A2A]">
                <div className="h-full bg-[#137333]" style={{ width: "99%" }} />
                <div className="h-full bg-[#6b45f3]" style={{ width: "1%" }} />
              </div>
              <p className="mt-6 text-[14px] leading-relaxed text-[#737373] dark:text-[#8A8A8A]">Calculated on the real deposited amount — so a larger tip means a larger payout, not a flat base unit.</p>
            </div>

            <div className="p-10 lg:p-14 flex flex-col gap-6 justify-center">
              <CornerMarks />
              {[
                { icon: "ph:magnifying-glass-bold", title: "Publicly auditable", desc: "The running fee total lives in the pool contract's accumulated_fees() — anyone can read the exact amount on-chain, anytime." },
                { icon: "ph:eye-slash-bold", title: "Privacy-preserving withdrawal", desc: "Fees are withdrawn in batches, deliberately decoupled from any single claim, so a claim can't be linked to a treasury transfer." },
                { icon: "ph:wrench-bold", title: "Funds the protocol", desc: "The fee supports ongoing maintenance, infrastructure, and feature development — keeping Growthip running and improving." },
              ].map((f) => (
                <div key={f.title} className="flex gap-5">
                  <div className="w-12 h-12 rounded-xl bg-[#F5F5F5] dark:bg-[#1E1E1E] border border-[#E5E5E5] dark:border-[#2A2A2A] flex items-center justify-center shrink-0 text-[#6b45f3]">
                    <Icon icon={f.icon} className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-[17px] font-bold text-[#0A0A0A] dark:text-[#F5F5F5] mb-1.5">{f.title}</h3>
                    <p className="text-[14px] leading-relaxed text-[#737373] dark:text-[#8A8A8A]">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 mx-auto max-w-6xl px-6 py-24">
          <div className="relative grid md:grid-cols-2 border-t border-b border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#171717]">
            <CornerMarks />
            <div className="p-10 lg:p-14 border-b md:border-b-0 md:border-r border-[#E5E5E5] dark:border-[#2A2A2A] flex flex-col">
              <h2 className="text-4xl md:text-5xl font-black text-[#0A0A0A] dark:text-[#F5F5F5] tracking-tight leading-[1.05] mb-5">
                Frequently<br />asked questions
              </h2>
              <p className="text-[15px] leading-relaxed text-[#737373] dark:text-[#8A8A8A] max-w-sm mb-8">
                Everything you need to know about using Growthip. Can&apos;t find an answer? Ask directly on GitHub.
              </p>
              
                <a href="https://github.com/dzakwannajmi/Growthip/issues"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-[13px] font-bold text-[#0A0A0A] dark:text-[#F5F5F5] border border-[#E5E5E5] dark:border-[#2A2A2A] rounded-full px-5 py-2.5 w-fit hover:bg-[#F5F5F5] dark:hover:bg-[#1E1E1E] transition-colors"
              >
                Ask on GitHub <Icon icon="ph:arrow-up-right-bold" className="w-4 h-4" />
              </a>
            </div>
            <div className="flex flex-col">
              {faqs.map((faq, index) => (
                <FAQItem
                  key={index}
                  question={faq.q}
                  answer={faq.a}
                  isOpen={openFaqIndex === index}
                  onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                  isLast={index === faqs.length - 1}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="relative w-full overflow-hidden" style={{ minHeight: "70vh" }}>
          <div className="absolute inset-0">
            <WorldMap lineColor="#6b45f3" dots={[]} />
          </div>

          <div className="relative z-10 flex items-center justify-center h-full" style={{ minHeight: "70vh" }}>
            <div className="text-center px-6 max-w-2xl mx-auto">
              <h2 className="text-4xl md:text-6xl font-black text-[#0A0A0A] dark:text-[#F5F5F5] tracking-tight mb-6 leading-tight">
                Ready to Accept Tips<br className="hidden md:block" /> Privately?
              </h2>
              <p className="mx-auto max-w-xl text-lg text-[#525252] dark:text-[#A3A3A3] mb-10 leading-relaxed">
                Join creators who value privacy and security. No sign-up, no passwords — just connect your Stellar wallet and you&apos;re ready.
              </p>
              <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0A0A0A] dark:bg-white px-10 py-4 text-lg font-bold text-white dark:text-[#0A0A0A] transition-all hover:bg-[#262626] dark:hover:bg-[#E5E5E5] hover:scale-[1.02] shadow-lg">
                Connect Wallet to Start <Icon icon="ph:arrow-right-bold" className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#0A0A0A]">
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10">
            {/* Brand */}
            <div className="max-w-xs">
              <div className="flex items-center gap-3 mb-4">
                <img src="/growthip-logo.png" alt="Growthip" className="w-9 h-9 object-contain" />
                <span className="font-extrabold text-xl tracking-tight text-[#0A0A0A] dark:text-[#F5F5F5]">Growthip</span>
              </div>
              <p className="text-[14px] leading-relaxed text-[#737373] dark:text-[#8A8A8A]">Private creator tipping on Stellar. Support creators without revealing who sent the tip.</p>
            </div>

            {/* Nav columns */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 sm:gap-16">
              <div className="flex flex-col gap-3">
                <p className="text-[13px] font-bold uppercase tracking-widest text-[#0A0A0A] dark:text-[#F5F5F5] mb-1">Explore</p>
                <a href="#how-it-works" className="text-[14px] text-[#737373] dark:text-[#8A8A8A] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors">How it works</a>
                <a href="#features" className="text-[14px] text-[#737373] dark:text-[#8A8A8A] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors">Features</a>
                <a href="#fees" className="text-[14px] text-[#737373] dark:text-[#8A8A8A] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors">Fees</a>
                <a href="#faq" className="text-[14px] text-[#737373] dark:text-[#8A8A8A] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors">FAQ</a>
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-[13px] font-bold uppercase tracking-widest text-[#0A0A0A] dark:text-[#F5F5F5] mb-1">Product</p>
                <Link href="/dashboard" className="text-[14px] text-[#737373] dark:text-[#8A8A8A] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors">Dashboard</Link>
                <Link href="/dashboard/activity" className="text-[14px] text-[#737373] dark:text-[#8A8A8A] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors">Activity</Link>
                <Link href="/dashboard/analytics" className="text-[14px] text-[#737373] dark:text-[#8A8A8A] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors">Analytics</Link>
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-[13px] font-bold uppercase tracking-widest text-[#0A0A0A] dark:text-[#F5F5F5] mb-1">Legal</p>
                <Link href="/privacy" className="text-[14px] text-[#737373] dark:text-[#8A8A8A] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors">Privacy Policy</Link>
                <Link href="/terms" className="text-[14px] text-[#737373] dark:text-[#8A8A8A] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors">Terms of Service</Link>
                <a href="https://github.com/dzakwannajmi/Growthip" target="_blank" rel="noreferrer" className="text-[14px] text-[#737373] dark:text-[#8A8A8A] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors">GitHub</a>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-12 pt-8 border-t border-[#E5E5E5] dark:border-[#2A2A2A] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[13px] text-[#A3A3A3] dark:text-[#6A6A6A]">© {new Date().getFullYear()} Growthip · Privacy-First Tipping</p>
            <div className="flex items-center gap-3 text-[13px] text-[#A3A3A3] dark:text-[#6A6A6A]">
              <span>Powered by Stellar</span>
              <span>·</span>
              <span>Secured by Soroban</span>
              <span className="hidden sm:inline">·</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </footer>
    </div >
  );
}