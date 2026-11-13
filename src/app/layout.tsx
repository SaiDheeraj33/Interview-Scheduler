import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Toaster } from "@/components/client";
import "./globals.css";

// Playfair for the few large moments (page titles, results); Inter for everything read at speed.
const heading = Playfair_Display({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-heading", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: { default: "GRIT Interviews", template: "%s · GRIT Interviews" },
  description: "Book, run and track Level Clearance Interviews for GRIT Track Badges.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f6f3" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-card">
          Skip to content
        </a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
