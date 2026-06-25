"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { config } from "@/lib/config";

function FAQItem({ question, answer, isOpen, onClick }: {
  question: string; answer: string; isOpen: boolean; onClick: () => void;
}) {
  return (
    <div className="border border-[#E5E5E5] bg-white rounded-2xl overflow-hidden transition-all duration-300 mb-4 hover:border-[#D4D4D4]">
      <button onClick={onClick} className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 focus:outline-none">
        <span className="font-bold text-[16px] text-[#0A0A0A]">{question}</span>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${isOpen ? "rotate-180 bg-[#0A0A0A] text-white" : "bg-[#F5F5F5] text-[#0A0A0A]"}`}>
          <Icon icon="ph:caret-down-bold" className="w-4 h-4" />
        </div>
      </button>
      <div className={`px-6 text-[#525252] text-[15px] leading-relaxed transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? "max-h-96 pb-6 opacity-100" : "max-h-0 py-0 opacity-0"}`}>
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

export default function Home() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const faqs = [
    { q: "How does the privacy mechanism work?", a: "In short: your tip is mixed into a shared pool so it can't be traced back to you, and only your chosen creator can claim it. For the technically curious — when you send a tip, your funds go into a shared smart contract pool, and your browser generates a mathematical 'commitment'. When a creator claims the tip, they provide a Zero-Knowledge Proof (Groth16) that matches the commitment. The smart contract verifies this proof without ever revealing which specific tip belongs to which creator." },
    { q: "What wallets are supported?", a: "Growthip supports Freighter and xBull wallet. Both are Stellar browser extensions. Connect either one to start tipping or receiving tips. Make sure your wallet is set to Stellar Testnet." },
    { q: "Which tokens can I use to tip?", a: "The protocol currently supports XLM and USDC on the Stellar Testnet, each with its own dedicated pool. Because the pools are modular, EURC and other Stellar assets are planned next." },
    { q: "Is there a platform fee?", a: "Yes — a transparent 1% platform fee, calculated on the actual amount deposited. The creator receives 99% of every tip, sent directly to their wallet on claim. The 1% accrues on-chain in the pool contract and is publicly auditable via the contract's accumulated_fees() function — anyone can verify the exact total at any time. This fee funds ongoing maintenance, infrastructure, and feature development to keep the protocol sustainable. Standard Stellar network fees still apply on top, as with any on-chain transaction." },
    { q: "Where does the 1% fee go?", a: "It accrues inside the pool smart contract's own storage, not to any hidden account — you can read the running total on-chain via accumulated_fees(). It is withdrawn later in batches via an admin-gated withdraw_fees() call, deliberately disconnected in time from any individual claim so that a specific claim cannot be linked to a treasury transfer. The treasury address is public, so aggregate fee revenue is fully observable." },
    { q: "Is Growthip fully audited?", a: "Not yet. Growthip is currently a hackathon prototype running experimentally on the Stellar Testnet. The smart contracts have not undergone a formal security audit. Please do not use real funds or Mainnet assets." },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#171717] relative overflow-hidden" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap'); .glass-nav { background: rgba(255,255,255,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid #E5E5E5; } ::selection { background: #6b45f3; color: white; } html { scroll-behavior: smooth; }` }} />

      <div className="absolute top-[-10%] left-[-5%] w-[40rem] h-[40rem] bg-[#6b45f3] opacity-[0.04] rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-10%] w-[35rem] h-[35rem] bg-[#7ffc58] opacity-[0.06] rounded-full blur-[100px] pointer-events-none" />

      <nav className="fixed top-0 w-full z-50 glass-nav">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/growthip-logo.png" alt="Growthip" className="w-10 h-10 object-contain" />
            <span className="font-extrabold text-xl tracking-tight text-[#0A0A0A]">Growthip</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-[15px] font-semibold text-[#525252]">
            <a href="#how-it-works" className="hover:text-[#0A0A0A] transition-colors">How it works</a>
            <a href="#features" className="hover:text-[#0A0A0A] transition-colors">Features</a>
            <a href="#fees" className="hover:text-[#0A0A0A] transition-colors">Fees</a>
            <a href="#faq" className="hover:text-[#0A0A0A] transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/dzakwannajmi/Growthip" target="_blank" rel="noreferrer" className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#E5E5E5] bg-white text-[#0A0A0A] font-semibold text-sm hover:bg-[#F5F5F5] transition-all shadow-sm">
              <Icon icon="mdi:github" className="w-5 h-5" /> GitHub
            </a>
            <Link href="/dashboard" className="flex items-center justify-center w-10 h-10 rounded-full bg-[#0A0A0A] text-white md:hidden">
              <Icon icon="ph:arrow-right-bold" className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-20 pb-20">
        <section className="mx-auto max-w-5xl px-6 pt-8 pb-20 text-center relative z-10">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-[#b7ebc6] bg-[#e6ffed] px-4 py-2 text-[13px] font-bold text-[#137333] mb-8 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#20a144] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#137333]" />
            </span>
            Live on Stellar Testnet · Privacy verified on every tip
          </div>
          <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-black tracking-tight text-[#0A0A0A] leading-[1.05] mb-8">
            Tip creators privately.{" "}<br className="hidden md:block" />
            <span className="text-[#6b45f3]">No one sees who, or how much.</span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg md:text-xl leading-relaxed text-[#525252] mb-12">
            Support your favorite creators without anyone seeing who you tipped, how much, or when. Your tip goes through privately — only the creator can claim it.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/dashboard" className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-full bg-[#0A0A0A] px-8 py-4 text-base font-bold text-white transition-all hover:bg-[#262626] hover:scale-[1.02] shadow-lg shadow-black/10">
              Open Dashboard <Icon icon="ph:arrow-right-bold" className="w-5 h-5" />
            </Link>
            <a href="https://github.com/dzakwannajmi/Growthip" target="_blank" rel="noreferrer" className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-full border border-[#E5E5E5] bg-white px-8 py-4 text-base font-bold text-[#0A0A0A] transition-all hover:bg-[#F5F5F5] shadow-sm">
              <Icon icon="mdi:github" className="w-6 h-6" /> View on GitHub
            </a>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-24">
          <div className="rounded-[40px] border border-[#6b45f3]/10 bg-white p-8 md:p-16 shadow-[0_8px_40px_rgba(0,0,0,0.02)] transition-transform duration-500 hover:scale-[1.01]">
            <div className="max-w-2xl mb-12 text-center md:text-left mx-auto md:mx-0">
              <p className="text-[13px] font-bold uppercase tracking-widest text-[#6b45f3] mb-3">Why Growthip?</p>
              <h2 className="text-3xl md:text-4xl font-black text-[#0A0A0A] tracking-tight leading-snug">The ultimate way to support creators privately.</h2>
            </div>
            <div className="grid gap-8 md:grid-cols-2">
              {[
                { icon: "hugeicons:absolute", title: "Absolute Privacy", desc: "Tip freely without being tracked. ZK proofs ensure nobody knows who sent the tip, how much, or to whom." },
                { icon: "ph:lightning-bold", title: "Lightning Fast", desc: "Tips settle in under a second, with network fees so small you'll barely notice them. Support a creator and move on." },
                { icon: "ph:lock-key-bold", title: "Trustless Smart Contracts", desc: "No middlemen or centralized servers holding your funds. Everything is enforced purely by immutable code." },
                { icon: "ph:hand-coins-bold", title: "Direct to Creators", desc: "Creators receive 99% of every tip straight to their wallet on claim. A flat 1% platform fee — transparent and verifiable on-chain — keeps the protocol sustainable." },
              ].map((r) => (
                <div key={r.title} className="flex gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-[#F5F5F5] border border-[#E5E5E5] flex items-center justify-center shrink-0 text-[#6b45f3]">
                    <Icon icon={r.icon} className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-[18px] font-bold text-[#0A0A0A] mb-2">{r.title}</h3>
                    <p className="text-[15px] leading-relaxed text-[#737373]">{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-24 border-t border-[#E5E5E5]/50">
          <div className="text-center md:text-left mb-16">
            <p className="text-[13px] font-bold uppercase tracking-widest text-[#6b45f3] mb-3">How it works</p>
            <h2 className="text-3xl md:text-5xl font-black text-[#0A0A0A] tracking-tight leading-tight">How Growthip protects<br className="hidden md:block" /> your privacy.</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { step: "01", icon: "ph:paper-plane-tilt-bold", title: "You send a tip", desc: "A fixed-value tip goes to a shared smart contract. A secret code is mathematically created on your device — your identity stays totally hidden." },
              { step: "02", icon: "ph:database-bold", title: "Network verifies securely", desc: "The blockchain only stores the mathematical proof. No wallet addresses, no tip amounts, and absolutely no personal data is saved." },
              { step: "03", icon: "ph:check-circle-bold", title: "Creator claims instantly", desc: "The creator claims the tip by matching your secret proof right in their browser. The funds are sent directly and instantly to their wallet." },
            ].map((item) => (
              <TiltCard key={item.step} className="group rounded-[32px] border border-[#E5E5E5] bg-white p-8 relative overflow-hidden cursor-default">
                <div className="flex items-center justify-between mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-[#F5F5F5] flex items-center justify-center group-hover:bg-[#eadeff] transition-colors duration-300">
                    <Icon icon={item.icon} className="w-7 h-7 text-[#0A0A0A] group-hover:text-[#6b45f3] transition-colors" />
                  </div>
                  <span className="text-[13px] font-black text-[#A3A3A3] uppercase tracking-widest">Step {item.step}</span>
                </div>
                <h3 className="text-xl font-bold text-[#0A0A0A] mb-3">{item.title}</h3>
                <p className="text-[15px] leading-relaxed text-[#525252]">{item.desc}</p>
              </TiltCard>
            ))}
          </div>
        </section>

        <section id="features" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-24">
          <div className="text-center mb-16">
            <p className="text-[13px] font-bold uppercase tracking-widest text-[#6b45f3] mb-3">Privacy by Design</p>
            <h2 className="text-3xl md:text-5xl font-black text-[#0A0A0A] tracking-tight leading-tight">Simple for you,<br />secure underneath.</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: "ph:shield-check-bold", title: "Truly Anonymous", desc: "Your tip is proven valid without ever revealing who you are. Not to the creator, not to us, not to anyone watching the blockchain." },
              { icon: "ph:tree-structure-bold", title: "No Sneaky Servers", desc: "Your tipping data isn't stored on a central server. Everything is verified by the network, so no one can secretly peek." },
              { icon: "ph:prohibit-bold", title: "One-Time Tip Tickets", desc: "Every tip comes with a unique, digital ticket. Once your favorite creator claims it, it can never be used again." },
              { icon: "ph:link-bold", title: "Locked to the Creator", desc: "Your tip is mathematically tied to your chosen creator. Absolutely nobody else can claim it — not even the platform." },
              { icon: "ph:globe-hemisphere-west-bold", title: "Stays on Your Device", desc: "All the security checks happen directly inside your web browser. Your private secrets never leave your phone or computer." },
              { icon: "ph:coins-bold", title: "Flexible Tipping Options", desc: "Tip easily using XLM or USDC right now. We are adding more crypto options soon to make supporting creators effortless." },
            ].map((f, i) => (
              <div key={i} className="rounded-[28px] border border-[#E5E5E5] bg-white p-7 transition-all hover:shadow-lg hover:shadow-black/[0.02]">
                <div className="w-12 h-12 rounded-xl bg-[#F5F5F5] text-[#6b45f3] flex items-center justify-center mb-5">
                  <Icon icon={f.icon} className="w-6 h-6" />
                </div>
                <h3 className="text-[17px] font-bold text-[#0A0A0A] mb-2">{f.title}</h3>
                <p className="text-[14px] leading-relaxed text-[#737373]">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-16 text-center">
          <h2 className="text-4xl md:text-5xl font-black text-[#0A0A0A] tracking-tight mb-6">Built on Stellar</h2>
          <p className="text-[16px] text-[#737373] mb-16">Powered by cutting-edge blockchain technology</p>
          <div className="grid grid-cols-2 md:grid-cols-4 items-center justify-items-center gap-12">
            {[
              { name: "Stellar", img: "/icons/Stellar-Dark.png", rounded: false },
              { name: "Freighter", img: "/icons/freighter.png", rounded: true },
              { name: "xBull Wallet", img: "/icons/xbull.png", rounded: true },
              { name: "Soroban", img: "/icons/Soroban.avif", rounded: false, scale: true },
            ].map((w) => (
              <div key={w.name} className="flex flex-col items-center gap-4 cursor-default">
                <div className={`flex items-center justify-center overflow-hidden flex-shrink-0 ${w.rounded ? "w-20 h-20 rounded-full" : "w-[204px] h-16"}`}>
                  <img src={w.img} alt={w.name} className={w.rounded ? "w-full h-full object-cover" : "w-full h-full object-contain"} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
                <span className="text-[15px] font-medium text-[#737373]">{w.name}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="fees" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-24">
          <div className="rounded-[40px] border border-[#6b45f3]/10 bg-white p-8 md:p-16 shadow-[0_8px_40px_rgba(0,0,0,0.02)]">
            <div className="max-w-2xl mb-12 text-center md:text-left mx-auto md:mx-0">
              <p className="text-[13px] font-bold uppercase tracking-widest text-[#6b45f3] mb-3">Transparent Fees</p>
              <h2 className="text-3xl md:text-4xl font-black text-[#0A0A0A] tracking-tight leading-snug">A platform fee built for sustainability.</h2>
              <p className="mt-5 text-[16px] leading-relaxed text-[#737373]">No hidden cuts, no surprises. Growthip charges a flat 1% platform fee, calculated on the actual amount deposited — and every stroop of it is verifiable on-chain.</p>
            </div>

            <div className="grid gap-10 md:grid-cols-2 items-center">
              <div className="rounded-[32px] bg-[#FAFAFA] border border-[#E5E5E5] p-8 md:p-10">
                <div className="flex items-end justify-between mb-8">
                  <div>
                    <p className="text-[13px] font-bold uppercase tracking-widest text-[#137333] mb-2">Creator receives</p>
                    <p className="text-6xl font-black text-[#0A0A0A] leading-none">99<span className="text-3xl">%</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-bold uppercase tracking-widest text-[#6b45f3] mb-2">Platform fee</p>
                    <p className="text-6xl font-black text-[#6b45f3] leading-none">1<span className="text-3xl">%</span></p>
                  </div>
                </div>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#E5E5E5]">
                  <div className="h-full bg-[#137333]" style={{ width: "99%" }} />
                  <div className="h-full bg-[#6b45f3]" style={{ width: "1%" }} />
                </div>
                <p className="mt-6 text-[14px] leading-relaxed text-[#737373]">Calculated on the real deposited amount — so a larger tip means a larger payout, not a flat base unit.</p>
              </div>

              <div className="flex flex-col gap-6">
                {[
                  { icon: "ph:magnifying-glass-bold", title: "Publicly auditable", desc: "The running fee total lives in the pool contract's accumulated_fees() — anyone can read the exact amount on-chain, anytime." },
                  { icon: "ph:eye-slash-bold", title: "Privacy-preserving withdrawal", desc: "Fees are withdrawn in batches, deliberately decoupled from any single claim, so a claim can't be linked to a treasury transfer." },
                  { icon: "ph:wrench-bold", title: "Funds the protocol", desc: "The fee supports ongoing maintenance, infrastructure, and feature development — keeping Growthip running and improving." },
                ].map((f) => (
                  <div key={f.title} className="flex gap-5">
                    <div className="w-12 h-12 rounded-xl bg-[#F5F5F5] border border-[#E5E5E5] flex items-center justify-center shrink-0 text-[#6b45f3]">
                      <Icon icon={f.icon} className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-[17px] font-bold text-[#0A0A0A] mb-1.5">{f.title}</h3>
                      <p className="text-[14px] leading-relaxed text-[#737373]">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 mx-auto max-w-3xl px-6 py-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-black text-[#0A0A0A] tracking-tight mb-5">Frequently Asked Questions</h2>
            <p className="text-[16px] text-[#737373]">Everything you need to know about Growthip.</p>
          </div>
          <div className="flex flex-col">
            {faqs.map((faq, index) => (
              <FAQItem key={index} question={faq.q} answer={faq.a} isOpen={openFaqIndex === index} onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)} />
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-24">
          <div className="rounded-[40px] bg-[#0A0A0A] p-10 md:p-20 text-center relative overflow-hidden">
            {/* Decorative gradient orbs inside CTA */}
            <div className="absolute top-[-20%] left-[10%] w-[24rem] h-[24rem] bg-[#6b45f3] opacity-20 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[10%] w-[24rem] h-[24rem] bg-[#7ffc58] opacity-10 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative z-10">
              <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-6 leading-tight">
                Ready to Accept Tips<br className="hidden md:block" /> Privately?
              </h2>
              <p className="mx-auto max-w-xl text-lg text-white/60 mb-10 leading-relaxed">
                Join creators who value privacy and security. No sign-up, no passwords — just connect your Stellar wallet and you're ready.
              </p>

              <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-10 py-4 text-lg font-bold text-[#0A0A0A] transition-all hover:scale-[1.02] shadow-lg">
                Connect Wallet to Start <Icon icon="ph:arrow-right-bold" className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E5E5E5] bg-white">
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10">
            {/* Brand */}
            <div className="max-w-xs">
              <div className="flex items-center gap-3 mb-4">
                <img src="/growthip-logo.png" alt="Growthip" className="w-9 h-9 object-contain" />
                <span className="font-extrabold text-xl tracking-tight text-[#0A0A0A]">Growthip</span>
              </div>
              <p className="text-[14px] leading-relaxed text-[#737373]">Private creator tipping on Stellar. Support creators without revealing who, how much, or when.</p>
            </div>

            {/* Nav columns */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 sm:gap-16">
              <div className="flex flex-col gap-3">
                <p className="text-[13px] font-bold uppercase tracking-widest text-[#0A0A0A] mb-1">Explore</p>
                <a href="#how-it-works" className="text-[14px] text-[#737373] hover:text-[#0A0A0A] transition-colors">How it works</a>
                <a href="#features" className="text-[14px] text-[#737373] hover:text-[#0A0A0A] transition-colors">Features</a>
                <a href="#fees" className="text-[14px] text-[#737373] hover:text-[#0A0A0A] transition-colors">Fees</a>
                <a href="#faq" className="text-[14px] text-[#737373] hover:text-[#0A0A0A] transition-colors">FAQ</a>
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-[13px] font-bold uppercase tracking-widest text-[#0A0A0A] mb-1">Product</p>
                <Link href="/dashboard" className="text-[14px] text-[#737373] hover:text-[#0A0A0A] transition-colors">Dashboard</Link>
                <Link href="/dashboard/activity" className="text-[14px] text-[#737373] hover:text-[#0A0A0A] transition-colors">Activity</Link>
                <Link href="/dashboard/analytics" className="text-[14px] text-[#737373] hover:text-[#0A0A0A] transition-colors">Analytics</Link>
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-[13px] font-bold uppercase tracking-widest text-[#0A0A0A] mb-1">Resources</p>
                <a href="https://github.com/dzakwannajmi/Growthip" target="_blank" rel="noreferrer" className="text-[14px] text-[#737373] hover:text-[#0A0A0A] transition-colors">GitHub</a>
                <a href="https://stellar.org" target="_blank" rel="noreferrer" className="text-[14px] text-[#737373] hover:text-[#0A0A0A] transition-colors">Stellar</a>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-12 pt-8 border-t border-[#E5E5E5] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[13px] text-[#A3A3A3]">© {new Date().getFullYear()} Growthip · Privacy-First Tipping</p>
            <div className="flex items-center gap-3 text-[13px] text-[#A3A3A3]">
              <span>Powered by Stellar</span>
              <span>·</span>
              <span>Secured by Soroban</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}