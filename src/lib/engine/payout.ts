import { makeDraw, type Sampler } from "./simulate";
import { mulberry32, poisson, quantile } from "./util";

export interface PayoutScenario {
  triggerPct: number;
  gross: number;
  share: number;
  withRefund: number;
  pReach: number;
  medianDays: number | null;
  /** Expected trader cash per 30 trading days if this trigger is used repeatedly. */
  evPer30: number;
}

/**
 * For a funded account, estimate for each payout trigger the probability of reaching it
 * before the max-loss floor (or a daily-loss breach), and how long it takes — from the
 * same trade distribution used everywhere else. The recommendation maximises expected
 * cash per unit time, with ties broken toward the smaller (safer) trigger.
 */
export function payoutScenarios(opts: {
  size: number;
  currentPnl: number;
  splitPct: number;
  refund: number;
  minGrowthPct: number;
  maxLossPct: number;
  dailyLossPct: number;
  riskPct: number;
  tradesPerDay: number;
  sampler: Sampler;
  triggers?: number[];
  paths?: number;
  seed?: number;
}): { rows: PayoutScenario[]; recommended: number | null } {
  const triggers = (opts.triggers ?? [2, 3, 4, 5, 6, 8]).filter((t) => t >= opts.minGrowthPct);
  const paths = opts.paths ?? 800;
  const rows: PayoutScenario[] = [];
  for (const trig of triggers) {
    const rng = mulberry32((opts.seed ?? 1) + trig * 101);
    const draw = makeDraw(opts.sampler, rng);
    const target = (opts.size * trig) / 100;
    const floor = -(opts.size * opts.maxLossPct) / 100;
    const dailyLimit = (opts.size * opts.dailyLossPct) / 100;
    const riskAmt = (opts.size * opts.riskPct) / 100;
    let hits = 0;
    const days: number[] = [];
    for (let p = 0; p < paths; p++) {
      let pnl = opts.currentPnl;
      let d = 0;
      let done = pnl >= target;
      while (!done && d < 250) {
        d++;
        const k = poisson(rng, opts.tradesPerDay);
        let day = 0;
        for (let j = 0; j < k; j++) {
          day += draw() * riskAmt;
          if (day <= -dailyLimit || pnl + day <= floor) {
            day = -Infinity;
            break;
          }
        }
        if (day === -Infinity) break;
        pnl += day;
        if (pnl >= target) done = true;
      }
      if (done) {
        hits++;
        days.push(d);
      }
    }
    const pReach = hits / paths;
    const medianDays = days.length ? quantile(days.sort((a, b) => a - b), 0.5) : null;
    const share = target * (opts.splitPct / 100);
    rows.push({
      triggerPct: trig,
      gross: target,
      share,
      withRefund: share + opts.refund,
      pReach,
      medianDays,
      evPer30: medianDays ? (pReach * share * 30) / Math.max(1, medianDays) : 0,
    });
  }
  const best = [...rows].filter((r) => r.pReach >= 0.5).sort((a, b) => b.evPer30 - a.evPer30 || a.triggerPct - b.triggerPct)[0];
  return { rows, recommended: best?.triggerPct ?? null };
}
