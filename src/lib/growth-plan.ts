import { addDays } from "@/lib/engine/util";

/**
 * THE PLAN (user's definitive strategy, Nov 2026) — a deterministic capital-growth
 * ladder, not a simulation. Every surface that shows "the plan" reads from here so
 * the numbers never drift between pages.
 *
 * 1. Pass the $6K challenge (both steps).
 * 2. Take 5 weekly payouts of $300 — each goes 100% into the personal live account.
 * 3. Grow the live account ≥60% every week (deposit, then grow): end = (prev + $300) × 1.6.
 *    → $480 → $1,248 → $2,477 → $4,443 → $7,589 by week 5.
 * 4. On Dec 29: from the live account, pay $5,000 to clear the debt, and use the rest
 *    to buy a $50K challenge + keep trading capital in the real account.
 * 5. Pass the $50K (Phase 1: 2 weeks, Phase 2: 2 weeks). One week after funding, move
 *    $1,000/week into the live account and keep the same 60% weekly growth.
 * 6. One cushion week per month where losses are expected — the plan survives them.
 */
export const PLAN = {
  deadline: "2026-12-29",
  weeklyPayout: 300,
  payoutCount: 5,
  weeklyGrowthPct: 60,
  debtPayoff: 5000,
  fiftyKFee: 240,
  scaleTransfer: 1000, // $/week into live account once $50K is funded
  fiftyKPhaseWeeks: 2, // each phase
  cushionWeeksPerMonth: 1,
} as const;

export type GrowthWeek = {
  n: number;
  label: string;
  date: string;
  deposit: number;
  afterDeposit: number;
  end: number;
  growth: number;
  cushion: boolean;
};

/** Deposit-then-grow weekly schedule for the live account. */
export function liveSchedule(
  startDate: string,
  opts?: { payout?: number; count?: number; growthPct?: number; startBalance?: number },
): GrowthWeek[] {
  const payout = opts?.payout ?? PLAN.weeklyPayout;
  const count = opts?.count ?? PLAN.payoutCount;
  const g = (opts?.growthPct ?? PLAN.weeklyGrowthPct) / 100;
  const weeks: GrowthWeek[] = [];
  let bal = opts?.startBalance ?? 0;
  for (let i = 1; i <= count; i++) {
    const afterDeposit = bal + payout;
    const end = afterDeposit * (1 + g);
    weeks.push({
      n: i,
      label: `Week ${i}`,
      date: addDays(startDate, (i - 1) * 7),
      deposit: payout,
      afterDeposit,
      end,
      growth: end - afterDeposit,
      cushion: i % 4 === 0, // one week a month is a cushion week
    });
    bal = end;
  }
  return weeks;
}

/** Projected live-account balance after the full payout schedule. */
export function liveTarget(opts?: Parameters<typeof liveSchedule>[1]): number {
  const w = liveSchedule(PLAN.deadline, opts);
  return w[w.length - 1]?.end ?? 0;
}

/** Chart series {name, v} for the live-account build, starting at $0. */
export function liveGrowthChart(startDate: string): { name: string; v: number }[] {
  const pts = [{ name: "Start", v: 0 }];
  for (const w of liveSchedule(startDate)) {
    pts.push({ name: w.label.replace("Week ", "W"), v: Math.round(w.end) });
  }
  return pts;
}

export const usd0 = (n: number) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
