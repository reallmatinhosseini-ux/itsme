import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/shell";
import { loadMission } from "@/lib/data";
import { compactUsd } from "@/lib/format";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument" });

export const metadata: Metadata = {
  title: "Mission Control",
  description: "Personal trading & wealth operating system for the six-month $50K challenge.",
  appleWebApp: { capable: true, title: "Mission", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#060608",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeInit = `try{var t=localStorage.getItem('theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}`;

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const m = loadMission();
  const summary = {
    goalPct: m.clock.goalPct,
    timePct: m.clock.timePct,
    wealth: compactUsd(m.wealth.realizedNetWealth),
    target: compactUsd(m.settings.targetAmount),
    alerts: m.alerts.filter((a) => a.level !== "info").length,
    critical: m.alerts.filter((a) => a.level === "critical").length,
    dayN: Math.min(m.clock.totalDays, Math.max(0, m.clock.elapsedDays)),
    totalDays: m.clock.totalDays,
    stage: m.roadmap.current.title,
  };
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body className="font-sans">
        <Shell summary={summary}>{children}</Shell>
      </body>
    </html>
  );
}
