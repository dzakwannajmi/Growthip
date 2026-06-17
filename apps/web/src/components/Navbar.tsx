"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/deposit", label: "Send Tip" },
  { href: "/claim", label: "Claim" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-4 z-50 mx-auto max-w-7xl px-6 lg:px-8">
      <div className="flex items-center justify-between rounded-full border border-white/10 bg-white/[0.04] px-5 py-4 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-neon-violet text-lg font-black">
            G
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold tracking-wide text-white">Growthip</p>
            <p className="text-xs text-soft-gray/60">Private tipping on Stellar</p>
          </div>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                "rounded-full px-4 py-2 text-sm font-semibold transition " +
                (pathname === link.href
                  ? "bg-neon-violet/20 text-neon-violet"
                  : "text-soft-gray/70 hover:text-white")
              }
            >
              {link.label}
            </Link>
          ))}
        </div>

        <a
          href="https://github.com/dzakwannajmi/Growthip"
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-midnight-blue transition hover:bg-soft-gray"
        >
          GitHub
        </a>
      </div>
    </nav>
  );
}