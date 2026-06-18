import type { Metadata } from "next";
import "./globals.css";

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
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
