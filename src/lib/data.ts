import "server-only";
import { cache } from "react";
import { db, schema } from "@/db";
import { defaultSettings, settingsSchema, type Settings } from "./settings";
import { accountState, type AccountState } from "./engine/accounts";
import { closedTrades, tradeStats } from "./engine/stats";
import { computeWealth, missionClock, wealthTimeline } from "./engine/wealth";
import { dailyScore, exposure, riskAlerts } from "./engine/risk";
import { scalingGate } from "./engine/allocation";
import { nextActions } from "./engine/advisor";
import { buildRoadmap } from "./engine/roadmap";
import { simulateStrategy, type StrategyInput, type StrategyResult } from "./engine/strategy";
import { kellyPct, phaseOdds, smartSize } from "./engine/coach";
import { findings } from "./engine/insights";
import { fmtDate } from "./format";
import { simulate, expectancyOf, type SimInput, type SimResult, type Sampler } from "./engine/simulate";
import { addDays, daysBetween, dayKey, isWeekday, mean, median } from "./engine/util";

export function today(): string {
  return dayKey(new Date());
}

/** Local wall-clock timestamp "YYYY-MM-DDTHH:mm", matching <input type="datetime-local">. */
export function nowLocal(): string {
  const d = new Date();
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function getSettings(): Settings {
  const row = db.select().from(schema.settings).all()[0];
  if (!row) return defaultSettings();
  const parsed = settingsSchema.safeParse(JSON.parse(row.json));
  if (!parsed.success) return defaultSettings();
  // Firms added in later versions appear without overwriting your edited templates.
  const known = new Set(parsed.data.templates.map((t) => t.id));
  for (const t of defaultSettings().templates) if (!known.has(t.id)) parsed.data.templates.push(t);
  return parsed.data;
}

export function saveSettings(s: Settings) {
  const json = JSON.stringify(settingsSchema.parse(s));
  db.insert(schema.settings)
    .values({ id: 1, json, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: schema.settings.id, set: { json, updatedAt: new Date().toISOString() } })
    .run();
}

/** Everything the UI needs, computed once per request. */
export const loadMission = cache(() => {
  const settings = getSettings();
  const t = today();
  const accounts = db.select().from(schema.accounts).all();
  const trades = db.select().from(schema.trades).all();
  const events = db.select().from(schema.balanceEvents).all();
  const payouts = db.select().from(schema.payouts).all();
  const ledger = db.select().from(schema.ledger).all();
  const logs = db.select().from(schema.dailyLogs).all();

  const states = accounts.map((a) => accountState(a, trades, events, payouts, ledger, settings, t));
  const closed = closedTrades(trades);
  const stats = tradeStats(closed);
  const wealth = computeWealth(settings, states, payouts, ledger);
  const clock = missionClock(settings, wealth, t);
  const timeline = wealthTimeline(settings, states, payouts, ledger, t);
  const sizeOf = (id: number) => {
    const s = states.find((x) => x.account.id === id);
    return s ? (s.isProp ? s.account.size : Math.max(1, s.peakBalance)) : 0;
  };
  const tradeDays = [...new Set([...trades.map((x) => dayKey(x.openedAt)), ...logs.map((l) => l.date)])].sort();
  const scores = tradeDays.map((d) => dailyScore(d, trades, logs.find((l) => l.date === d), settings, sizeOf));
  const recentScores = scores.filter((s) => s.trades > 0).slice(-10);
  const avgScore = recentScores.length ? mean(recentScores.map((s) => s.score)) : null;
  const base = settings.scenarios.base;
  const modelE = expectancyOf({ kind: "parametric", ...base });
  const alerts = riskAlerts({ settings, states, trades, closed, logs, today: t, modelExpectancyR: modelE });
  const exp = exposure(states.filter((s) => !s.account.archived), t);
  const gate = scalingGate(settings, stats, alerts, avgScore);
  const todayLog = logs.find((l) => l.date === t);
  const strategy = strategyFor(settings, states, wealth, closedTradesForStrategy(closed), t);
  const roadmap = buildRoadmap({ settings, states, payouts, wealth, clock, logs, today: t, deadlines: strategy.plan.deadlines });
  // Discipline streak: consecutive scored days (newest first) with an execution score of 70+.
  let streak = 0;
  for (let i = scores.length - 1; i >= 0 && scores[i].score >= settings.policy.minExecutionScore; i--) streak++;

  return { strategy, roadmap, streak, settings, today: t, accounts, trades, events, payouts, ledger, logs, states, closed, stats, wealth, clock, timeline, scores, avgScore, alerts, exposure: exp, gate, todayLog, sizeOf };
});

export type Mission = ReturnType<typeof loadMission>;

export function actionsFor(m: Mission, probability: number | null) {
  return nextActions({ settings: m.settings, states: m.states, stats: m.stats, alerts: m.alerts, probability, clock: m.clock, gate: m.gate, todayLog: m.todayLog, today: m.today, wealth: m.wealth, debtRepaidBy: m.strategy.plan.debtFree?.p90 ? fmtDate(m.strategy.plan.debtFree.p90) : null });
}


// ---------------------------------------------------------------- projections

function liveAccountsForSim(m: Mission): SimInput["accounts"] {
  const live = m.states.filter((s) => s.isProp && !s.account.archived && ["phase1", "phase2", "funded"].includes(s.account.stage));
  return live.map((s: AccountState) => ({
    size: s.account.size,
    price: s.account.purchasePrice,
    profitTargetP1: s.account.profitTargetP1,
    profitTargetP2: s.account.profitTargetP2,
    dailyLossPct: s.account.dailyLossPct,
    maxLossPct: s.account.maxLossPct,
    minTradingDays: s.account.minTradingDays,
    splitPct: s.account.splitPct,
    payoutMinGrowthPct: s.account.payoutMinGrowthPct,
    bestDayCapPct: s.account.bestDayCapPct,
    feeRefundOnFirstPayout: s.account.feeRefundOnFirstPayout,
    stage: s.account.stage as "phase1" | "phase2" | "funded",
    pnl: s.account.stage === "funded" ? s.payout?.cycleProfit ?? 0 : s.profit,
    tradingDays: s.tradingDays,
    bestDay: s.bestDay,
    firstPayoutDone: m.payouts.some((p) => p.accountId === s.account.id && p.status !== "rejected"),
    activeFrom: 0,
  }));
}

export interface ProjectionContext {
  startDay: string;
  horizonDays: number;
  seededFirstChallenge: boolean;
  live: { sampler: Sampler; tradesPerDay: number; riskPct: number; n: number } | null;
}

function baseSimInput(m: Mission, scenario: keyof Settings["scenarios"]): { input: SimInput; ctx: ProjectionContext } {
  const s = m.settings;
  const sc = s.scenarios[scenario];
  const startDay = m.today > s.missionStart ? m.today : s.missionStart;
  const horizonDays = Math.max(1, daysBetween(startDay, s.missionEnd));
  let accounts = liveAccountsForSim(m);
  const seeded = accounts.length === 0 && !m.accounts.some((a) => a.kind === "prop");
  if (seeded) {
    // Nothing purchased yet: model the planned first step (the $6K challenge, fee treated as already spent).
    const t = [...s.templates].sort((a, b) => a.size - b.size)[0];
    accounts = [{ ...t, stage: "phase1", pnl: 0, tradingDays: 0, bestDay: 0, firstPayoutDone: false, activeFrom: 0 }];
  }
  const pendingPayouts = m.payouts
    .filter((p) => p.status === "requested" || p.status === "approved")
    .map((p) => ({ inDays: sc.payoutDelayDays, amount: (p.approvedAmount ?? p.requestedAmount) + p.feeRefund - p.fees }));

  const input: SimInput = {
    startDay,
    horizonDays,
    target: s.targetAmount,
    cash: m.wealth.cash,
    personalEquity: m.wealth.personalEquity,
    accounts,
    pendingPayouts,
    debts: m.wealth.debts.filter((d) => d.outstanding > 0).map((d) => ({ amount: d.outstanding, dueDay: Math.max(0, daysBetween(startDay, d.dueDate)) })),
    sampler: { kind: "parametric", winRate: sc.winRate, avgWinR: sc.avgWinR, avgLossR: sc.avgLossR, costR: sc.costR },
    tradesPerDay: sc.tradesPerDay,
    maxTradesPerDay: s.risk.maxTradesPerDay,
    riskPct: sc.riskPct,
    personalRiskPct: sc.personalReturnRiskPct,
    personalDailyStopPct: s.risk.maxDailyLossPct,
    correlation: s.simulation.crossAccountCorrelation,
    activationDelayDays: sc.activationDelayDays,
    payoutDelayDays: sc.payoutDelayDays,
    policy: {
      payoutTriggerPct: s.policy.payoutTriggerPct,
      maxConcurrentProp: s.policy.maxConcurrentProp,
      feeBudgetPct: s.policy.feeBudgetPct,
      reserveFloor: s.policy.reserveFloor,
      personalPct: s.policy.personalPct,
      maxFundedAllocation: s.policy.maxFundedAllocation,
      requirePayoutBeforeScaling: true,
    },
    templates: s.templates,
    paths: s.simulation.paths,
    seed: s.simulation.seed,
  };

  let live: ProjectionContext["live"] = null;
  if (m.closed.length >= s.simulation.minTradesForMonteCarlo) {
    const days = new Set(m.closed.map((t) => t.day)).size;
    const ideas = new Set(m.closed.map((t) => `${t.instrument}|${t.direction}|${t.openedAt.slice(0, 15)}`)).size;
    const riskPcts = m.closed.filter((t) => m.states.find((x) => x.account.id === t.accountId)?.isProp).map((t) => (t.riskAmount / m.sizeOf(t.accountId)) * 100);
    live = {
      sampler: { kind: "bootstrap", rs: m.closed.map((t) => t.r) },
      tradesPerDay: ideas / Math.max(1, days),
      riskPct: riskPcts.length ? median(riskPcts) : sc.riskPct,
      n: m.closed.length,
    };
  }
  return { input, ctx: { startDay, horizonDays, seededFirstChallenge: seeded, live } };
}

const memo = new Map<string, SimResult>();
function run(input: SimInput): SimResult {
  const key = JSON.stringify(input);
  const hit = memo.get(key);
  if (hit) return hit;
  const r = simulate(input);
  if (memo.size > 200) memo.clear();
  memo.set(key, r);
  return r;
}

export function liveProjection(m: Mission) {
  const { input, ctx } = baseSimInput(m, "base");
  if (!ctx.live) return { ctx, result: null as SimResult | null };
  return { ctx, result: run({ ...input, sampler: ctx.live.sampler, tradesPerDay: ctx.live.tradesPerDay, riskPct: ctx.live.riskPct, personalRiskPct: ctx.live.riskPct }) };
}

export function scenarioProjections(m: Mission) {
  return (["conservative", "base", "optimistic"] as const).map((k) => {
    const { input, ctx } = baseSimInput(m, k);
    return { key: k, scenario: m.settings.scenarios[k], ctx, result: run(input) };
  });
}

export function sensitivity(m: Mission) {
  const { input: base0, ctx } = baseSimInput(m, "base");
  const useLive = ctx.live != null;
  const base: SimInput = {
    ...base0,
    paths: Math.max(300, Math.round(m.settings.simulation.paths / 3)),
    ...(useLive ? { sampler: ctx.live!.sampler, tradesPerDay: ctx.live!.tradesPerDay, riskPct: ctx.live!.riskPct } : {}),
  };
  const variants: { label: string; note: string; input: SimInput }[] = [
    { label: "Baseline", note: `${useLive ? "Your recorded trades" : "Base-case assumptions"} · smart ladder sizing`, input: base },
    { label: "First challenge fails", note: "Forced failure of the first evaluation", input: { ...base, stress: { failFirstChallenge: true } } },
    { label: "Payouts delayed 14 days", note: "Every payout arrives two weeks later", input: { ...base, stress: { extraPayoutDelayDays: 14 } } },
    { label: "Two losing weeks", note: "Every trade loses for 2 weeks, starting day 14", input: { ...base, stress: { losingWeeks: { fromDay: 14, weeks: 2 } } } },
    { label: "Win rate −5 pts", note: "Edge decays", input: { ...base, stress: { winRateDelta: -0.05 } } },
    { label: "Win rate −10 pts", note: "Edge largely gone", input: { ...base, stress: { winRateDelta: -0.1 } } },
    { label: "One extra month", note: "Deadline moved +30 days", input: { ...base, horizonDays: base.horizonDays + 30 } },
    { label: "Always max size", note: `Always ${m.settings.risk.maxRiskPerTradePct}% on every trade — no ladder`, input: { ...base, ladder: undefined, riskPct: m.settings.risk.maxRiskPerTradePct } },
    { label: "Always 1%", note: "Always 1% on every trade — no ladder", input: { ...base, ladder: undefined, riskPct: 1 } },
  ];
  return { usedLive: useLive, rows: variants.map((v) => ({ label: v.label, note: v.note, result: run(v.input) })) };
}

/** "What would it take": probability of the goal across a grid of per-trade expectancy, holding everything else at base. */
export function requiredEdge(m: Mission) {
  const { input } = baseSimInput(m, "base");
  const sc = m.settings.scenarios.base;
  return [0.1, 0.25, 0.4, 0.6, 0.8, 1.0, 1.25, 1.5].map((E) => {
    const avgWinR = (E + sc.costR + (1 - sc.winRate) * sc.avgLossR) / sc.winRate;
    const r = run({ ...input, paths: 300, sampler: { kind: "parametric", winRate: sc.winRate, avgWinR, avgLossR: sc.avgLossR, costR: sc.costR } });
    return { expectancy: E, avgWinR, probability: r.probability, median: r.final.p50 };
  });
}

export function upcomingTradingDays(from: string, n: number): string[] {
  const out: string[] = [];
  let d = from;
  while (out.length < n) {
    if (isWeekday(d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/** The trade distribution used for forward-looking calculations: your data when there is enough, else the base case. */
export function activeSampler(m: Mission): { sampler: Sampler; tradesPerDay: number; riskPct: number; source: "data" | "assumption"; n: number } {
  const { input, ctx } = baseSimInput(m, "base");
  if (ctx.live) return { ...ctx.live, source: "data" };
  return { sampler: input.sampler, tradesPerDay: input.tradesPerDay, riskPct: input.riskPct, source: "assumption", n: m.closed.length };
}

/** Let React flush the page shell (and Suspense fallbacks) before a CPU-heavy simulation runs. */
export const yieldToStream = () => new Promise<void>((r) => setTimeout(r, 0));

export function onTrackText(m: Mission): string {
  const c = m.clock;
  return `Realized $${Math.round(m.wealth.realizedNetWealth)} (${c.goalPct.toFixed(1)}% of goal) with ${c.timePct.toFixed(0)}% of time elapsed; ${c.aheadBy >= 0 ? "ahead of" : "behind"} linear pace by $${Math.abs(Math.round(c.aheadBy))}.`;
}

// ---------------------------------------------------------------- coach

const oddsMemo = new Map<string, ReturnType<typeof phaseOdds>>();

/** Smart sizes, live pass odds and today's game plan for every active account. */
export function coach(m: Mission) {
  let losses = 0;
  for (let i = m.closed.length - 1; i >= 0 && m.closed[i].pnl < 0; i--) losses++;
  const kelly = kellyPct(m.stats.winRate, m.stats.avgWinR, m.stats.avgLossR, m.stats.n, m.settings.simulation.minTradesForMonteCarlo);
  const smp = activeSampler(m);
  const live = m.states.filter((s) => !s.account.archived && s.account.stage !== "failed");
  const accounts = live.map((s) => {
    const size = smartSize(s, { settings: m.settings, consecutiveLosses: losses, kelly });
    const base = s.isProp ? s.account.size : Math.max(1, s.peakBalance);
    const room = {
      day: Math.max(0, Math.min((base * m.settings.risk.maxDailyLossPct) / 100 + Math.min(0, s.todayPnl), s.dailyLossLimit + Math.min(0, s.todayPnl))),
      floor: Math.max(0, s.balance - s.maxLossFloor),
      cap: (base * m.settings.risk.maxRiskPerTradePct) / 100,
    };
    const odds = (mode: "smart" | "max") => {
      const key = JSON.stringify([s.account.id, s.balance, s.tradingDays, s.account.stage, m.settings.risk, smp.n, smp.tradesPerDay, mode, m.today, kelly]);
      if (!oddsMemo.has(key)) {
        if (oddsMemo.size > 100) oddsMemo.clear();
        oddsMemo.set(key, phaseOdds(s, m.settings, smp.sampler, smp.tradesPerDay, mode === "smart" ? { flatPct: m.settings.plan.avgRiskPct } : "max", m.today));
      }
      return oddsMemo.get(key)!;
    };
    return { state: s, size, room, smart: odds("smart"), flat: odds("max") };
  });

  const f = findings(m.closed, m.settings.risk.maxTradesPerDay).filter((x) => x.strength !== "anecdotal");
  const plan: { icon: "stage" | "size" | "limits" | "edge" | "debt"; text: string }[] = [];
  const main = accounts.find((a) => a.state.isProp) ?? accounts[0];
  if (main) {
    const st = main.state;
    if (st.targetPct != null) {
      const left = Math.max(0, (st.account.size * st.targetPct) / 100 - st.profit);
      plan.push({ icon: "stage", text: `${st.account.name}: ${usd0(left)} to the ${st.targetPct}% target${main.smart ? ` · ${prob(main.smart.pPass)} pass chance from here` : ""}${main.smart?.eta ? `, typically by ${fmtDate(main.smart.eta)}` : ""}.` });
    } else if (st.payout) plan.push({ icon: "stage", text: `${st.account.name}: ${st.payout.eligible ? "payout ready to request" : `${usd0(st.payout.cycleProfit)} profit this cycle, building to the ${m.settings.policy.payoutTriggerPct}% payout point`}.` });
    plan.push({ icon: "size", text: main.room.day <= 0.5 ? "Daily stop reached — no more trades today." : `Your call on size. Room today: ${usd0(main.room.day)} · room to the firm's max loss: ${usd0(main.room.floor)} · your ceiling ${usd0(main.room.cap)} per trade. The deadlines assume about ${m.settings.plan.avgRiskPct}% on average.` });
  }
  const next = m.roadmap.stages.find((x) => x.status !== "done" && !x.deadline);
  if (next) plan.push({ icon: "limits", text: `Next deadline: ${next.title} by ${fmtDate(next.end)} (${Math.max(0, daysBetween(m.today, next.end))} days).` });
  const neg = f.find((x) => x.tone === "negative");
  const pos = f.find((x) => x.tone === "positive");
  if (neg || pos) plan.push({ icon: "edge", text: [pos && `Lean on: ${pos.title}.`, neg && `Avoid: ${neg.title}.`].filter(Boolean).join(" ") });
  else plan.push({ icon: "edge", text: `${m.closed.length}/30 trades journaled — after 30 the plan adapts to what actually works for you.` });
  const debt = m.wealth.debts.filter((d) => d.outstanding > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (debt) {
    const gap = Math.max(0, debt.outstanding - Math.max(0, m.wealth.cash));
    const weeks = Math.max(1, Math.ceil(daysBetween(m.today, debt.dueDate) / 7));
    plan.push({ icon: "debt", text: gap > 0 ? `Debt: set aside ${usd0(gap / weeks)} this week (${usd0(gap)} to go by ${fmtDate(debt.dueDate)}).` : `Debt covered by your cash — keep ${usd0(debt.outstanding)} untouched until ${fmtDate(debt.dueDate)}.` });
  }
  return { accounts, plan, consecutiveLosses: losses, kelly };
}

const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const prob = (p: number) => (p < 0.01 ? "<1%" : p > 0.99 ? ">99%" : `${Math.round(p * 100)}%`);

// ---------------------------------------------------------------- strategy

const stratMemo = new Map<string, StrategyResult>();
function runStrategy(input: StrategyInput, endDay: number): StrategyResult {
  const key = JSON.stringify([input, endDay]);
  const hit = stratMemo.get(key);
  if (hit) return hit;
  const r = simulateStrategy(input, endDay);
  if (stratMemo.size > 40) stratMemo.clear();
  stratMemo.set(key, r);
  return r;
}

function closedTradesForStrategy(closed: ReturnType<typeof closedTrades>) {
  return closed.map((t) => ({ r: t.r, riskPct: t.riskAmount }));
}

export type StrategyBundle = ReturnType<typeof strategyFor>;

/** Add n business days (skipping weekends) to a YYYY-MM-DD date. */
function addBiz(start: string, n: number): string {
  let d = start, added = 0;
  while (added < n) { d = addDays(d, 1); if (isWeekday(d)) added++; }
  return d;
}
/** The first weekday on or after a date. */
function onWeekday(iso: string): string {
  let d = iso;
  while (!isWeekday(d)) d = addDays(d, 1);
  return d;
}

/**
 * A clean, monotonic TARGET schedule for the rotation — the plan you commit to, laid out from the start at
 * the fast-pass cadence (Phase 1 within the week, Phase 2 the next), with FundedNext's real payout timing
 * (first withdrawal 21 days after funding, then every 14). Because accounts run in parallel, the next one is
 * bought shortly after the current one funds, not after it pays out, which keeps the ladder inside the window.
 * The simulator's probability-weighted dates drive the honest-odds cards instead.
 */
function targetDeadlines(start: string, steps: string[], payoutsByStep: number[], firstPayoutDays: number, cycleDays: number): Record<string, string> {
  const dl: Record<string, string> = {};
  let buy = start;
  for (let i = 0; i < steps.length; i++) {
    const nPay = payoutsByStep[Math.min(i, payoutsByStep.length - 1)] ?? 2;
    // The held $6K keeps the trader's own restored targets: Step 1 Nov 4, Step 2 Nov 10, first payout Nov 13 (latest ~17).
    const p1 = i === 0 ? onWeekday(addBiz(buy, 2)) : onWeekday(addBiz(buy, 4));
    const p2 = i === 0 ? onWeekday(addBiz(buy, 6)) : onWeekday(addBiz(p1, 5));
    const pay1 = i === 0 ? onWeekday(addBiz(buy, 9)) : addDays(p2, firstPayoutDays);
    const pay2 = addDays(pay1, cycleDays);         // then on the real cycle
    if (i > 0) dl[`buy_${i}`] = buy;
    dl[`p1_${i}`] = p1;
    dl[`p2_${i}`] = p2;
    dl[`payout1_${i}`] = pay1;
    if (nPay >= 2) dl[`payout2_${i}`] = pay2;
    buy = onWeekday(addBiz(p2, 3));                // parallel: buy the next account a few days after this one funds
  }
  const lastI = steps.length - 1;
  dl.debt_paid = dl[`payout2_${lastI}`] ?? dl[`payout1_${lastI}`] ?? buy;  // the debt clears near the last account's payouts
  return dl;
}

/**
 * The strategy, run three ways: with the performance the plan needs (this sets the deadlines),
 * with base-case assumptions, and — once there are enough trades — with your own results.
 */
function strategyFor(settings: Settings, states: AccountState[], wealth: ReturnType<typeof computeWealth>, closed: { r: number }[], today: string) {
  const P = settings.plan;
  const start = today > settings.missionStart ? today : settings.missionStart;
  const endDay = Math.max(1, daysBetween(start, settings.missionEnd));
  const live = states
    .filter((x) => x.isProp && !x.account.archived && ["phase1", "phase2", "funded"].includes(x.account.stage))
    .sort((a, b) => a.account.size - b.account.size)
    .map((x) => ({
      templateId: (settings.templates.find((t) => t.firm === x.account.firm && t.size === x.account.size) ?? settings.templates.find((t) => t.size === x.account.size) ?? settings.templates[0]).id,
      stage: x.account.stage as "phase1" | "phase2" | "funded",
      pnl: x.account.stage === "funded" ? x.payout?.cycleProfit ?? 0 : x.profit,
      tradingDays: x.tradingDays,
      bestDay: x.bestDay,
      firstPayoutDone: false,
      payouts: 0,
    }));
  const debt = wealth.debts.filter((d) => d.outstanding > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const base: Omit<StrategyInput, "sampler" | "riskPct" | "tradesPerDay"> = {
    startDay: start,
    horizonDays: 365,
    cash: Math.max(0, wealth.cash),
    personalEquity: wealth.personalEquity,
    personalSharePct: P.personalSharePct,
    personalShareByStep: P.personalShareByStep,
    personalRiskPct: P.personalRiskPct,
    payoutsPerAccount: P.payoutsPerAccount,
    payoutsByStep: P.payoutsByStep,
    phase1Days: P.phase1Days,
    phase2Days: P.phase2Days,
    steps: P.steps.filter((id) => settings.templates.some((t) => t.id === id)),
    debt: debt ? { amount: debt.outstanding, dueDay: Math.max(0, daysBetween(start, debt.dueDate)) } : null,
    livingPerPayout: P.livingPerPayout,
    retryBudget: P.retryBudget,
    debtSharePct: P.debtSharePct,
    reserveFloor: settings.policy.reserveFloor,
    templates: settings.templates,
    accounts: live.slice(0, 1),
    maxTradesPerDay: settings.risk.maxTradesPerDay,
    dailyStopPct: settings.risk.maxDailyLossPct,
    correlation: settings.simulation.crossAccountCorrelation,
    payoutTriggerPct: settings.policy.payoutTriggerPct,
    payoutDelayDays: 3,
    activationDelayDays: 3,
    maxConcurrent: settings.policy.maxConcurrentProp,
    paths: 1000,
    seed: settings.simulation.seed,
  };
  const planRun = runStrategy({ ...base, sampler: { kind: "parametric", winRate: P.winRate, avgWinR: P.avgWinR, avgLossR: P.avgLossR, costR: 0.04 }, riskPct: P.avgRiskPct, tradesPerDay: P.tradesPerDay }, endDay);
  const b = settings.scenarios.base;
  const baseRun = runStrategy({ ...base, sampler: { kind: "parametric", winRate: b.winRate, avgWinR: b.avgWinR, avgLossR: b.avgLossR, costR: b.costR }, riskPct: P.avgRiskPct, tradesPerDay: b.tradesPerDay }, endDay);
  const enough = closed.length >= settings.simulation.minTradesForMonteCarlo;
  const yoursRun = enough ? runStrategy({ ...base, sampler: { kind: "bootstrap", rs: closed.map((t) => t.r) }, riskPct: P.avgRiskPct, tradesPerDay: P.tradesPerDay }, endDay) : null;
  // Roadmap + rotation dates follow a clean target schedule; the sim drives the honest-odds cards only.
  const firstTpl = settings.templates.find((t) => t.id === base.steps[0]) ?? settings.templates[0];
  const deadlines: Record<string, string> = targetDeadlines(start, base.steps, P.payoutsByStep, firstTpl.firstPayoutDays, firstTpl.payoutCycleDays);
  if (planRun.debtFree) {
    deadlines.debt_sim_p50 = planRun.debtFree.p50 ?? "";
    deadlines.debt_sim_p90 = planRun.debtFree.p90 ?? "";
  }
  const requiredR = P.winRate * P.avgWinR - (1 - P.winRate) * P.avgLossR - 0.04;
  return { plan: { ...planRun, deadlines }, base: baseRun, yours: yoursRun, start, endDay, requiredR, enough };
}
