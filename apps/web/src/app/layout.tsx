import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Growthip — Private Creator Tipping on Stellar",
  description:
    "Growthip is a privacy-preserving creator tipping prototype built with Stellar Soroban, Groth16, BN254, and Merkle proofs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={plusJakartaSans.variable + " font-sans"} suppressHydrationWarning>
        {/* Init theme before React hydration to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: "/* dark mode temporarily disabled for launch stability */" }} />
        {children}
      </body>
    </html>
  );
}
