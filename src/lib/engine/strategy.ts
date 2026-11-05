/**
 * Rotation strategy simulator — the plan, run many times under stated assumptions.
 *
 *   - Rotation: work through a list of challenges (firm + size) in order. A new challenge is
 *     bought from payout money once the previous one is funded and its fee is covered.
 *   - Speed targets: Phase 1 within `phase1Days`, Phase 2 within `phase2Days` more. Missing a
 *     target doesn't fail the account (no firm time limit) — it is measured and reported.
 *   - Each funded account takes up to `payoutsPerAccount` payouts on its firm's schedule, then
 *     the rotation moves on (the account is retired from the plan).
 *   - Every payout, in order: living allowance for the month → next challenge fee → debt share
 *     → personal live account share → the rest stays as reinvestment cash.
 *   - The personal live account trades the same ideas at its own (smaller) risk and compounds.
 *
 * Deadlines are 90th-percentile dates; "safe" amounts are 10th percentiles.
 */
import type { Template } from "../settings";
import { makeDraw, type Sampler } from "./simulate";
import { addDays, mulberry32, parseDay, poisson, quantile } from "./util";

export interface StratAccount {
  templateId: string;
  stage: "phase1" | "phase2" | "funded";
  pnl: number;
  tradingDays: number;
  bestDay: number;
  firstPayoutDone: boolean;
  payouts: number;
}

export interface StrategyInput {
  startDay: string;
  horizonDays: number;
  cash: number;
  personalEquity: number;
  debt: { amount: number; dueDay: number } | null;
  livingPerPayout: number;
  retryBudget: number;
  debtSharePct: number;
  personalSharePct: number;
  /** Rising real-account share by rotation step, used once the debt is clear. */
  personalShareByStep: number[];
  reserveFloor: number;
  steps: string[];
  templates: Template[];
  accounts: StratAccount[];
  sampler: Sampler;
  tradesPerDay: number;
  maxTradesPerDay: number;
  riskPct: number;
  personalRiskPct: number;
  dailyStopPct: number;
  correlation: number;
  payoutTriggerPct: number;
  payoutDelayDays: number;
  activationDelayDays: number;
  maxConcurrent: number;
  payoutsPerAccount: number;
  /** Payouts each account takes before the rotation moves on, by step. First account = 1 (fast), later = 2. */
  payoutsByStep: number[];
  phase1Days: number;
  phase2Days: number;
  paths: number;
  seed: number;
}

export interface Milestone {
  key: string;
  label: string;
  step: number | null;
  reached: number;
  p50: string | null;
  p90: string | null;
  byEnd: number;
}

export interface MonthRow {
  month: string;
  payoutsP10: number;
  payoutsP50: number;
  payoutsP90: number;
  payoutsCumP10: number;
  payoutsCumP50: number;
  livingP50: number;
  debtPaidCumP10: number;
  debtPaidCumP50: number;
  personalP10: number;
  personalP50: number;
  feesP50: number;
  netWorthP10: number;
  netWorthP50: number;
}

export interface StepStats {
  step: number;
  templateId: string;
  /** Share of Phase 1 passes that happened within the speed target. */
  fastP1: number;
  fastP2: number;
  passRate: number;
  attemptsP90: number;
  payoutAvg: number;
}

export interface StrategyResult {
  milestones: Milestone[];
  months: MonthRow[];
  steps: StepStats[];
  debtPaidByDue: number;
  debtFree: Milestone | null;
  feesP90: number;
  finalNetP10: number;
  finalNetP50: number;
  finalNetP90: number;
  personalP10: number;
  personalP50: number;
  pTarget: (target: number) => number;
  finals: number[];
}

interface Acc extends StratAccount {
  step: number;
  activeFrom: number;
  failed: boolean;
  retired: boolean;
  rules: Template;
  nextPayoutDay: number;
  phaseStart: number;
}

export function simulateStrategy(x: StrategyInput, missionEndDay: number): StrategyResult {
  const rng = mulberry32(x.seed);
  const draw = makeDraw(x.sampler, rng);
  const startDow = parseDay(x.startDay).getDay();
  const weekday = (d: number) => {
    const w = (startDow + d) % 7;
    return w !== 0 && w !== 6;
  };
  const tplById = (id: string) => x.templates.find((t) => t.id === id) ?? x.templates[0];
  const monthOf = (d: number) => addDays(x.startDay, d).slice(0, 7);
  const months: string[] = [];
  for (let d = 0; d <= missionEndDay; d++) if (!months.includes(monthOf(d))) months.push(monthOf(d));
  const label = (i: number) => {
    const t = tplById(x.steps[i]);
    return `${t.firm} $${t.size / 1000}K`;
  };
  /** How many payouts this step takes before the rotation moves on (first account one, later two). */
  const payoutsForStep = (i: number) => x.payoutsByStep[Math.min(i, x.payoutsByStep.length - 1)] ?? x.payoutsPerAccount;

  const hits = new Map<string, number[]>();
  const perMonth = months.map(() => ({ cum: [] as number[], pay: [] as number[], living: [] as number[], debtCum: [] as number[], personal: [] as number[], fees: [] as number[], net: [] as number[] }));
  const stepAgg = x.steps.map(() => ({ tries: [] as number[], started: 0, p1: 0, p1fast: 0, p2: 0, p2fast: 0, payouts: [] as number[] }));
  let debtByDue = 0;
  const finals: number[] = [];
  const personals: number[] = [];
  const feesAll: number[] = [];

  for (let p = 0; p < x.paths; p++) {
    const seen = new Set<string>();
    const hit = (k: string, d: number) => {
      if (seen.has(k)) return;
      seen.add(k);
      if (!hits.has(k)) hits.set(k, []);
      hits.get(k)!.push(d);
    };
    let cash = x.cash;
    let personal = x.personalEquity;
    let personalPeak = personal;
    let debt = x.debt?.amount ?? 0;
    let debtPaid = 0;
    let fees = 0;
    let reinvest = 0;
    let retryLeft = x.retryBudget;
    const tries = x.steps.map(() => 0);
    const mk = (templateId: string, step: number, from: number, base?: Partial<StratAccount>): Acc => ({
      templateId, stage: "phase1", pnl: 0, tradingDays: 0, bestDay: 0, firstPayoutDone: false, payouts: 0, ...base,
      step, activeFrom: from, failed: false, retired: false, rules: tplById(templateId), nextPayoutDay: from + (base?.stage === "funded" ? tplById(templateId).firstPayoutDays : 0), phaseStart: from,
    });
    const accs: Acc[] = x.accounts.map((a) => mk(a.templateId, Math.max(0, x.steps.indexOf(a.templateId)), 0, a));
    if (!accs.length) accs.push(mk(x.steps[0], 0, 0));
    for (const a of accs) { tries[a.step]++; stepAgg[a.step].started++; }
    let nextStep = Math.max(...accs.map((a) => a.step)) + 1;
    const pending: { day: number; amount: number; step: number }[] = [];
    const mPay = months.map(() => 0), mLiving = months.map(() => 0), mFees = months.map(() => 0);
    let lastMi = -1;
    let endNet: number | null = null;
    let endPersonal: number | null = null;

    const buy = (step: number, d: number, from: "reinvest" | "retry" | "cash") => {
      const t = tplById(x.steps[step]);
      if (from === "reinvest") reinvest -= t.price;
      else if (from === "retry") retryLeft -= t.price;
      else cash -= t.price;
      fees += t.price;
      const mi = months.indexOf(monthOf(d));
      if (mi >= 0) mFees[mi] += t.price;
      tries[step]++;
      stepAgg[step].started++;
      accs.push(mk(t.id, step, d + 1));
      hit(`buy_${step}`, d);
    };
    const snapshot = (i: number) => {
      if (i < 0 || i >= months.length || perMonth[i].pay.length > p) return;
      perMonth[i].pay.push(mPay[i]);
      perMonth[i].cum.push(mPay.slice(0, i + 1).reduce((a, b) => a + b, 0));
      perMonth[i].living.push(mLiving[i]);
      perMonth[i].debtCum.push(debtPaid);
      perMonth[i].personal.push(personal);
      perMonth[i].fees.push(mFees[i]);
      perMonth[i].net.push(cash + reinvest + personal - debt);
    };

    for (let d = 0; d < x.horizonDays; d++) {
      const mi = months.indexOf(monthOf(d));
      if (mi !== lastMi && lastMi >= 0) snapshot(lastMi);
      lastMi = mi;

      // 1. Payouts arrive. Living is taken off the top; the remainder splits three ways — debt, your own account, reinvestment.
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].day > d) continue;
        let amt = pending[i].amount;
        if (mi >= 0) mPay[mi] += amt;
        // Living: a flat amount off the top of every payout — day-to-day money that never goes back into trading.
        const toLiving = Math.min(amt, x.livingPerPayout);
        if (mi >= 0) mLiving[mi] += toLiving;
        amt -= toLiving;
        // Scaling: top the reserve up to the next challenge fee so the ladder keeps moving.
        const wantStep = nextStep < x.steps.length ? nextStep : accs[accs.length - 1].failed ? accs[accs.length - 1].step : -1;
        if (wantStep >= 0) {
          const toFee = Math.min(amt, Math.max(0, tplById(x.steps[wantStep]).price - reinvest));
          reinvest += toFee;
          amt -= toFee;
        }
        // The remainder splits three ways — debt takes its share from the first payout on, until it's clear.
        const base = amt;
        if (debt > 0) {
          const toDebt = Math.min(debt, (base * x.debtSharePct) / 100);
          debt -= toDebt;
          debtPaid += toDebt;
          amt -= toDebt;
          if (debt <= 0.01) hit("debt_paid", d);
        }
        // Real account: a rising share per rotation step — the gradual move onto your own capital.
        const stepShare = x.personalShareByStep[Math.min(pending[i].step, x.personalShareByStep.length - 1)] ?? x.personalSharePct;
        const personalShare = debt > 0 ? Math.min(stepShare, 100 - x.debtSharePct) : stepShare;
        const toPersonal = Math.min(amt, (base * personalShare) / 100);
        personal += toPersonal;
        personalPeak = Math.max(personalPeak, personal);
        amt -= toPersonal;
        reinvest += amt;
        pending.splice(i, 1);
      }

      // 2. Rotation. Climb the ladder when the next size is affordable; once funded with cash to spare,
      //    run accounts in PARALLEL up to the concurrency limit, at the biggest size you've already proven.
      if (weekday(d)) {
        const live = accs.filter((a) => !a.failed && !a.retired);
        const latest = accs[accs.length - 1];
        const feeOf = (step: number) => tplById(x.steps[step]).price;
        const reached = Math.max(0, nextStep - 1); // the biggest ladder step unlocked so far
        if (latest.failed && live.length < x.maxConcurrent) {
          const fee = feeOf(latest.step);
          if (reinvest >= fee) buy(latest.step, d, "reinvest");
          else if (retryLeft >= fee) buy(latest.step, d, "retry");
          else if (cash - x.reserveFloor >= fee) buy(latest.step, d, "cash");
        } else if (live.length < x.maxConcurrent) {
          if (nextStep < x.steps.length && reinvest >= feeOf(nextStep)) {
            // Climb: payout cash has unlocked the next, bigger account.
            buy(nextStep, d, "reinvest");
            nextStep++;
          } else {
            // Parallel: deploy spare payout cash into another account at the biggest size you can afford.
            let par = -1;
            for (let si = Math.min(reached, x.steps.length - 1); si >= 0; si--) { if (reinvest >= feeOf(si)) { par = si; break; } }
            if (par >= 0) buy(par, d, "reinvest");
          }
        }
      }

      // 3. Trade.
      if (weekday(d)) {
        const k = Math.min(x.maxTradesPerDay, poisson(rng, x.tradesPerDay));
        const shared = Array.from({ length: k }, () => draw());
        const out = (j: number) => (rng() < x.correlation ? shared[j] : draw());
        for (const a of accs) {
          if (a.failed || a.retired || a.activeFrom > d) continue;
          const isEval = a.stage !== "funded";
          const tgt = a.stage === "phase1" ? a.rules.profitTargetP1 : a.rules.profitTargetP2;
          const reached = isEval && (a.pnl / a.rules.size) * 100 >= tgt;
          if (k === 0 && !reached) continue;
          a.tradingDays++;
          if (!reached) {
            const size = a.rules.size;
            const risk = (size * x.riskPct) / 100;
            const dailyLimit = (size * a.rules.dailyLossPct) / 100;
            const stop = (size * x.dailyStopPct) / 100;
            const floor = -(size * a.rules.maxLossPct) / 100;
            let day = 0;
            for (let j = 0; j < k; j++) {
              day += out(j) * risk;
              if (day <= -dailyLimit || a.pnl + day <= floor) { a.failed = true; break; }
              if (day <= -stop) break;
            }
            if (a.failed) { hit(`fail_${a.step}`, d); continue; }
            a.pnl += day;
            if (!isEval) a.bestDay = Math.max(a.bestDay, day);
          }
          if (isEval && (a.pnl / a.rules.size) * 100 >= tgt && a.tradingDays >= a.rules.minTradingDays) {
            const took = d - a.phaseStart + 1;
            const agg = stepAgg[a.step];
            if (a.stage === "phase1") {
              agg.p1++;
              if (took <= x.phase1Days) agg.p1fast++;
              hit(`p1_${a.step}`, d);
              a.stage = "phase2"; a.activeFrom = d + 1; a.phaseStart = d + 1;
            } else {
              agg.p2++;
              if (took <= x.phase2Days) agg.p2fast++;
              a.stage = "funded"; a.activeFrom = d + 1 + x.activationDelayDays;
              a.nextPayoutDay = a.activeFrom + a.rules.firstPayoutDays;
              hit(`p2_${a.step}`, a.activeFrom);
            }
            a.pnl = 0; a.tradingDays = 0; a.bestDay = 0;
          } else if (a.stage === "funded" && d >= a.nextPayoutDay) {
            const g = (a.pnl / a.rules.size) * 100;
            const onDemand = a.rules.payoutCycleDays === 0;
            const need = onDemand ? Math.max(x.payoutTriggerPct, a.rules.payoutMinGrowthPct) : Math.max(a.rules.payoutMinGrowthPct, x.payoutTriggerPct / 2);
            if (g >= need && a.bestDay <= (a.rules.bestDayCapPct / 100) * a.pnl) {
              const refund = !a.firstPayoutDone && a.rules.feeRefundOnFirstPayout ? a.rules.price : 0;
              const amount = a.pnl * (a.rules.splitPct / 100) + refund;
              pending.push({ day: d + x.payoutDelayDays, amount, step: a.step });
              stepAgg[a.step].payouts.push(amount);
              a.payouts++;
              hit(`payout${a.payouts}_${a.step}`, d + x.payoutDelayDays);
              a.firstPayoutDone = true; a.pnl = 0; a.bestDay = 0;
              a.nextPayoutDay = d + Math.max(1, a.rules.payoutCycleDays);
              if (a.payouts >= payoutsForStep(a.step)) a.retired = true;
            }
          }
        }

        // Personal live account: same ideas, own risk, same daily stop; pauses after a 15% drawdown.
        if (personal > 50 && k > 0 && personal > personalPeak * 0.85) {
          let day = 0;
          for (let j = 0; j < k; j++) {
            day += out(j) * personal * (x.personalRiskPct / 100);
            if (day <= -(personal * x.dailyStopPct) / 100) break;
          }
          personal = Math.max(0, personal + day);
          personalPeak = Math.max(personalPeak, personal);
        }
      }

      if (x.debt && d === x.debt.dueDay && debt <= 0.01) debtByDue++;
      if (d === missionEndDay) {
        endNet = cash + reinvest + personal - debt;
        endPersonal = personal;
      }
    }
    if (lastMi >= 0) snapshot(lastMi);
    finals.push(endNet ?? cash + reinvest + personal - debt);
    personals.push(endPersonal ?? personal);
    feesAll.push(fees);
    tries.forEach((n, i) => stepAgg[i].tries.push(n));
  }

  const q = (xs: number[], v: number) => (xs.length ? quantile([...xs].sort((a, b) => a - b), v) : 0);
  const dayStr = (d: number | null) => (d == null ? null : addDays(x.startDay, Math.round(d)));
  const ms = (key: string, lbl: string, step: number | null): Milestone => {
    const ds = [...(hits.get(key) ?? [])].sort((a, b) => a - b);
    const reached = ds.length / x.paths;
    const at = (pct: number) => (reached >= pct ? ds[Math.ceil(pct * x.paths) - 1] ?? null : null);
    return { key, label: lbl, step, reached, p50: dayStr(at(0.5)), p90: dayStr(at(0.9)), byEnd: ds.filter((d) => d <= missionEndDay).length / x.paths };
  };

  const milestones: Milestone[] = [];
  const firstStep = x.accounts.length ? Math.max(0, x.steps.indexOf(x.accounts[0].templateId)) : 0;
  for (let i = firstStep; i < x.steps.length; i++) {
    const held = i === firstStep && x.accounts.length > 0;
    if (!held) milestones.push(ms(`buy_${i}`, `Buy ${label(i)}`, i));
    const stage = held ? x.accounts[0].stage : "phase1";
    if (stage === "phase1") milestones.push(ms(`p1_${i}`, `${label(i)} · Phase 1`, i));
    if (stage !== "funded") milestones.push(ms(`p2_${i}`, `${label(i)} · Phase 2 → funded`, i));
    milestones.push(ms(`payout1_${i}`, `${label(i)} · payout 1`, i));
    if (payoutsForStep(i) >= 2) milestones.push(ms(`payout2_${i}`, `${label(i)} · payout 2`, i));
  }
  const debtFree = x.debt ? ms("debt_paid", "Debt fully repaid", null) : null;
  const sorted = [...finals].sort((a, b) => a - b);

  return {
    milestones,
    months: months.map((month, i) => ({
      month,
      payoutsP10: q(perMonth[i].pay, 0.1), payoutsP50: q(perMonth[i].pay, 0.5), payoutsP90: q(perMonth[i].pay, 0.9),
      payoutsCumP10: q(perMonth[i].cum, 0.1), payoutsCumP50: q(perMonth[i].cum, 0.5),
      livingP50: q(perMonth[i].living, 0.5),
      debtPaidCumP10: q(perMonth[i].debtCum, 0.1), debtPaidCumP50: q(perMonth[i].debtCum, 0.5),
      personalP10: q(perMonth[i].personal, 0.1), personalP50: q(perMonth[i].personal, 0.5),
      feesP50: q(perMonth[i].fees, 0.5),
      netWorthP10: q(perMonth[i].net, 0.1), netWorthP50: q(perMonth[i].net, 0.5),
    })),
    steps: stepAgg.map((a, i) => ({
      step: i,
      templateId: x.steps[i],
      fastP1: a.p1 ? a.p1fast / a.p1 : 0,
      fastP2: a.p2 ? a.p2fast / a.p2 : 0,
      passRate: a.started ? a.p2 / a.started : 0,
      attemptsP90: Math.round(q(a.tries, 0.9)),
      payoutAvg: a.payouts.length ? a.payouts.reduce((s, v) => s + v, 0) / a.payouts.length : 0,
    })),
    debtPaidByDue: x.debt ? debtByDue / x.paths : 1,
    debtFree,
    feesP90: q(feesAll, 0.9),
    finalNetP10: quantile(sorted, 0.1),
    finalNetP50: quantile(sorted, 0.5),
    finalNetP90: quantile(sorted, 0.9),
    personalP10: q(personals, 0.1),
    personalP50: q(personals, 0.5),
    pTarget: (t: number) => finals.filter((f) => f >= t).length / finals.length,
    finals,
  };
}
