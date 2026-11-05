/**
 * Monte Carlo model of the whole mission — not just trade returns.
 *
 * Each path walks day by day through: evaluation phases with the firm's real rules
 * (daily loss, max loss, profit target, minimum days), activation/KYC delay, funded trading,
 * payout eligibility (min growth, best-day cap), payout processing delay, allocation of
 * received cash into a personal account, and the purchase of further challenges under the
 * scaling policy. Evaluation pass rates are therefore an OUTPUT of your trade distribution
 * and risk settings, never a guessed input.
 *
 * Accounts that trade on the same day share trade outcomes with probability `correlation`,
 * so two accounts are not treated as two independent bets.
 */
import type { Template } from "../settings";
import { mulberry32, poisson, quantile, wilson, mean, parseDay } from "./util";
import type { Settings } from "../settings";
import { ladder } from "./coach";

export interface RuleSet {
  size: number;
  price: number;
  profitTargetP1: number;
  profitTargetP2: number;
  dailyLossPct: number;
  maxLossPct: number;
  minTradingDays: number;
  splitPct: number;
  payoutMinGrowthPct: number;
  bestDayCapPct: number;
  feeRefundOnFirstPayout: boolean;
}

export interface SimAccountInit extends RuleSet {
  stage: "phase1" | "phase2" | "funded";
  /** Balance minus size, i.e. P/L in the current stage (or payout cycle when funded). */
  pnl: number;
  tradingDays: number;
  bestDay: number;
  firstPayoutDone: boolean;
  /** Day index (from today) when the account may trade. */
  activeFrom: number;
}

export type Sampler =
  | { kind: "parametric"; winRate: number; avgWinR: number; avgLossR: number; costR: number }
  | { kind: "bootstrap"; rs: number[] };

export interface SimInput {
  startDay: string; // "today" of the simulation
  horizonDays: number;
  target: number;
  cash: number;
  personalEquity: number;
  accounts: SimAccountInit[];
  pendingPayouts: { inDays: number; amount: number }[];
  /** Outstanding debts. Payouts pay these first; their cash is never spent on challenges. */
  debts?: { amount: number; dueDay: number }[];
  sampler: Sampler;
  tradesPerDay: number;
  maxTradesPerDay: number;
  riskPct: number;
  personalRiskPct: number;
  personalDailyStopPct: number;
  correlation: number;
  activationDelayDays: number;
  payoutDelayDays: number;
  policy: {
    payoutTriggerPct: number;
    maxConcurrentProp: number;
    feeBudgetPct: number;
    reserveFloor: number;
    personalPct: number;
    maxFundedAllocation: number;
    /** Only buy new challenges with payout money (after at least one payout), except to restart after total loss. */
    requirePayoutBeforeScaling: boolean;
  };
  templates: Template[];
  paths: number;
  seed: number;
  /** When set, prop trades are sized by the coach's ladder (riskPct is then ignored for prop accounts). */
  ladder?: Settings;
  stress?: {
    failFirstChallenge?: boolean;
    extraPayoutDelayDays?: number;
    /** Force every trade to lose for N weeks starting at a given day. */
    losingWeeks?: { fromDay: number; weeks: number };
    winRateDelta?: number;
  };
}

export interface SimResult {
  paths: number;
  probability: number;
  probabilityCI: [number, number];
  final: { p5: number; p25: number; p50: number; p75: number; p95: number; mean: number };
  histogram: { from: number; to: number; count: number; hit: boolean }[];
  fan: { day: number; date: string; p10: number; p25: number; p50: number; p75: number; p90: number }[];
  evalPassRate: number | null;
  evalAttemptsMean: number;
  challengesFailedMean: number;
  feesMedian: number;
  payoutsMedian: number;
  medianDaysToFunded: number | null;
  medianDaysToFirstPayout: number | null;
  medianDaysToTarget: number | null;
  ruinProbability: number;
  expectancyR: number;
  /** Share of paths where every debt was covered (paid, or payable from cash) on its due date. */
  debtCoverProbability: number | null;
}

interface LiveAcc extends RuleSet {
  stage: "phase1" | "phase2" | "funded" | "failed";
  pnl: number;
  tradingDays: number;
  bestDay: number;
  firstPayoutDone: boolean;
  activeFrom: number;
  isSeed: boolean;
  streak?: number;
}

export function makeDraw(sampler: Sampler, rng: () => number, winRateDelta = 0): () => number {
  if (sampler.kind === "parametric") {
    const p = Math.min(0.95, Math.max(0.02, sampler.winRate + winRateDelta));
    return () => {
      const win = rng() < p;
      // Winners vary around their mean (uniform 0.5x–1.5x); losers are a full stop.
      const r = win ? sampler.avgWinR * (0.5 + rng()) : -sampler.avgLossR;
      return r - sampler.costR;
    };
  }
  const rs = sampler.rs;
  const avgLoss = Math.abs(mean(rs.filter((r) => r < 0))) || 1;
  const wr = rs.filter((r) => r > 0).length / rs.length;
  const flip = winRateDelta < 0 && wr > 0 ? Math.min(1, -winRateDelta / wr) : 0;
  return () => {
    const r = rs[Math.floor(rng() * rs.length)];
    if (flip && r > 0 && rng() < flip) return -avgLoss;
    return r;
  };
}

export function expectancyOf(sampler: Sampler): number {
  if (sampler.kind === "parametric") return sampler.winRate * sampler.avgWinR - (1 - sampler.winRate) * sampler.avgLossR - sampler.costR;
  return mean(sampler.rs);
}

export function simulate(input: SimInput): SimResult {
  const rng = mulberry32(input.seed);
  const H = input.horizonDays;
  const startDow = parseDay(input.startDay).getDay();
  const isTradingDay = (d: number) => {
    const dow = (startDow + d) % 7;
    return dow !== 0 && dow !== 6;
  };
  const stress = input.stress ?? {};
  const weekly = Math.ceil(H / 7) + 1;
  const fanSamples: number[][] = Array.from({ length: weekly }, () => []);
  const finals: number[] = [];
  let hits = 0, ruins = 0, evalPassed = 0, evalEnded = 0, debtCovered = 0;
  const debts0 = [...(input.debts ?? [])].filter((x) => x.amount > 0).sort((a, b) => a.dueDay - b.dueDay);
  const attempts: number[] = [], fails: number[] = [], fees: number[] = [], pays: number[] = [];
  const toFunded: number[] = [], toPayout: number[] = [], toTarget: number[] = [];

  for (let path = 0; path < input.paths; path++) {
    // Parameter uncertainty: each bootstrap path draws its own "true" distribution from the sample.
    let sampler = input.sampler;
    if (sampler.kind === "bootstrap") {
      const src = sampler.rs;
      sampler = { kind: "bootstrap", rs: src.map(() => src[Math.floor(rng() * src.length)]) };
    }
    const draw = makeDraw(sampler, rng, stress.winRateDelta ?? 0);

    let cash = input.cash;
    let personal = input.personalEquity;
    let personalPeak = personal;
    const accs: LiveAcc[] = input.accounts.map((a) => ({ ...a, isSeed: true }));
    const pending = input.pendingPayouts.map((p) => ({ day: p.inDays + (stress.extraPayoutDelayDays ?? 0), amount: p.amount }));
    let payoutCount = input.pendingPayouts.length;
    let bought = 0, failed = 0, feeSpent = 0, paid = 0;
    let fundedDay: number | null = null, payoutDay: number | null = null, targetDay: number | null = null;
    let firstFailed = !stress.failFirstChallenge;
    const debts = debts0.map((x) => ({ ...x }));
    let coveredAll = true;
    const owed = () => debts.reduce((a, x) => a + x.amount, 0);

    for (let d = 0; d < H; d++) {
      // 1. Payout cash arrives → allocate to personal account per policy.
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].day <= d) {
          let amt = pending[i].amount;
          paid += amt;
          payoutDay ??= d;
          // Debt first: payout money goes to outstanding debt before anything else.
          for (const debt of debts) {
            const pay = Math.min(debt.amount, amt);
            debt.amount -= pay;
            amt -= pay;
          }
          const toPersonal = owed() > 0 ? 0 : (amt * input.policy.personalPct) / 100;
          cash += amt - toPersonal;
          personal += toPersonal;
          personalPeak = Math.max(personalPeak, personal);
          pending.splice(i, 1);
        }
      }

      // 2. Scaling policy: buy the largest challenge the fee budget allows.
      const active = accs.filter((a) => a.stage !== "failed");
      const nominal = active.reduce((s, a) => s + a.size, 0);
      const mayBuy = !input.policy.requirePayoutBeforeScaling || payoutCount > 0 || active.length === 0;
      if (active.length < input.policy.maxConcurrentProp && mayBuy && isTradingDay(d)) {
        const budget = ((cash - owed() - input.policy.reserveFloor) * input.policy.feeBudgetPct) / 100;
        const pick = [...input.templates]
          .filter((t) => t.price <= budget && nominal + t.size <= input.policy.maxFundedAllocation)
          .sort((a, b) => b.size - a.size)[0];
        if (pick) {
          cash -= pick.price;
          feeSpent += pick.price;
          bought++;
          accs.push({ ...pick, stage: "phase1", pnl: 0, tradingDays: 0, bestDay: 0, firstPayoutDone: false, activeFrom: d + 1, isSeed: false });
        }
      }

      // 3. Trading.
      if (isTradingDay(d)) {
        const losing = stress.losingWeeks && d >= stress.losingWeeks.fromDay && d < stress.losingWeeks.fromDay + stress.losingWeeks.weeks * 7;
        const k = Math.min(input.maxTradesPerDay, poisson(rng, input.tradesPerDay));
        const shared: number[] = [];
        for (let j = 0; j < k; j++) shared.push(losing ? -1 : draw());
        const outcome = (j: number) => (losing ? -1 : rng() < input.correlation ? shared[j] : draw());

        for (const a of accs) {
          if (a.stage === "failed" || a.activeFrom > d) continue;
          const isEval = a.stage !== "funded";
          const target = a.stage === "phase1" ? a.profitTargetP1 : a.profitTargetP2;
          const reached = isEval && (a.pnl / a.size) * 100 >= target;
          if (k === 0 && !reached) continue;
          a.tradingDays++;
          if (reached) {
            // Target hit early: minimum-days requirement filled with token trades.
          } else {
            const dailyLimit = (a.size * a.dailyLossPct) / 100;
            const personalStop = (a.size * input.personalDailyStopPct) / 100;
            const floor = -(a.size * a.maxLossPct) / 100;
            let day = 0;
            for (let j = 0; j < k; j++) {
              const riskAmt = input.ladder
                ? ladder(
                    {
                      size: a.size, profit: a.pnl + day, funded: !isEval, target: isEval ? (a.size * target) / 100 : null,
                      floorRoom: a.pnl + day - floor, dayRoom: Math.min(personalStop + Math.min(0, day), (dailyLimit + Math.min(0, day)) * 0.9),
                      streak: a.streak ?? 0, kellyPct: null, maxOpenRiskPct: 3,
                    },
                    input.ladder,
                  ).amount
                : (a.size * input.riskPct) / 100;
              if (riskAmt <= 0) break;
              const r = outcome(j);
              a.streak = r < 0 ? (a.streak ?? 0) + 1 : 0;
              day += r * riskAmt;
              if (day <= -dailyLimit || a.pnl + day <= floor) {
                a.stage = "failed";
                break;
              }
              if (day <= -personalStop) break; // trader's own daily stop
            }
            if (!firstFailed && isEval) {
              a.stage = "failed";
              firstFailed = true;
            }
            if (a.stage === "failed") {
              failed++;
              if (isEval) evalEnded++;
              continue;
            }
            a.pnl += day;
            if (!isEval) a.bestDay = Math.max(a.bestDay, day);
          }
          if (isEval && (a.pnl / a.size) * 100 >= target && a.tradingDays >= a.minTradingDays) {
            if (a.stage === "phase1") {
              a.stage = "phase2";
              a.activeFrom = d + 1;
            } else {
              a.stage = "funded";
              a.activeFrom = d + 1 + input.activationDelayDays;
              evalPassed++;
              evalEnded++;
              fundedDay ??= d;
            }
            a.pnl = 0;
            a.tradingDays = 0;
            a.bestDay = 0;
          } else if (a.stage === "funded") {
            const growth = (a.pnl / a.size) * 100;
            if (growth >= Math.max(input.policy.payoutTriggerPct, a.payoutMinGrowthPct) && a.bestDay <= (a.bestDayCapPct / 100) * a.pnl) {
              const refund = !a.firstPayoutDone && a.feeRefundOnFirstPayout ? a.price : 0;
              pending.push({ day: d + input.payoutDelayDays + (stress.extraPayoutDelayDays ?? 0), amount: a.pnl * (a.splitPct / 100) + refund });
              payoutCount++;
              a.firstPayoutDone = true;
              a.pnl = 0;
              a.bestDay = 0;
            }
          }
        }

        // Personal account trades the same ideas at its own (compounding) risk.
        if (personal > 50 && k > 0 && personal > personalPeak * 0.8) {
          let day = 0;
          for (let j = 0; j < k; j++) {
            day += outcome(j) * personal * (input.personalRiskPct / 100);
            if (day <= -(personal * input.personalDailyStopPct) / 100) break;
          }
          personal = Math.max(0, personal + day);
          personalPeak = Math.max(personalPeak, personal);
        }
      }

      for (const debt of debts) {
        if (debt.dueDay === d) {
          if (debt.amount > cash + 1e-9) coveredAll = false;
          else {
            cash -= debt.amount;
            debt.amount = 0;
          }
        }
      }
      const wealth = cash + personal - owed();
      if (targetDay == null && wealth >= input.target) targetDay = d;
      if (d % 7 === 0) fanSamples[d / 7].push(wealth);
    }

    for (const debt of debts) if (debt.dueDay >= H && debt.amount > cash + 1e-9) coveredAll = false;
    if (coveredAll) debtCovered++;
    const finalW = cash + personal - owed();
    fanSamples[weekly - 1].push(finalW);
    finals.push(finalW);
    if (finalW >= input.target || targetDay != null) hits++;
    const cheapest = Math.min(...input.templates.map((t) => t.price));
    if (!accs.some((a) => a.stage !== "failed") && cash - owed() < cheapest && personal < 100) ruins++;
    attempts.push(bought + input.accounts.filter((a) => a.stage !== "funded").length);
    fails.push(failed);
    fees.push(feeSpent);
    pays.push(paid);
    if (fundedDay != null) toFunded.push(fundedDay);
    if (payoutDay != null) toPayout.push(payoutDay);
    if (targetDay != null) toTarget.push(targetDay);
  }

  const sorted = [...finals].sort((a, b) => a - b);
  const q = (x: number) => quantile(sorted, x);
  const medianOrNull = (xs: number[]) => (xs.length > input.paths / 2 ? quantile([...xs].sort((a, b) => a - b), 0.5) : null);

  // Histogram on a log-ish scale is hard to read; use linear bins up to p99 and one overflow bin.
  // Scale to where outcomes actually are; the target only sets the range when it is within reach.
  const p99 = quantile(sorted, 0.99);
  const top = Math.max(100, input.target <= p99 * 1.15 ? Math.max(input.target * 1.2, p99) : p99 * 1.15);
  const bins = 24;
  const lo = Math.min(0, quantile(sorted, 0.01));
  const width = (top - lo) / bins;
  const histogram = Array.from({ length: bins }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0, hit: lo + (i + 1) * width > input.target }));
  for (const f of finals) histogram[Math.min(bins - 1, Math.max(0, Math.floor((f - lo) / width)))].count++;

  const startDate = parseDay(input.startDay);
  const fan = fanSamples
    .map((xs, w) => {
      const s = [...xs].sort((a, b) => a - b);
      const day = Math.min(w * 7, H);
      const dt = new Date(startDate);
      dt.setDate(dt.getDate() + day);
      return { day, date: dt.toISOString().slice(0, 10), p10: quantile(s, 0.1), p25: quantile(s, 0.25), p50: quantile(s, 0.5), p75: quantile(s, 0.75), p90: quantile(s, 0.9) };
    })
    .filter((_, i) => fanSamples[i].length > 0);

  return {
    paths: input.paths,
    probability: hits / input.paths,
    probabilityCI: wilson(hits, input.paths),
    final: { p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95), mean: mean(finals) },
    histogram,
    fan,
    evalPassRate: evalEnded > 0 ? evalPassed / evalEnded : null,
    evalAttemptsMean: mean(attempts),
    challengesFailedMean: mean(fails),
    feesMedian: quantile([...fees].sort((a, b) => a - b), 0.5),
    payoutsMedian: quantile([...pays].sort((a, b) => a - b), 0.5),
    medianDaysToFunded: medianOrNull(toFunded),
    medianDaysToFirstPayout: medianOrNull(toPayout),
    medianDaysToTarget: medianOrNull(toTarget),
    ruinProbability: ruins / input.paths,
    expectancyR: expectancyOf(input.sampler),
    debtCoverProbability: debts0.length ? debtCovered / input.paths : null,
  };
}
