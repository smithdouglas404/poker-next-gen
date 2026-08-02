import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/features/nav/SiteFooter";
import { AppShell } from "@/features/nav/AppShell";
import { AgeGate } from "@/features/nav/AgeGate";
import { Providers } from "./providers";

// Premium typography: Playfair Display for display/headings (editorial, luxury),
// Inter for body (clean, readable, modern).
const displayFont = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  style: ["normal", "italic"],
});

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "High Rollers Club — Premium Poker Network",
  description:
    "The premier private poker network: clubs, cash games, tournaments, and the live table. Provably fair. GTO verified.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable} antialiased`}>
        <Providers>
          <AppShell>{children}</AppShell>
          <SiteFooter />
          <AgeGate />
        </Providers>
      </body>
    </html>
  );
}
