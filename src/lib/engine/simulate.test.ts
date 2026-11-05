import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate, type SimInput } from "./simulate";
import { defaultSettings } from "../settings";

const s = defaultSettings();
export function baseInput(sc: keyof typeof s.scenarios): SimInput {
  const p = s.scenarios[sc];
  const t6 = s.templates[0];
  return {
    startDay: "2026-11-02", horizonDays: 181, target: 100_000, cash: 0, personalEquity: 0,
    accounts: [{ ...t6, stage: "phase1", pnl: 0, tradingDays: 0, bestDay: 0, firstPayoutDone: false, activeFrom: 0 }],
    pendingPayouts: [],
    sampler: { kind: "parametric", winRate: p.winRate, avgWinR: p.avgWinR, avgLossR: p.avgLossR, costR: p.costR },
    tradesPerDay: p.tradesPerDay, maxTradesPerDay: 3, riskPct: p.riskPct, personalRiskPct: p.personalReturnRiskPct,
    personalDailyStopPct: 2, correlation: 0.8, activationDelayDays: p.activationDelayDays, payoutDelayDays: p.payoutDelayDays,
    policy: { payoutTriggerPct: 4, maxConcurrentProp: 3, feeBudgetPct: 40, reserveFloor: 300, personalPct: 30, maxFundedAllocation: 300_000, requirePayoutBeforeScaling: true },
    templates: s.templates, paths: 1000, seed: 7,
  };
}

test("simulation is deterministic and sane", () => {
  for (const sc of ["conservative", "base", "optimistic"] as const) {
    const r = simulate(baseInput(sc));
    const r2 = simulate(baseInput(sc));
    assert.equal(r.probability, r2.probability);
    assert.ok(r.probability >= 0 && r.probability <= 1);
    console.log(sc, JSON.stringify({ E: r.expectancyR.toFixed(2), P: r.probability, pass: r.evalPassRate?.toFixed(2), p50: Math.round(r.final.p50), p95: Math.round(r.final.p95), fees: r.feesMedian, funded: r.medianDaysToFunded, payout: r.medianDaysToFirstPayout, ruin: r.ruinProbability }));
  }
});

test("losing every trade never reaches the target", () => {
  const i = baseInput("base");
  i.sampler = { kind: "bootstrap", rs: [-1, -1, -1] };
  const r = simulate(i);
  assert.equal(r.probability, 0);
  assert.equal(r.evalPassRate, 0);
});
