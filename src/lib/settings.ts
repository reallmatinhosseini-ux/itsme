import { z } from "zod";

/**
 * Everything in here is an ASSUMPTION or a USER CHOICE, never a measured fact.
 * The UI labels these values as such wherever they feed a calculation.
 */

const FN_SOURCE = "https://help.fundednext.com/en/articles/17255124-stellar-2-step-challenge";

export const templateSchema = z.object({
  id: z.string(),
  firm: z.string(),
  program: z.string(),
  size: z.number().positive(),
  price: z.number().nonnegative(),
  profitTargetP1: z.number(),
  profitTargetP2: z.number(),
  dailyLossPct: z.number(),
  maxLossPct: z.number(),
  maxLossType: z.enum(["static", "trailing"]),
  minTradingDays: z.number().int(),
  splitPct: z.number(),
  payoutMinGrowthPct: z.number(),
  bestDayCapPct: z.number(),
  maxOpenRiskPct: z.number(),
  feeRefundOnFirstPayout: z.boolean(),
  source: z.string(),
  verifiedAt: z.string().nullable(),
  /** Days from funded to the first payout request (0 = on demand once eligible). */
  firstPayoutDays: z.number().default(0),
  /** Days between payouts after the first (0 = on demand). */
  payoutCycleDays: z.number().default(0),
  /** False when the price could not be confirmed on an official page — check at checkout. */
  priceVerified: z.boolean().default(true),
});
export type Template = z.infer<typeof templateSchema>;

const fnStellar = (size: number, price: number): Template => ({
  id: `fn-stellar2-${size / 1000}k`,
  firm: "FundedNext",
  program: "Stellar 2-Step",
  size,
  price,
  profitTargetP1: 8,
  profitTargetP2: 5,
  dailyLossPct: 5,
  maxLossPct: 10,
  maxLossType: "static",
  minTradingDays: 5,
  splitPct: 90,
  payoutMinGrowthPct: 2,
  bestDayCapPct: 40,
  maxOpenRiskPct: 3,
  feeRefundOnFirstPayout: true,
  source: FN_SOURCE,
  verifiedAt: "2026-10-31",
  // Stellar 2-Step: first withdrawal 21 days after funding, then every 14 days (verified against third-party rule guides, Nov 2026 — confirm on FundedNext's own page).
  firstPayoutDays: 21,
  payoutCycleDays: 14,
  priceVerified: true,
});


export const scenarioSchema = z.object({
  label: z.string(),
  winRate: z.number().min(0.05).max(0.95),
  avgWinR: z.number().min(0.1).max(10),
  avgLossR: z.number().min(0.1).max(5),
  /** Friction (spread, commission, slippage) per trade, in R. */
  costR: z.number().min(0).max(1),
  tradesPerDay: z.number().min(0.2).max(10),
  riskPct: z.number().min(0.05).max(3),
  personalReturnRiskPct: z.number().min(0.05).max(3),
  activationDelayDays: z.number().int().min(0).max(60),
  payoutDelayDays: z.number().int().min(0).max(60),
});
export type Scenario = z.infer<typeof scenarioSchema>;

export const settingsSchema = z.object({
  missionName: z.string().default("$50K Challenge"),
  targetAmount: z.number().positive().default(50_000),
  missionStart: z.string().default("2026-11-02"),
  missionEnd: z.string().default("2027-05-02"),
  startingCash: z.number().nonnegative().default(0),
  startingCashConfirmed: z.boolean().default(false),
  timezone: z.string().default("UTC"),
  setupCompleted: z.boolean().default(false),
  /** Real-world obligations. Outstanding debt is subtracted from net wealth and paid before any scaling. */
  debts: z
    .array(z.object({ id: z.string(), name: z.string().min(1), amount: z.number().positive(), dueDate: z.string() }))
    .default([]),
  risk: z
    .object({
      /** Ceiling. The coach sizes each trade at or below this. */
      maxRiskPerTradePct: z.number().default(2.5),
      baseRiskPct: z.number().default(1.25),
      fundedRiskPct: z.number().default(0.75),
      minRiskPct: z.number().default(0.25),
      cushionSharePct: z.number().default(50),
      maxDailyLossPct: z.number().default(2.5),
      maxWeeklyLossPct: z.number().default(5),
      maxTradesPerDay: z.number().int().default(3),
      maxConsecutiveLosses: z.number().int().default(3),
      drawdownWarnPct: z.number().default(60),
      maxCombinedOpenRiskPct: z.number().default(2.5),
      riskEscalationFactor: z.number().default(1.25),
      allowedSessions: z.array(z.string()).default(["London", "New York"]),
      requireChecklist: z.boolean().default(true),
      personalMaxDrawdownPct: z.number().default(10),
    })
    .default({
      maxRiskPerTradePct: 2.5,
      baseRiskPct: 1.25,
      fundedRiskPct: 0.75,
      minRiskPct: 0.25,
      cushionSharePct: 50,
      maxDailyLossPct: 2.5,
      maxWeeklyLossPct: 5,
      maxTradesPerDay: 3,
      maxConsecutiveLosses: 3,
      drawdownWarnPct: 60,
      maxCombinedOpenRiskPct: 2.5,
      riskEscalationFactor: 1.25,
      allowedSessions: ["London", "New York"],
      requireChecklist: true,
      personalMaxDrawdownPct: 10,
    }),
  /** The strategy: account ladder, personal allowance, debt share and the performance the plan needs. */
  plan: z
    .object({
      ladder: z.array(z.number()).default([6000, 50000, 100000]),
      /** Rotation: template ids in buying order. $6K proves the process, then straight to the $50K engine. */
      steps: z.array(z.string()).default(["fn-stellar2-6k", "fn-stellar2-50k", "fn-stellar2-100k"]),
      /** Share of each payout's remainder (after living, next fee and debt) that goes to your own live account, by rotation step. Rises as you move off prop accounts. */
      personalShareByStep: z.array(z.number()).default([25, 35, 45, 60]),
      /** Payouts taken from each account before the rotation moves on, by step. The first account takes one fast payout, then you move on; later accounts take up to two. */
      payoutsByStep: z.array(z.number().int()).default([1, 2, 3, 4]),
      /** Share of every payout taken as living money (kept for back-compat; the engine uses livingPerPayout). */
      livingPct: z.number().default(30),
      /** Flat living amount taken off the top of each payout (e.g. $200 from the first payout), before the remainder is split. */
      livingPerPayout: z.number().default(200),
      /** Daily profit objectives (USD): a minimum worth taking and the preferred/max day. Never forced. */
      dailyMinUsd: z.number().default(80),
      dailyTargetUsd: z.number().default(200),
      phase1Days: z.number().default(7),
      phase2Days: z.number().default(7),
      payoutsPerAccount: z.number().int().default(2),
      personalSharePct: z.number().default(25),
      reinvestSharePct: z.number().default(25),
      personalRiskPct: z.number().default(0.5),
      livingPerMonth: z.number().default(200),
      retryBudget: z.number().default(120),
      debtSharePct: z.number().default(40),
      avgRiskPct: z.number().default(1.5),
      winRate: z.number().default(0.5),
      avgWinR: z.number().default(2),
      avgLossR: z.number().default(1),
      tradesPerDay: z.number().default(1.5),
    })
    .default({
      ladder: [6000, 50000, 100000],
      steps: ["fn-stellar2-6k", "fn-stellar2-50k", "fn-stellar2-100k"],
      personalShareByStep: [25, 45, 60],
      payoutsByStep: [1, 6, 6],
      livingPct: 30, livingPerPayout: 200, dailyMinUsd: 80, dailyTargetUsd: 200,
      phase1Days: 7, phase2Days: 7, payoutsPerAccount: 2, personalSharePct: 25, reinvestSharePct: 25, personalRiskPct: 0.5,
      livingPerMonth: 200, retryBudget: 120, debtSharePct: 40, avgRiskPct: 1.5, winRate: 0.5, avgWinR: 2, avgLossR: 1, tradesPerDay: 1.5,
    }),
  policy: z
    .object({
      /** Request a funded payout once account growth reaches this %. 7% on the $6K lands the first payout near $440 (90% split + the first-payout fee refund). */
      payoutTriggerPct: z.number().default(7),
      /** Accounts you run at once. Once funded, the plan deploys spare payout cash into parallel accounts up to this — the main driver of scale. */
      maxConcurrentProp: z.number().int().default(4),
      /** Never spend more than this % of free cash (above the reserve floor) on one challenge fee. */
      feeBudgetPct: z.number().default(70),
      reserveFloor: z.number().default(150),
      reservePct: z.number().default(30),
      challengePct: z.number().default(30),
      personalPct: z.number().default(30),
      otherPct: z.number().default(10),
      maxFundedAllocation: z.number().default(300_000),
      /** Scaling gate: minimum closed trades before buying a larger challenge. */
      minTradesBeforeScaling: z.number().int().default(30),
      minExecutionScore: z.number().default(70),
    })
    .default({
      payoutTriggerPct: 7,
      maxConcurrentProp: 4,
      feeBudgetPct: 70,
      reserveFloor: 150,
      reservePct: 30,
      challengePct: 30,
      personalPct: 30,
      otherPct: 10,
      maxFundedAllocation: 300_000,
      minTradesBeforeScaling: 30,
      minExecutionScore: 70,
    }),
  simulation: z
    .object({
      paths: z.number().int().min(200).max(10_000).default(2000),
      minTradesForMonteCarlo: z.number().int().min(10).default(30),
      /** Probability that a given trade outcome is shared across accounts traded at the same time. */
      crossAccountCorrelation: z.number().min(0).max(1).default(0.8),
      seed: z.number().int().default(100_000),
    })
    .default({ paths: 2000, minTradesForMonteCarlo: 30, crossAccountCorrelation: 0.8, seed: 100_000 }),
  scenarios: z
    .object({ conservative: scenarioSchema, base: scenarioSchema, optimistic: scenarioSchema })
    .default({
      conservative: {
        label: "Conservative",
        winRate: 0.4,
        avgWinR: 1.7,
        avgLossR: 1,
        costR: 0.05,
        tradesPerDay: 1.2,
        riskPct: 1,
        personalReturnRiskPct: 0.5,
        activationDelayDays: 5,
        payoutDelayDays: 5,
      },
      base: {
        label: "Base case",
        winRate: 0.45,
        avgWinR: 1.8,
        avgLossR: 1,
        costR: 0.05,
        tradesPerDay: 1.5,
        riskPct: 1,
        personalReturnRiskPct: 0.5,
        activationDelayDays: 3,
        payoutDelayDays: 3,
      },
      optimistic: {
        label: "Optimistic",
        winRate: 0.5,
        avgWinR: 2,
        avgLossR: 1,
        costR: 0.04,
        tradesPerDay: 1.5,
        riskPct: 1,
        personalReturnRiskPct: 0.75,
        activationDelayDays: 2,
        payoutDelayDays: 2,
      },
    }),
  templates: z
    .array(templateSchema)
    .default([
      fnStellar(6_000, 59.99),
      fnStellar(15_000, 119.99),
      fnStellar(25_000, 199.99),
      fnStellar(50_000, 240),
      fnStellar(100_000, 549.99),
      fnStellar(200_000, 999.99),
    ]),
  strategies: z.array(z.string()).default(["Trend continuation", "Liquidity sweep reversal", "Range breakout"]),
  mistakeTags: z
    .array(z.string())
    .default([
      "Moved stop",
      "Early exit",
      "Late entry",
      "No setup / impulse",
      "Oversized",
      "Revenge trade",
      "FOMO chase",
      "Ignored news",
      "Outside session",
      "Broke daily stop",
    ]),
  emotions: z.array(z.string()).default(["Calm", "Focused", "Confident", "Hesitant", "Anxious", "Frustrated", "FOMO", "Revenge", "Euphoric", "Tired"]),
});

export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings = (): Settings => settingsSchema.parse({});

/** Emotions treated as high-risk states by the risk engine. */
export const HOT_EMOTIONS = new Set(["Anxious", "Frustrated", "FOMO", "Revenge", "Euphoric", "Tired"]);
export const SESSIONS = ["Asia", "London", "New York", "London/NY overlap", "Off-hours"] as const;
