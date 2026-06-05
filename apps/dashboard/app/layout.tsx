import type { Metadata } from "next";
import type { ReactNode } from "react";
import { JetBrains_Mono, VT323 } from "next/font/google";

import { TopNav } from "@/components/TopNav";
import "./globals.css";

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const vt323 = VT323({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "yardstick // eval dashboard",
  description: "Claude-native LLM evaluation & observability harness",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${jetbrains.variable} ${vt323.variable}`}>
      <body className="crt-overlay min-h-screen bg-background text-foreground antialiased">
        <TopNav />
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
