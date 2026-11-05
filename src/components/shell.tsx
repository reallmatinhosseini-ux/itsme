"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Map, Sun, NotebookPen, Trophy, Wallet, ShieldAlert, HandCoins, LineChart, BarChart3, Sparkles, CalendarCheck2, Settings2, Menu, X, Target, Banknote, Route, LayoutDashboard, TrendingUp,
} from "lucide-react";
import { cx } from "./ui";
import { ThemeToggle } from "./theme-toggle";

const GROUPS = [
  {
    label: "",
    items: [
      { href: "/", label: "Home", icon: LayoutDashboard },
      { href: "/tracker", label: "Daily", icon: CalendarCheck2 },
      { href: "/debt", label: "Debt", icon: Banknote },
      { href: "/challenges", label: "Challenge", icon: Trophy },
      { href: "/plan", label: "Plan", icon: Route },
    ],
  },
  {
    label: "More",
    items: [
      { href: "/live", label: "Live account", icon: TrendingUp },
      { href: "/payouts", label: "Payouts", icon: HandCoins },
      { href: "/accounts", label: "Accounts", icon: Wallet },
    ],
  },
];

const TABS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/tracker", label: "Daily", icon: CalendarCheck2 },
  { href: "/debt", label: "Debt", icon: Banknote },
  { href: "/challenges", label: "Challenge", icon: Trophy },
];

export interface ShellSummary {
  goalPct: number;
  timePct: number;
  wealth: string;
  target: string;
  alerts: number;
  critical: number;
  dayN: number;
  totalDays: number;
  stage: string;
}

export function Shell({ children, summary }: { children: ReactNode; summary: ShellSummary }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  if (path === "/login") return <>{children}</>;
  const bare = path === "/setup";
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

  const nav = (
    <nav className="flex flex-col gap-5">
      {GROUPS.map((g) => (
        <div key={g.label}>
          {g.label && <div className="eyebrow mb-1.5 px-2.5">{g.label}</div>}
          <div className="flex flex-col gap-0.5">
            {g.items.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cx(
                  "group relative flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] font-medium transition-colors",
                  active(href) ? "bg-ink/[0.08] text-ink shadow-[0_0_0_1px_rgb(255_255_255/0.1)]" : "text-ink-2 hover:bg-ink/[0.06] hover:text-ink",
                )}
              >
                <Icon className={cx("size-[17px] shrink-0", active(href) ? "text-ink" : "text-ink-3 group-hover:text-ink-2")} strokeWidth={1.8} />
                <span className="truncate">{label}</span>
                {href === "/risk" && summary.alerts > 0 && (
                  <span className={cx("ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-semibold text-fill-fg num", summary.critical ? "bg-crit" : "bg-ink-3")}>{summary.alerts}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-2">
        <Link href="/settings" className={cx("flex h-9 flex-1 items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] font-medium", active("/settings") ? "bg-ink/[0.08] text-ink" : "text-ink-2 hover:bg-ink/[0.06]")}>
          <Settings2 className="size-[17px] text-ink-3" strokeWidth={1.8} /> Settings
        </Link>
        <ThemeToggle />
      </div>
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2.5 px-2.5">
      <div className="grid size-8 place-items-center rounded-[10px] bg-fill text-fill-fg shadow-[0_4px_12px_-4px_rgb(0_0_0/0.4)]">
        <span className="text-[11px] font-bold tracking-tight num">50K</span>
      </div>
      <div className="leading-tight">
        <div className="text-[13.5px] font-semibold tracking-[-0.01em]">Mission Control</div>
        <div className="text-[11.5px] text-ink-3 num">Day {summary.dayN} of {summary.totalDays}</div>
      </div>
    </Link>
  );

  const progress = (
    <Link href="/" className="glass mx-1 block p-3.5">
      <div className="eyebrow">Net worth</div>
      <div className="mt-1 text-[17px] font-semibold tracking-[-0.02em] num">
        {summary.wealth} <span className="text-[12px] font-normal text-ink-3">/ {summary.target}</span>
      </div>
      <div className="mt-0.5 truncate text-[11.5px] text-ink-3">Now: {summary.stage}</div>
      <div className="mt-3 space-y-2">
        <MiniBar label="Goal" value={summary.goalPct} tone="bg-fill" />
        <MiniBar label="Time" value={summary.timePct} tone="bg-ink-3" />
      </div>
    </Link>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {!bare && (
        <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-6 border-r border-white/[0.1] bg-ink/[0.04] px-3 py-5 backdrop-blur-xl lg:flex">
          {brand}
          <div className="flex-1 overflow-y-auto">{nav}</div>
          {progress}
        </aside>
      )}

      {!bare && (
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/[0.1] bg-fill px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden" style={{ height: "calc(56px + env(safe-area-inset-top))" }}>
          {brand}
          <button onClick={() => setOpen((o) => !o)} className="grid size-10 place-items-center rounded-[10px] hover:bg-ink/5" aria-label="Menu">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      )}
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-20 overflow-y-auto bg-canvas/95 px-3 py-4 backdrop-blur-xl lg:hidden" style={{ top: "calc(56px + env(safe-area-inset-top))" }}>
          {nav}
          <div className="mt-4">{progress}</div>
        </div>
      )}

      <main className={cx("min-w-0 flex-1 px-4 pt-6 sm:px-6 lg:px-10 lg:pt-9", bare ? "pb-10" : "pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-16")}>
        <div className="mx-auto max-w-[1320px]">{children}</div>
      </main>

      {!bare && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.1] bg-ink/10 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl lg:hidden" aria-label="Quick">
          <div className="mx-auto grid max-w-md grid-cols-4">
            {TABS.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={cx("relative flex h-[60px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium", active(href) ? "text-ink" : "text-ink-3")}>
                <Icon className="size-[22px]" strokeWidth={active(href) ? 2.1 : 1.7} />
                {label}
                {href === "/today" && summary.critical > 0 && <span className="absolute top-2.5 right-[calc(50%-16px)] size-2 rounded-full bg-crit" />}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

function MiniBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-ink-3">
      <span className="w-8">{label}</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/85">
        <div className={cx("h-full rounded-full", tone)} style={{ width: `${Math.max(1, Math.min(100, value))}%` }} />
      </div>
      <span className="w-9 text-right num">{value.toFixed(value < 10 ? 1 : 0)}%</span>
    </div>
  );
}
