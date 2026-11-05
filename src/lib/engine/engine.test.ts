import { test } from "node:test";
import assert from "node:assert/strict";
import { accountState } from "./accounts";
import { computeWealth } from "./wealth";
import { recommendAllocation, scalingGate } from "./allocation";
import { closedTrades, tradeStats } from "./stats";
import { legs } from "./risk";
import { defaultSettings } from "../settings";
import type { Account, Trade, BalanceEvent, Payout, LedgerEntry } from "@/db/schema";

const s = { ...defaultSettings(), startingCash: 100 };
const acct: Account = {
  id: 1, name: "6K", firm: "FundedNext", kind: "prop", size: 6000, purchasePrice: 59.99, model: "2-Step", payoutModel: "On-Demand",
  stage: "funded", archived: false, profitTargetP1: 8, profitTargetP2: 5, dailyLossPct: 5, maxLossPct: 10, maxLossType: "static",
  minTradingDays: 5, splitPct: 90, payoutMinGrowthPct: 2, bestDayCapPct: 40, maxOpenRiskPct: 3, feeRefundOnFirstPayout: true,
  kycStatus: "approved", rulesVerifiedAt: "2026-10-31", startDate: "2026-11-02", deadline: null, stageStartedAt: "2026-12-01",
  phase1PassedAt: "2026-11-15", phase2PassedAt: "2026-12-01", failedAt: null, failReason: null, notes: null, createdAt: "",
};
let id = 0;
const tr = (day: string, pnl: number, phase = "funded"): Trade => ({
  id: ++id, accountId: 1, phase, status: "closed", openedAt: `${day}T10:00`, closedAt: `${day}T11:00`, instrument: "EURUSD", direction: "buy",
  entry: 1, stop: 0.99, takeProfit: 1.02, exitPrice: 1.01, size: 1, riskAmount: 30, pnl, session: "London", strategy: null, setup: "A", grade: null,
  marketCondition: null, thesis: null, emotion: "Calm", executionQuality: 4, mistakes: "[]", lessons: null, entryShot: null, exitShot: null, checklist: "{}", followedPlan: true, newsWindow: false, createdAt: "",
});

test("funded account: payout eligibility and best-day rule", () => {
  const trades = [tr("2026-12-02", 60), tr("2026-12-03", 50), tr("2026-12-04", 40), tr("2026-12-07", 30), tr("2026-12-07", -20), tr("2026-11-20", 999, "phase2")];
  const st = accountState(acct, trades, [], [], [], s, "2026-12-08");
  assert.equal(st.balance, 6160); // phase2 trade excluded from funded balance
  assert.equal(st.payout!.cycleProfit, 160);
  assert.ok(Math.abs(st.bestDaySharePct! - 37.5) < 1e-9);
  assert.equal(st.payout!.eligible, true); // 2.67% growth, best day 37.5%
  assert.equal(st.payout!.feeRefundDue, 59.99);
  assert.ok(Math.abs(st.payout!.traderShare - 144) < 1e-9);
});

test("best day above 40% blocks payout; payout withdrawal resets the cycle", () => {
  const trades = [tr("2026-12-02", 200), tr("2026-12-03", 20)];
  const st = accountState(acct, trades, [], [], [], s, "2026-12-08");
  assert.equal(st.payout!.eligible, false);
  const ev: BalanceEvent = { id: 1, accountId: 1, phase: "funded", date: "2026-12-04", type: "payout_withdrawal", amount: -220, note: null, payoutId: 1 };
  const after = accountState(acct, [...trades, tr("2026-12-05", 15)], [ev], [], [], s, "2026-12-08");
  assert.equal(after.balance, 6015);
  assert.equal(after.payout!.cycleProfit, 15);
});

test("max loss breach is detected", () => {
  const st = accountState({ ...acct, stage: "phase1" }, [tr("2026-12-02", -350, "phase1"), tr("2026-12-03", -300, "phase1")], [], [], [], s, "2026-12-08");
  assert.ok(st.breaches.some((b) => b.includes("Daily loss")));
  assert.ok(st.breaches.some((b) => b.includes("Maximum loss")));
});

test("wealth counts only received money; funded balance is never wealth", () => {
  const st = accountState(acct, [tr("2026-12-02", 300)], [], [], [], s, "2026-12-08");
  const ledger: LedgerEntry[] = [{ id: 1, date: "2026-11-02", type: "fee", amount: 59.99, accountId: 1, debtId: null, note: null }];
  const payouts: Payout[] = [
    { id: 1, accountId: 1, status: "received", grossProfit: 200, splitPct: 90, requestedAmount: 180, approvedAmount: 180, receivedAmount: 180, feeRefund: 59.99, fees: 5, requestedAt: "2026-12-01", approvedAt: "2026-12-01", receivedAt: "2026-12-02", destination: null, allocation: "{}", notes: null },
    { id: 2, accountId: 1, status: "approved", grossProfit: 100, splitPct: 90, requestedAmount: 90, approvedAmount: 90, receivedAmount: null, feeRefund: 0, fees: 0, requestedAt: "2026-12-05", approvedAt: "2026-12-06", receivedAt: null, destination: null, allocation: "{}", notes: null },
  ];
  const w = computeWealth(s, [st], payouts, ledger);
  assert.equal(w.nominalFunded, 6000);
  assert.ok(Math.abs(w.receivedNet - 234.99) < 1e-9);
  assert.equal(w.approved, 90);
  assert.ok(Math.abs(w.realizedNetWealth - (100 + 234.99 - 59.99)) < 1e-9);
});

test("allocation never exceeds the amount and withholds personal until the gate passes", () => {
  const gate = scalingGate(s, tradeStats(closedTrades([])), [], null);
  assert.equal(gate.passed, false);
  const plan = recommendAllocation(500, 0, s, gate, 1, 6000);
  const total = plan.lines.reduce((a, l) => a + l.amount, 0);
  assert.ok(Math.abs(total - 500) < 1e-6);
  assert.equal(plan.lines.find((l) => l.bucket === "personal")!.amount, 0);
  assert.ok(plan.lines.every((l) => l.amount >= 0));
  assert.ok((plan.challenge?.size ?? 0) <= 25_000);
});

test("currency legs", () => {
  assert.deepEqual(legs("EURUSD", "buy"), [{ ccy: "EUR", sign: 1 }, { ccy: "USD", sign: -1 }]);
  assert.deepEqual(legs("US30", "sell"), [{ ccy: "USD-EQ", sign: -1 }]);
});

test("debt is subtracted from net wealth and payments don't change it", () => {
  const sd = { ...s, startingCash: 1000, debts: [{ id: "d1", name: "Loan", amount: 5000, dueDate: "2026-12-29" }] };
  const before = computeWealth(sd, [], [], []);
  assert.equal(before.debtOutstanding, 5000);
  assert.equal(before.realizedNetWealth, -4000);
  const paid = computeWealth(sd, [], [], [{ id: 1, date: "2026-12-01", type: "debt_payment", amount: 800, accountId: null, debtId: "d1", note: null }]);
  assert.equal(paid.cash, 200);
  assert.equal(paid.debtOutstanding, 4200);
  assert.equal(paid.realizedNetWealth, -4000);
});

import { smartSize, phaseOdds } from "./coach";

test("coach ladder: starts small, grows with profit, caps at max, shrinks and blocks when it should", () => {
  const s25 = { ...s, risk: { ...s.risk, maxRiskPerTradePct: 2.5, baseRiskPct: 1.25, cushionSharePct: 50, maxDailyLossPct: 2.5, maxConsecutiveLosses: 3, minRiskPct: 0.25 } };
  const p1 = { ...acct, stage: "phase1" as const, stageStartedAt: "2026-11-01" };
  const ctx = { settings: s25, consecutiveLosses: 0, kelly: null };
  const fresh = accountState(p1, [], [], [], [], s25, "2026-11-03");
  assert.equal(smartSize(fresh, ctx).amount, 75); // 1.25% of $6K
  const up = accountState(p1, [tr("2026-11-02", 120, "phase1")], [], [], [], s25, "2026-11-03");
  assert.equal(smartSize(up, ctx).amount, 135); // 75 + 50% of 120
  const big = accountState(p1, [tr("2026-11-02", 300, "phase1")], [], [], [], s25, "2026-11-03");
  assert.ok(smartSize(big, ctx).amount <= 150, "never above the 2.5% ceiling");
  const down = accountState(p1, [tr("2026-11-02", -300, "phase1")], [], [], [], s25, "2026-11-03");
  assert.ok(smartSize(down, ctx).amount < 75, "smaller in drawdown");
  assert.equal(smartSize(fresh, { ...ctx, consecutiveLosses: 3 }).amount, 37);
  const stopped = accountState(p1, [tr("2026-11-03", -150, "phase1")], [], [], [], s25, "2026-11-03");
  assert.equal(smartSize(stopped, ctx).blocked, true);
  assert.ok(smartSize(fresh, { ...ctx, kelly: 0 }).amount <= 15, "no edge: minimum size");

  const sampler = { kind: "parametric" as const, winRate: 0.45, avgWinR: 1.8, avgLossR: 1, costR: 0.05 };
  const smart = phaseOdds(fresh, s25, sampler, 1.5, "smart", "2026-11-03")!;
  const max = phaseOdds(fresh, s25, sampler, 1.5, "max", "2026-11-03")!;
  assert.ok(smart.pFail < max.pFail, "ladder fails less than always-max");
});
