import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

// Inter for every word and Geist Mono for eyebrows, code and ids (docs/brand.md), served from our own origin and
// preloaded (next/font), so no page waits on Google's stylesheet. The fonts keep their names, so every stylesheet
// that says "Inter" or "Geist Mono" (globals.css, the booking and form looks) gets them.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-inter" });
const mono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", variable: "--font-geist-mono", preload: false });

export const metadata: Metadata = {
  title: "Claritia",
  description: "Tests that write and fix themselves. Describe a user flow in plain English and Claritia turns it into a Playwright test.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full ${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="grain min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
