import type { Settings } from "../settings";
import type { AccountState } from "./accounts";
import { makeDraw, type Sampler } from "./simulate";
import { addDays, isWeekday, mulberry32, poisson, quantile } from "./util";

/**
 * The coach. Your 2.5% is a ceiling, not a default: every trade is sized by a ladder
 * that starts small, grows only with profit already banked in the account ("house money"),
 * shrinks in drawdown and after losing streaks, and never risks more than the account
 * can survive. The same ladder runs inside the simulation, so the odds it shows are the
 * odds of following this exact plan.
 */

export interface LadderInput {
  size: number;
  /** P/L in the current stage (or payout cycle when funded). */
  profit: number;
  funded: boolean;
  /** Profit target in $ (evaluations), or null. */
  target: number | null;
  /** Distance in $ from the current balance down to the max-loss floor. */
  floorRoom: number;
  /** Loss room left today in $ (own stop and the firm's limit, whichever is tighter). */
  dayRoom: number;
  streak: number;
  /** Quarter-Kelly ceiling in % from your own trades, or null with too little data. */
  kellyPct: number | null;
  openRisk?: number;
  maxOpenRiskPct?: number;
}

export interface LadderStep {
  label: string;
  amount: number;
}

export interface Ladder {
  amount: number;
  steps: LadderStep[];
  blocked: boolean;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function ladder(x: LadderInput, settings: Settings): Ladder {
  const R = settings.risk;
  const cap = (x.size * R.maxRiskPerTradePct) / 100;
  const floor = (x.size * R.minRiskPct) / 100;
  const steps: LadderStep[] = [];
  if (x.dayRoom <= 0.5) return { amount: 0, steps: [{ label: "Daily stop reached — done for today", amount: 0 }], blocked: true };

  // 1. Starting size depends on what's at stake.
  const startPct = x.funded ? R.fundedRiskPct : R.baseRiskPct;
  let amt = (x.size * startPct) / 100;
  steps.push({ label: x.funded ? `Funded account: start at ${startPct}% to protect the payout` : `Evaluation: start at ${startPct}%`, amount: amt });

  // 2. Grow only with banked profit (house money); shrink in drawdown.
  if (x.profit > 0) {
    const add = (x.profit * R.cushionSharePct) / 100;
    amt += add;
    steps.push({ label: `+${R.cushionSharePct}% of your ${usd(x.profit)} profit cushion`, amount: amt });
  } else if (x.profit < 0) {
    const allowance = Math.max(1, x.floorRoom - x.profit); // total room at stage start
    const scale = Math.max(0.5, 1 + x.profit / allowance);
    amt *= scale;
    steps.push({ label: `In drawdown (${usd(x.profit)}): size reduced to ${Math.round(scale * 100)}%`, amount: amt });
  }

  // 3. Losing streak.
  if (x.streak >= R.maxConsecutiveLosses) {
    amt *= 0.5;
    steps.push({ label: `${x.streak} losses in a row: half size until a win`, amount: amt });
  }

  // 4. Your measured edge (after enough trades) sets a hard ceiling.
  if (x.kellyPct != null) {
    const k = (x.size * Math.max(R.minRiskPct, x.kellyPct)) / 100;
    if (k < amt) {
      amt = k;
      steps.push({ label: x.kellyPct <= R.minRiskPct ? "Your trades show no edge yet: minimum size" : `Your edge supports at most ${x.kellyPct.toFixed(2)}% (quarter-Kelly)`, amount: amt });
    }
  }

  // 5. Close to the target: a small win finishes the phase.
  if (x.target != null) {
    const left = x.target - x.profit;
    if (left > 0 && left < amt * 2) {
      amt = Math.max(left / 2, floor);
      steps.push({ label: `Only ${usd(left)} to the target: a 2R win at this size finishes it`, amount: amt });
    }
  }

  // 6. Hard limits.
  const limit = (v: number, why: string) => {
    if (v < amt) {
      amt = v;
      steps.push({ label: why, amount: amt });
    }
  };
  limit(cap, `Your ceiling: ${R.maxRiskPerTradePct}% (${usd(cap)})`);
  limit(x.floorRoom / 4, `Survive 4 more losses before the max-loss floor (${usd(x.floorRoom)} room)`);
  limit(x.dayRoom, `Today's loss room: ${usd(x.dayRoom)}`);
  if (x.funded && x.maxOpenRiskPct != null) limit((x.size * x.maxOpenRiskPct) / 100 - (x.openRisk ?? 0), `Funded open-risk cap ${x.maxOpenRiskPct}%`);
  if (amt < floor && x.dayRoom >= floor && x.floorRoom / 4 >= floor) {
    amt = floor;
    steps.push({ label: `Never below the ${R.minRiskPct}% minimum`, amount: amt });
  }
  return { amount: Math.max(0, Math.floor(amt)), steps, blocked: amt < 1 };
}

/** Quarter-Kelly from your own trades: f = p − (1−p)/b, b = avg win / avg loss in R. */
export function kellyPct(winRate: number, avgWinR: number, avgLossR: number, n: number, minTrades: number): number | null {
  if (n < minTrades || avgLossR === 0) return null;
  const b = avgWinR / Math.abs(avgLossR);
  const f = winRate - (1 - winRate) / b;
  return Math.max(0, (f * 100) / 4);
}

export interface SmartSize {
  amount: number;
  pct: number;
  max: number;
  maxPct: number;
  reasons: string[];
  steps: LadderStep[];
  blocked: boolean;
}

interface SizeContext {
  settings: Settings;
  consecutiveLosses: number;
  kelly: number | null;
}

export function smartSize(s: AccountState, { settings, consecutiveLosses, kelly }: SizeContext): SmartSize {
  const R = settings.risk;
  const size = s.isProp ? s.account.size : Math.max(1, s.peakBalance);
  const ownStop = (size * R.maxDailyLossPct) / 100;
  const firmRoom = s.dailyLossLimit + Math.min(0, s.todayPnl);
  const dayRoom = Math.min(ownStop + Math.min(0, s.todayPnl), firmRoom * 0.9);
  const funded = s.isProp && s.account.stage === "funded";
  const l = ladder(
    {
      size,
      profit: funded ? s.payout?.cycleProfit ?? 0 : s.profit,
      funded,
      target: s.targetPct != null ? (s.account.size * s.targetPct) / 100 : null,
      floorRoom: s.balance - s.maxLossFloor,
      dayRoom,
      streak: consecutiveLosses,
      kellyPct: kelly,
      openRisk: s.openRisk,
      maxOpenRiskPct: s.isProp ? s.account.maxOpenRiskPct : undefined,
    },
    settings,
  );
  const max = (size * R.maxRiskPerTradePct) / 100;
  return { amount: l.amount, pct: (l.amount / size) * 100, max, maxPct: R.maxRiskPerTradePct, reasons: l.steps.map((x) => x.label).reverse(), steps: l.steps, blocked: l.blocked };
}

export interface PhaseOdds {
  pPass: number;
  pFail: number;
  medianTradingDays: number | null;
  eta: string | null;
}

export type SizingMode = "smart" | "max" | { flatPct: number };

/** Monte Carlo from the account's current position to pass or fail the phase it is in. */
export function phaseOdds(
  s: AccountState,
  settings: Settings,
  sampler: Sampler,
  tradesPerDay: number,
  mode: SizingMode,
  today: string,
  kelly: number | null = null,
  paths = 700,
  seed = 7,
): PhaseOdds | null {
  if (!s.isProp || s.targetPct == null || s.account.stage === "failed") return null;
  const rng = mulberry32(seed);
  const draw = makeDraw(sampler, rng);
  const size = s.account.size;
  const target = (size * s.targetPct) / 100;
  const floor = s.maxLossFloor - size;
  const firmDaily = (size * s.account.dailyLossPct) / 100;
  const ownStop = (size * settings.risk.maxDailyLossPct) / 100;
  const flat = mode === "smart" ? null : mode === "max" ? (size * settings.risk.maxRiskPerTradePct) / 100 : (size * mode.flatPct) / 100;
  let pass = 0, fail = 0;
  const days: number[] = [];

  for (let p = 0; p < paths; p++) {
    let pnl = s.profit;
    let traded = s.tradingDays;
    let streak = 0;
    let d = 0;
    let outcome: "pass" | "fail" | null = null;
    while (d < 250 && !outcome) {
      d++;
      if (pnl >= target) {
        traded++;
        if (traded >= s.account.minTradingDays) outcome = "pass";
        continue;
      }
      const k = Math.min(settings.risk.maxTradesPerDay, poisson(rng, tradesPerDay));
      if (k === 0) continue;
      traded++;
      let day = 0;
      for (let j = 0; j < k; j++) {
        const dayRoom = Math.min(ownStop + Math.min(0, day), (firmDaily + Math.min(0, day)) * 0.9);
        const risk = flat ?? ladder({ size, profit: pnl + day, funded: false, target, floorRoom: pnl + day - floor, dayRoom, streak, kellyPct: kelly }, settings).amount;
        if (risk <= 0) break;
        const r = draw();
        day += r * risk;
        streak = r < 0 ? streak + 1 : 0;
        if (day <= -firmDaily || pnl + day <= floor) {
          outcome = "fail";
          break;
        }
        if (day <= -ownStop || pnl + day >= target) break;
      }
      if (outcome) break;
      pnl += day;
      if (pnl >= target && traded >= s.account.minTradingDays) outcome = "pass";
    }
    if (outcome === "pass") {
      pass++;
      days.push(d);
    } else if (outcome === "fail") fail++;
  }
  const med = days.length ? Math.round(quantile(days.sort((a, b) => a - b), 0.5)) : null;
  return { pPass: pass / paths, pFail: fail / paths, medianTradingDays: med, eta: med != null ? addTradingDays(today, med) : null };
}

function addTradingDays(from: string, n: number): string {
  let d = from;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isWeekday(d)) left--;
  }
  return d;
}
