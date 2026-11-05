import type { Trade } from "@/db/schema";
import { dayKey, mean, meanCI, sum, weekKey, monthKey, WEEKDAYS, wilson, parseDay } from "./util";

export interface ClosedTrade extends Trade {
  pnl: number;
  r: number;
  day: string;
}

export function closedTrades(trades: Trade[]): ClosedTrade[] {
  return trades
    .filter((t) => t.status === "closed" && t.pnl != null)
    .map((t) => ({
      ...t,
      pnl: t.pnl as number,
      r: t.riskAmount > 0 ? (t.pnl as number) / t.riskAmount : 0,
      day: dayKey(t.closedAt ?? t.openedAt),
    }))
    .sort((a, b) => (a.closedAt ?? a.openedAt).localeCompare(b.closedAt ?? b.openedAt));
}

export interface TradeStats {
  n: number;
  wins: number;
  losses: number;
  winRate: number;
  winRateCI: [number, number];
  avgR: number;
  expectancyCI: [number, number];
  netPnl: number;
  avgWin: number;
  avgLoss: number;
  avgWinR: number;
  avgLossR: number;
  profitFactor: number | null;
  maxDrawdown: number;
  maxDrawdownR: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  currentStreak: { kind: "win" | "loss" | "none"; length: number };
  bestTrade: number;
  worstTrade: number;
}

export function tradeStats(closed: ClosedTrade[]): TradeStats {
  const n = closed.length;
  const winsArr = closed.filter((t) => t.pnl > 0);
  const lossArr = closed.filter((t) => t.pnl < 0);
  const grossWin = sum(winsArr.map((t) => t.pnl));
  const grossLoss = -sum(lossArr.map((t) => t.pnl));
  const rs = closed.map((t) => t.r);

  let peak = 0, eq = 0, maxDD = 0, peakR = 0, eqR = 0, maxDDR = 0;
  let cw = 0, cl = 0, mw = 0, ml = 0;
  for (const t of closed) {
    eq += t.pnl;
    eqR += t.r;
    peak = Math.max(peak, eq);
    peakR = Math.max(peakR, eqR);
    maxDD = Math.max(maxDD, peak - eq);
    maxDDR = Math.max(maxDDR, peakR - eqR);
    if (t.pnl > 0) { cw++; cl = 0; } else if (t.pnl < 0) { cl++; cw = 0; } else { cw = 0; cl = 0; }
    mw = Math.max(mw, cw);
    ml = Math.max(ml, cl);
  }

  return {
    n,
    wins: winsArr.length,
    losses: lossArr.length,
    winRate: n ? winsArr.length / n : 0,
    winRateCI: wilson(winsArr.length, n),
    avgR: mean(rs),
    expectancyCI: meanCI(rs),
    netPnl: sum(closed.map((t) => t.pnl)),
    avgWin: winsArr.length ? grossWin / winsArr.length : 0,
    avgLoss: lossArr.length ? -grossLoss / lossArr.length : 0,
    avgWinR: mean(winsArr.map((t) => t.r)),
    avgLossR: mean(lossArr.map((t) => t.r)),
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? null : 0,
    maxDrawdown: maxDD,
    maxDrawdownR: maxDDR,
    maxConsecWins: mw,
    maxConsecLosses: ml,
    currentStreak: cw > 0 ? { kind: "win", length: cw } : cl > 0 ? { kind: "loss", length: cl } : { kind: "none", length: 0 },
    bestTrade: n ? Math.max(...closed.map((t) => t.pnl)) : 0,
    worstTrade: n ? Math.min(...closed.map((t) => t.pnl)) : 0,
  };
}

export interface GroupRow {
  key: string;
  n: number;
  winRate: number;
  avgR: number;
  ci: [number, number];
  netPnl: number;
  totalR: number;
  /** Expectancy CI excludes zero → the edge (or leak) is unlikely to be noise. */
  significant: boolean;
}

export function groupStats(closed: ClosedTrade[], keyFn: (t: ClosedTrade) => string | null | undefined): GroupRow[] {
  const map = new Map<string, ClosedTrade[]>();
  for (const t of closed) {
    const k = keyFn(t) || "Unlabelled";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(t);
  }
  return [...map.entries()]
    .map(([key, ts]) => {
      const rs = ts.map((t) => t.r);
      const ci = meanCI(rs);
      return {
        key,
        n: ts.length,
        winRate: ts.filter((t) => t.pnl > 0).length / ts.length,
        avgR: mean(rs),
        ci,
        netPnl: sum(ts.map((t) => t.pnl)),
        totalR: sum(rs),
        significant: ts.length >= 10 && (ci[0] > 0 || ci[1] < 0),
      };
    })
    .sort((a, b) => b.totalR - a.totalR);
}

export const byWeekday = (c: ClosedTrade[]) => {
  const rows = groupStats(c, (t) => WEEKDAYS[parseDay(t.day).getDay()]);
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
};

export interface PeriodRow {
  key: string;
  pnl: number;
  r: number;
  n: number;
  wins: number;
}

export function byPeriod(closed: ClosedTrade[], period: "day" | "week" | "month"): PeriodRow[] {
  const fn = period === "day" ? (d: string) => d : period === "week" ? weekKey : monthKey;
  const map = new Map<string, PeriodRow>();
  for (const t of closed) {
    const k = fn(t.day);
    const row = map.get(k) ?? { key: k, pnl: 0, r: 0, n: 0, wins: 0 };
    row.pnl += t.pnl;
    row.r += t.r;
    row.n += 1;
    if (t.pnl > 0) row.wins += 1;
    map.set(k, row);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Risk-normalised equity curve in R plus drawdown series, one point per closed trade. */
export function rCurve(closed: ClosedTrade[]) {
  let eq = 0, peak = 0;
  return closed.map((t, i) => {
    eq += t.r;
    peak = Math.max(peak, eq);
    return { i: i + 1, day: t.day, r: +eq.toFixed(2), dd: +(eq - peak).toFixed(2) };
  });
}

/** R distribution histogram with 0.5R buckets. */
export function rHistogram(closed: ClosedTrade[]) {
  const buckets = new Map<number, number>();
  for (const t of closed) {
    const b = Math.max(-3, Math.min(5, Math.floor(t.r * 2) / 2));
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  const out: { bucket: string; from: number; count: number }[] = [];
  for (let b = -3; b <= 5; b += 0.5) out.push({ bucket: `${b >= 0 ? "+" : ""}${b}R`, from: b, count: buckets.get(b) ?? 0 });
  return out;
}
