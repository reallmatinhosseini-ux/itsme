import type { Settings, Template } from "../settings";
import type { TradeStats } from "./stats";
import type { RiskAlert } from "./risk";

export interface ScalingGate {
  passed: boolean;
  checks: { label: string; ok: boolean; detail: string }[];
}

/** Scaling is earned by evidence and discipline, never by a deadline. */
export function scalingGate(settings: Settings, stats: TradeStats, alerts: RiskAlert[], avgScore: number | null): ScalingGate {
  const P = settings.policy;
  const checks = [
    { label: `≥ ${P.minTradesBeforeScaling} closed trades`, ok: stats.n >= P.minTradesBeforeScaling, detail: `${stats.n} logged` },
    {
      label: "Positive expectancy",
      ok: stats.n >= 10 && stats.avgR > 0,
      detail: stats.n ? `${stats.avgR.toFixed(2)}R (95% CI ${fmtCI(stats.expectancyCI)})` : "No data",
    },
    { label: "No critical risk alerts", ok: !alerts.some((a) => a.level === "critical"), detail: `${alerts.filter((a) => a.level === "critical").length} critical` },
    { label: `Execution score ≥ ${P.minExecutionScore}`, ok: avgScore != null && avgScore >= P.minExecutionScore, detail: avgScore == null ? "No scored days" : `${avgScore.toFixed(0)} (last 10 trading days)` },
  ];
  return { passed: checks.every((c) => c.ok), checks };
}

const fmtCI = (ci: [number, number]) => (Number.isFinite(ci[0]) ? `${ci[0].toFixed(2)}…${ci[1].toFixed(2)}R` : "n/a");

export interface AllocationLine {
  bucket: "debt" | "reserve" | "challenge" | "personal" | "other";
  label: string;
  amount: number;
  reason: string;
}

export interface AllocationPlan {
  amount: number;
  lines: AllocationLine[];
  challenge: Template | null;
  gate: ScalingGate;
}

export function recommendAllocation(
  amount: number,
  cashBefore: number,
  settings: Settings,
  gate: ScalingGate,
  activeProp: number,
  nominal: number,
  debt: { outstanding: number; dueDate: string | null } = { outstanding: 0, dueDate: null },
): AllocationPlan {
  const P = settings.policy;
  const lines: AllocationLine[] = [];
  let left = amount;

  // Debt comes first. Cash already on hand counts toward it, so only the gap is taken.
  const debtGap = Math.max(0, debt.outstanding - Math.max(0, cashBefore));
  const toDebt = Math.min(left, debtGap);
  left -= toDebt;
  cashBefore = Math.max(0, cashBefore - debt.outstanding);

  const reserveGap = Math.max(0, P.reserveFloor - cashBefore);
  const topUp = Math.min(left, reserveGap);
  left -= topUp;

  const share = (pct: number) => (left * pct) / 100;
  let challengeAmt = 0;
  let challenge: Template | null = null;
  const canAddAccount = activeProp < P.maxConcurrentProp && debtGap - toDebt <= 0.01;
  if (canAddAccount) {
    // Fee budget is a share of everything above the reserve floor, so a first small payout can still fund the next step.
    const budget = ((cashBefore - P.reserveFloor + amount - topUp) * P.feeBudgetPct) / 100;
    challenge =
      [...settings.templates].filter((t) => t.price <= budget && nominal + t.size <= P.maxFundedAllocation).sort((a, b) => b.size - a.size)[0] ?? null;
    if (challenge && !gate.passed && challenge.size > 25_000) {
      // Until the gate passes, only allow a small "data" challenge, not a scale-up.
      challenge = [...settings.templates].filter((t) => t.price <= budget && t.size <= 25_000).sort((a, b) => b.size - a.size)[0] ?? null;
    }
    challengeAmt = challenge ? Math.min(left, challenge.price) : 0;
  }
  left -= challengeAmt;

  const personalAmt = gate.passed && debtGap - toDebt <= 0.01 ? share(P.personalPct) : 0;
  const otherAmt = share(P.otherPct);
  const reserveAmt = left - personalAmt - otherAmt + topUp;

  if (debt.outstanding > 0)
    lines.push({
      bucket: "debt",
      label: "Debt",
      amount: toDebt,
      reason:
        toDebt > 0
          ? `Goes to the ${usdShort(debt.outstanding)} debt${debt.dueDate ? ` due ${debt.dueDate}` : ""} before anything else. New challenges wait until it is covered.`
          : "Your cash on hand already covers the debt. Keep it set aside.",
    });
  lines.push({
    bucket: "reserve",
    label: "Cash reserve",
    amount: reserveAmt,
    reason:
      (topUp > 0 ? `$${topUp.toFixed(0)} restores the $${P.reserveFloor} reserve floor first. ` : "") +
      (gate.passed ? `Remaining ${P.reservePct}%+ stays liquid for resets and life costs.` : "Scaling gate not yet passed, so the personal-account share is held in reserve instead."),
  });
  lines.push({
    bucket: "challenge",
    label: challenge ? `Next challenge: ${challenge.firm} $${(challenge.size / 1000).toFixed(0)}K` : "Next challenge",
    amount: challengeAmt,
    reason: debtGap - toDebt > 0.01
      ? "Paused until the debt is covered."
      : !canAddAccount
      ? `Already running ${activeProp}/${P.maxConcurrentProp} prop accounts — adding more increases correlated risk, not opportunity.`
      : challenge
        ? `Largest account whose fee fits ${P.feeBudgetPct}% of free cash${gate.passed ? "" : " (capped at $25K until the scaling gate passes)"}. Fee $${challenge.price}.`
        : "No challenge fits the fee budget yet. Keep building the reserve.",
  });
  lines.push({
    bucket: "personal",
    label: "Personal live account",
    amount: personalAmt,
    reason: gate.passed
      ? `${P.personalPct}% of the remainder. Your own capital — trade it at the same or lower risk as prop accounts.`
      : "Withheld: real-money trading should start only after the scaling gate confirms a measured edge.",
  });
  lines.push({ bucket: "other", label: "Other / personal use", amount: otherAmt, reason: `${P.otherPct}% so the mission pays you something along the way — this reduces pressure to over-trade.` });

  return { amount, lines, challenge, gate };
}

const usdShort = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
