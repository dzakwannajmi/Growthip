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
    { q: "How does the privacy mechanism work?", a: "When you send a tip, your funds go into a shared smart contract pool, and your browser generates a mathematical 'commitment'. When a creator claims the tip, they provide a Zero-Knowledge Proof (Groth16) that matches the commitment. The smart contract verifies this proof without ever revealing which specific tip belongs to which creator." },
    { q: "What wallets are supported?", a: "Currently, Growthip primarily supports the Freighter wallet for the Stellar network. We highly recommend using the browser extension for the best experience. Ensure your wallet is configured to the Stellar Testnet." },
    { q: "Which tokens can I use to tip?", a: "The protocol currently supports XLM and USDC on the Stellar Testnet. Because the pools are modular, we plan to add support for EURC and other Stellar assets in the near future." },
    { q: "Is there any platform fee?", a: "No. Growthip is designed to be completely trustless and direct. 100% of the tip you send goes to the creator. The only fees involved are the standard, microscopic Stellar network fees for executing the transaction." },
    { q: "Is Growthip fully audited?", a: "Not yet. Growthip is currently a hackathon prototype running experimentally on the Stellar Testnet. The smart contracts have not undergone a formal security audit. Please do not use real funds or Mainnet assets." },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#171717] relative overflow-hidden" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap'); .glass-nav { background: rgba(255,255,255,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid #E5E5E5; } ::selection { background: #6b45f3; color: white; }` }} />

      <div className="absolute top-[-10%] left-[-5%] w-[40rem] h-[40rem] bg-[#6b45f3] opacity-[0.04] rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-10%] w-[35rem] h-[35rem] bg-[#7ffc58] opacity-[0.06] rounded-full blur-[100px] pointer-events-none" />

      <nav className="fixed top-0 w-full z-50 glass-nav">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0A0A0A] flex items-center justify-center text-white font-bold text-xl">G</div>
            <span className="font-extrabold text-xl tracking-tight text-[#0A0A0A]">Growthip</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-[15px] font-semibold text-[#525252]">
            <Link href="/dashboard" className="hover:text-[#0A0A0A] transition-colors">Dashboard</Link>
            <Link href="/dashboard/activity" className="hover:text-[#0A0A0A] transition-colors">Activity</Link>
            <Link href="/dashboard/analytics" className="hover:text-[#0A0A0A] transition-colors">Analytics</Link>
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
            Live on Stellar Testnet · ZK proofs verified on-chain
          </div>
          <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-black tracking-tight text-[#0A0A0A] leading-[1.05] mb-8">
            Private creator tipping{" "}<br className="hidden md:block" />
            <span className="text-[#6b45f3]">powered by zero-knowledge.</span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg md:text-xl leading-relaxed text-[#525252] mb-12">
            Growthip lets supporters send tips into a privacy pool on Stellar Soroban. Groth16 BN254 proofs — generated in your browser — verify the claim without revealing who sent what to whom.
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
              <h2 className="text-3xl md:text-4xl font-black text-[#0A0A0A] tracking-tight">The ultimate way to support creators privately.</h2>
            </div>
            <div className="grid gap-8 md:grid-cols-2">
              {[
                { icon: "ph:user-secret-bold", title: "Absolute Privacy", desc: "Tip freely without being tracked. ZK proofs ensure nobody knows who sent the tip, how much, or to whom." },
                { icon: "ph:lightning-bold", title: "Lightning Fast", desc: "Built on Stellar Soroban. Enjoy sub-second settlement finality and near-zero transaction fees." },
                { icon: "ph:lock-key-bold", title: "Trustless Smart Contracts", desc: "No middlemen or centralized servers holding your funds. Everything is enforced purely by immutable code." },
                { icon: "ph:hand-coins-bold", title: "Direct to Creators", desc: "100% of the tip goes directly to the creator's wallet upon claiming. No platform cuts or hidden charges." },
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

        <section className="mx-auto max-w-7xl px-6 py-24 border-t border-[#E5E5E5]/50">
          <div className="text-center md:text-left mb-16">
            <p className="text-[13px] font-bold uppercase tracking-widest text-[#6b45f3] mb-3">How it works</p>
            <h2 className="text-3xl md:text-5xl font-black text-[#0A0A0A] tracking-tight">How Growthip protects<br className="hidden md:block" /> your privacy.</h2>
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

        <section className="mx-auto max-w-7xl px-6 py-24">
          <div className="text-center mb-16">
            <p className="text-[13px] font-bold uppercase tracking-widest text-[#6b45f3] mb-3">Privacy by Design</p>
            <h2 className="text-3xl md:text-5xl font-black text-[#0A0A0A] tracking-tight">Simple for you,<br />secure underneath.</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: "ph:shield-check-bold", title: "Smart Cryptography", desc: "We use advanced math (Zero-Knowledge) to prove your tip is valid without ever revealing who you are to anyone." },
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
          <h2 className="text-4xl md:text-5xl font-black text-[#0A0A0A] tracking-tight mb-4">Built on Stellar</h2>
          <p className="text-[16px] text-[#737373] mb-16">Powered by cutting-edge blockchain technology</p>
          <div className="grid grid-cols-2 md:grid-cols-4 items-center justify-items-center gap-12">
            {[
              { name: "Stellar", img: "/icons/Stellar-Dark.png", rounded: false },
              { name: "Freighter", img: "/icons/freighter.png", rounded: true },
              { name: "xBull Wallet", img: "/icons/xbull.png", rounded: true },
              { name: "Soroban", img: "/icons/Soroban.jpg", rounded: false, scale: true },
            ].map((w) => (
              <div key={w.name} className="flex flex-col items-center gap-4 cursor-default">
                <div className={`flex items-center justify-center overflow-hidden flex-shrink-0 ${w.rounded ? "w-20 h-20 rounded-full" : "w-[204px] h-16"}`}>
                  <img src={w.img} alt={w.name} className={w.rounded ? "w-full h-full object-cover" : "w-full h-full object-contain"} style={(w as any).scale ? { transform: "scale(1.8)" } : undefined} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
                <span className="text-[15px] font-medium text-[#737373]">{w.name}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-black text-[#0A0A0A] tracking-tight mb-4">Frequently Asked Questions</h2>
            <p className="text-[16px] text-[#737373]">Everything you need to know about Growthip.</p>
          </div>
          <div className="flex flex-col">
            {faqs.map((faq, index) => (
              <FAQItem key={index} question={faq.q} answer={faq.a} isOpen={openFaqIndex === index} onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)} />
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 pb-24 pt-10 text-center">
          <h2 className="text-4xl md:text-6xl font-black text-[#0A0A0A] tracking-tight mb-6">Try it on Testnet.</h2>
          <p className="mx-auto max-w-xl text-lg text-[#525252] mb-10 leading-relaxed">Send a private tip and claim it back using a ZK proof — all entirely in your browser, securely on Stellar.</p>
          <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#6b45f3] px-10 py-4 text-lg font-bold text-white transition-all hover:bg-[#5835d6] hover:shadow-lg hover:shadow-[#6b45f3]/20 hover:scale-[1.02]">
            Open Dashboard <Icon icon="ph:arrow-right-bold" className="w-5 h-5" />
          </Link>
          <div className="mt-12 rounded-[24px] border border-[#ffb6a3] bg-[#fff5f2] p-6 max-w-xl mx-auto flex gap-4 text-left shadow-sm">
            <Icon icon="ph:warning-circle-fill" className="w-7 h-7 text-[#e0452d] shrink-0 mt-0.5" />
            <div>
              <p className="text-[15px] font-bold text-[#e0452d] mb-1">Prototype Notice</p>
              <p className="text-[14px] leading-relaxed text-[#b33522]">Growthip is currently a hackathon prototype running on the Stellar Testnet. The smart contracts are not audited. Do not use real funds.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E5E5E5] bg-white">
        <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="text-[14px] font-medium text-[#737373]">Built by <span className="text-[#0A0A0A] font-bold">Muhammad Dzakwan Najmi</span> · Growthip on Stellar Testnet</p>
          <div className="flex items-center gap-8 text-[14px] font-semibold text-[#737373]">
            <a href="https://github.com/dzakwannajmi/Growthip" target="_blank" rel="noreferrer" className="hover:text-[#0A0A0A] transition-colors">GitHub Repository</a>
            <a href={"https://stellar.expert/explorer/testnet/contract/" + config.pool.xlm} target="_blank" rel="noreferrer" className="hover:text-[#0A0A0A] transition-colors">Stellar Explorer</a>
          </div>
        </div>
      </footer>
    </div>
  );
}