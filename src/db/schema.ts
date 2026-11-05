import { sqliteTable, integer, real, text } from "drizzle-orm/sqlite-core";

/** Single-row JSON settings document (validated by zod in lib/settings.ts). */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  json: text("json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Every trading account: prop evaluations/funded accounts and personal live accounts.
 * Prop rule fields are copied from the template at creation so a firm changing its
 * rules later never silently rewrites history.
 */
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  firm: text("firm").notNull(),
  kind: text("kind", { enum: ["prop", "personal"] }).notNull(),
  size: real("size").notNull(),
  purchasePrice: real("purchase_price").notNull().default(0),
  model: text("model").notNull().default("2-Step"),
  payoutModel: text("payout_model").notNull().default("On-Demand"),
  stage: text("stage", { enum: ["phase1", "phase2", "funded", "failed", "live"] }).notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  profitTargetP1: real("profit_target_p1").notNull().default(8),
  profitTargetP2: real("profit_target_p2").notNull().default(5),
  dailyLossPct: real("daily_loss_pct").notNull().default(5),
  maxLossPct: real("max_loss_pct").notNull().default(10),
  maxLossType: text("max_loss_type", { enum: ["static", "trailing"] }).notNull().default("static"),
  minTradingDays: integer("min_trading_days").notNull().default(5),
  splitPct: real("split_pct").notNull().default(90),
  payoutMinGrowthPct: real("payout_min_growth_pct").notNull().default(2),
  bestDayCapPct: real("best_day_cap_pct").notNull().default(40),
  maxOpenRiskPct: real("max_open_risk_pct").notNull().default(3),
  feeRefundOnFirstPayout: integer("fee_refund", { mode: "boolean" }).notNull().default(true),
  kycStatus: text("kyc_status", { enum: ["not_started", "pending", "approved", "n/a"] }).notNull().default("not_started"),
  rulesVerifiedAt: text("rules_verified_at"),
  startDate: text("start_date").notNull(),
  deadline: text("deadline"),
  stageStartedAt: text("stage_started_at").notNull(),
  phase1PassedAt: text("phase1_passed_at"),
  phase2PassedAt: text("phase2_passed_at"),
  failedAt: text("failed_at"),
  failReason: text("fail_reason"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const trades = sqliteTable("trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull(),
  /** Stage the account was in when the trade was taken; balances are per stage. */
  phase: text("phase").notNull(),
  status: text("status", { enum: ["open", "closed"] }).notNull(),
  openedAt: text("opened_at").notNull(),
  closedAt: text("closed_at"),
  instrument: text("instrument").notNull(),
  direction: text("direction", { enum: ["buy", "sell"] }).notNull(),
  entry: real("entry").notNull(),
  stop: real("stop"),
  takeProfit: real("take_profit"),
  exitPrice: real("exit_price"),
  size: real("size").notNull(),
  riskAmount: real("risk_amount").notNull(),
  pnl: real("pnl"),
  session: text("session"),
  strategy: text("strategy"),
  setup: text("setup"),
  /** Your own grade of the setup's quality (A+, A, B, C) — the reason behind your size choice. */
  grade: text("grade"),
  marketCondition: text("market_condition"),
  thesis: text("thesis"),
  emotion: text("emotion"),
  executionQuality: integer("execution_quality"),
  mistakes: text("mistakes").notNull().default("[]"),
  lessons: text("lessons"),
  entryShot: text("entry_shot"),
  exitShot: text("exit_shot"),
  checklist: text("checklist").notNull().default("{}"),
  followedPlan: integer("followed_plan", { mode: "boolean" }),
  newsWindow: integer("news_window", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

/** Non-trade balance changes on an account (commissions, swaps, corrections, payout withdrawals). */
export const balanceEvents = sqliteTable("balance_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull(),
  phase: text("phase").notNull(),
  date: text("date").notNull(),
  type: text("type", { enum: ["commission", "swap", "correction", "payout_withdrawal", "deposit", "withdrawal"] }).notNull(),
  amount: real("amount").notNull(),
  note: text("note"),
  payoutId: integer("payout_id"),
});

export const payouts = sqliteTable("payouts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull(),
  status: text("status", { enum: ["requested", "approved", "received", "rejected"] }).notNull(),
  /** Account profit withdrawn from the funded balance (before split). */
  grossProfit: real("gross_profit").notNull(),
  splitPct: real("split_pct").notNull(),
  requestedAmount: real("requested_amount").notNull(),
  approvedAmount: real("approved_amount"),
  receivedAmount: real("received_amount"),
  feeRefund: real("fee_refund").notNull().default(0),
  fees: real("fees").notNull().default(0),
  requestedAt: text("requested_at").notNull(),
  approvedAt: text("approved_at"),
  receivedAt: text("received_at"),
  destination: text("destination"),
  allocation: text("allocation").notNull().default("{}"),
  notes: text("notes"),
});

/** Personal cash movements that are not payouts. Transfers move cash to/from a personal trading account. */
export const ledger = sqliteTable("ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  type: text("type", { enum: ["fee", "refund", "expense", "income", "transfer_to_personal", "transfer_from_personal", "debt_payment"] }).notNull(),
  amount: real("amount").notNull(),
  accountId: integer("account_id"),
  debtId: text("debt_id"),
  note: text("note"),
});

export const dailyLogs = sqliteTable("daily_logs", {
  date: text("date").primaryKey(),
  bias: text("bias"),
  plan: text("plan"),
  keyLevels: text("key_levels"),
  events: text("events"),
  maxRisk: real("max_risk"),
  objective: text("objective"),
  sessions: text("sessions").notNull().default("[]"),
  readiness: integer("readiness"),
  preChecklist: text("pre_checklist").notNull().default("{}"),
  review: text("review"),
  mistakes: text("mistakes"),
  emotionalReview: text("emotional_review"),
  tomorrow: text("tomorrow"),
  selfScore: integer("self_score"),
  screenshots: text("screenshots").notNull().default("[]"),
  planCompletedAt: text("plan_completed_at"),
  reviewCompletedAt: text("review_completed_at"),
});

export const dailyTrack = sqliteTable("daily_track", {
  date: text("date").primaryKey(),
  pnl: real("pnl").notNull().default(0),
  noTrade: integer("no_trade").notNull().default(0),
  note: text("note"),
});

export type Account = typeof accounts.$inferSelect;
export type Trade = typeof trades.$inferSelect;
export type BalanceEvent = typeof balanceEvents.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type LedgerEntry = typeof ledger.$inferSelect;
export type DailyLog = typeof dailyLogs.$inferSelect;
