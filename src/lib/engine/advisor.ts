import type { DailyLog } from "@/db/schema";
import type { Settings } from "../settings";
import type { AccountState } from "./accounts";
import type { ScalingGate } from "./allocation";
import type { RiskAlert } from "./risk";
import type { TradeStats } from "./stats";
import type { MissionClock, Wealth } from "./wealth";
import { isWeekday } from "./util";

export interface Action {
  id: string;
  priority: number;
  title: string;
  reason: string;
  data: string[];
  downside: string;
  impact: string;
  confidence: "High" | "Medium" | "Low";
  href: string;
}

interface AdvisorInput {
  settings: Settings;
  states: AccountState[];
  stats: TradeStats;
  alerts: RiskAlert[];
  probability: number | null;
  clock: MissionClock;
  gate: ScalingGate;
  todayLog: DailyLog | undefined;
  today: string;
  wealth: Wealth;
  /** 90% date the debt is fully repaid from payouts, from the strategy simulator. */
  debtRepaidBy: string | null;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function nextActions(x: AdvisorInput): Action[] {
  const A: Action[] = [];
  const live = x.states.filter((s) => !s.account.archived && s.account.stage !== "failed");
  const props = live.filter((s) => s.isProp);
  const critical = x.alerts.filter((a) => a.level === "critical");

  if (critical.length)
    A.push({
      id: "stop",
      priority: 100,
      title: "Stop trading for today",
      reason: critical[0].title,
      data: critical.map((c) => c.detail),
      downside: "You may miss a valid setup today.",
      impact: "Protects the account — a breached prop account ends that branch of the mission and costs the fee plus the time already invested.",
      confidence: "High",
      href: "/risk",
    });

  for (const d of x.wealth.debts.filter((d) => d.outstanding > 0)) {
    const cash = Math.max(0, x.wealth.cash);
    if (cash >= d.outstanding)
      A.push({
        id: `debt-${d.id}`,
        priority: 60,
        title: `Clear the last ${usd(d.outstanding)} of the ${d.name.toLowerCase()}`,
        reason: "Your cash now covers it. Pay it off and record it, so it stops counting against your net worth.",
        data: [`Outstanding ${usd(d.outstanding)} · cash ${usd(cash)}`],
        downside: "None.",
        impact: "The debt is gone and more of each payout moves to your own account.",
        confidence: "High",
        href: "/money",
      });
    else
      A.push({
        id: `debt-${d.id}`,
        priority: 55,
        title: `Keep repaying the ${d.name.toLowerCase()} from payouts`,
        reason: "The debt is paid from payouts first — it takes the biggest share until it's gone. Record each repayment as it happens.",
        data: [
          `Repaid ${usd(d.paid)} of ${usd(d.amount)} · ${usd(d.outstanding)} left`,
          x.debtRepaidBy ? `On track to be fully repaid by ${x.debtRepaidBy} in 9 of 10 runs` : "Clears as payouts come in",
        ],
        downside: "None — this comes out of trading profit, not your own pocket.",
        impact: "Removes the debt, then frees up payout money for your personal account.",
        confidence: "High",
        href: "/money",
      });
  }

  if (!x.states.length)
    A.push({
      id: "first-account",
      priority: 95,
      title: "Add your $6K FundedNext challenge when you buy it",
      reason: "The mission has no accounts yet, so nothing can be measured.",
      data: ["Stellar 2-Step $6K: 8% / 5% targets, 5% daily loss, 10% static max loss, 5 min. trading days per phase (verified 31 Oct 2026, official help centre)."],
      downside: "None — this is bookkeeping.",
      impact: "Unlocks rule tracking, payout eligibility and all projections.",
      confidence: "High",
      href: "/challenges",
    });

  if (!x.settings.startingCashConfirmed)
    A.push({
      id: "cash",
      priority: 90,
      title: "Confirm your starting cash",
      reason: "Realized net wealth starts from your actual cash. It is currently an unconfirmed $" + x.settings.startingCash + ".",
      data: ["Only money you can withdraw counts toward your goal. Prop balances never do."],
      downside: "None.",
      impact: "Makes the goal %, required pace and probability meaningful.",
      confidence: "High",
      href: "/settings",
    });

  for (const s of props) {
    if (s.transition)
      A.push({
        id: `transition-${s.account.id}`,
        priority: 85,
        title: s.transition === "ready_phase2" ? `${s.account.name}: Phase 1 target reached — confirm and start Phase 2` : `${s.account.name}: Phase 2 passed — start KYC and await funded credentials`,
        reason: `Profit ${s.profitPct.toFixed(2)}% vs ${s.targetPct}% target, ${s.tradingDays} trading days.`,
        data: ["Confirm with the firm dashboard before changing stage here.", "FundedNext: KYC must be approved within 30 days of passing or the account can be deactivated."],
        downside: "Continuing to trade a passed phase only adds risk with no benefit.",
        impact: "Moves the mission to the next stage.",
        confidence: "High",
        href: "/challenges",
      });
    if (s.payout?.eligible)
      A.push({
        id: `payout-${s.account.id}`,
        priority: 80,
        title: `Evaluate a payout on ${s.account.name}`,
        reason: "All payout conditions tracked here are met.",
        data: [`Cycle profit ${usd(s.payout.cycleProfit)} → your share ${usd(s.payout.traderShare)} at ${s.account.splitPct}%`, s.payout.feeRefundDue ? `Plus fee refund ${usd(s.payout.feeRefundDue)} on first payout` : "No fee refund pending", "Re-check eligibility on the firm dashboard before requesting."],
        downside: "Withdrawing resets the balance to the starting level, removing your profit buffer above the max-loss floor.",
        impact: "Converts paper profit into real, mission-counting money.",
        confidence: "Medium",
        href: "/payouts",
      });
    if ((s.account.stage === "phase2" || s.account.stage === "funded") && s.account.kycStatus !== "approved")
      A.push({
        id: `kyc-${s.account.id}`,
        priority: 72,
        title: `Complete KYC for ${s.account.name}`,
        reason: `KYC status: ${s.account.kycStatus.replace("_", " ")}. No payout is possible without approval.`,
        data: ["Accepted: national ID, passport or residence permit; proof of address may be requested.", "Check that payout methods are available in your country."],
        downside: "None.",
        impact: "Removes the most common reason a passed account cannot pay out.",
        confidence: "High",
        href: "/accounts",
      });
    if (!s.account.rulesVerifiedAt)
      A.push({
        id: `verify-${s.account.id}`,
        priority: 65,
        title: `Verify the rules for ${s.account.name}`,
        reason: "The account rules have not been confirmed against your actual purchase.",
        data: ["Rules, prices and payout options change; the option chosen at checkout cannot be changed later."],
        downside: "A few minutes of reading.",
        impact: "Prevents trading against rules you don't actually have.",
        confidence: "High",
        href: "/challenges",
      });
  }

  const streakAlert = x.alerts.find((a) => a.code === "streak" || a.code === "escalation" || a.code === "revenge");
  if (streakAlert && !critical.length)
    A.push({
      id: "review-risk",
      priority: 75,
      title: "Review risk exposure before the next trade",
      reason: streakAlert.title,
      data: [streakAlert.detail],
      downside: "Slower pace for a day or two.",
      impact: "Breaks the loss → larger size → larger loss sequence that ends most challenges.",
      confidence: "High",
      href: "/risk",
    });

  if (x.stats.n >= x.settings.simulation.minTradesForMonteCarlo && x.stats.expectancyCI[1] < 0)
    A.push({
      id: "pause",
      priority: 88,
      title: "Pause challenge progression",
      reason: "Your measured expectancy is negative with 95% confidence.",
      data: [`${x.stats.n} trades, expectancy ${x.stats.avgR.toFixed(2)}R (CI ${x.stats.expectancyCI[0].toFixed(2)}…${x.stats.expectancyCI[1].toFixed(2)}R)`],
      downside: "Time passes without progress toward the goal.",
      impact: "Buying more challenges with a negative edge only buys more losses. Fix the edge on the smallest account or in a demo first.",
      confidence: "High",
      href: "/insights",
    });

  if (isWeekday(x.today) && !x.todayLog?.planCompletedAt && live.length)
    A.push({
      id: "plan",
      priority: 60,
      title: "Complete today's trading plan",
      reason: "No plan has been logged for today.",
      data: ["Bias, key levels, events and max risk — five minutes."],
      downside: "None.",
      impact: "Plan completion is 15% of the daily execution score and the base of trade-by-trade accountability.",
      confidence: "High",
      href: "/daily",
    });

  if (x.stats.n < x.settings.simulation.minTradesForMonteCarlo && live.length)
    A.push({
      id: "collect",
      priority: 50,
      title: "Keep collecting performance data at fixed risk",
      reason: `${x.stats.n}/${x.settings.simulation.minTradesForMonteCarlo} closed trades logged — not enough to estimate your edge.`,
      data: [`Risk per trade ${x.settings.risk.maxRiskPerTradePct}%, every trade fully journaled.`],
      downside: "Projections remain assumption-based until then.",
      impact: "Unlocks the data-driven probability of success and the scaling gate.",
      confidence: "High",
      href: "/journal",
    });

  if (x.probability != null && x.probability < 0.1 && x.clock.elapsedDays > 14)
    A.push({
      id: "timeline",
      priority: 55,
      title: "Reassess the financial timeline",
      reason: `The data-driven probability of reaching ${usd(x.settings.targetAmount)} by ${x.settings.missionEnd} is ${(x.probability * 100).toFixed(0)}%.`,
      data: [`Required pace now ${usd(x.clock.requiredPerWeek)}/week vs actual ${usd(x.clock.actualPerWeek)}/week.`, "Increasing risk to close the gap raises the failure rate faster than it raises returns — the model shows this in Financial Planning."],
      downside: "Accepting a longer timeline.",
      impact: "Keeps the process intact so the same edge can compound past the deadline.",
      confidence: "Medium",
      href: "/planning",
    });

  if (x.gate.passed && props.length < x.settings.policy.maxConcurrentProp && props.some((p) => p.account.stage === "funded"))
    A.push({
      id: "scale",
      priority: 45,
      title: "Scaling gate passed — consider the next challenge",
      reason: "Evidence, risk and discipline checks all pass.",
      data: x.gate.checks.map((c) => `${c.label}: ${c.detail}`),
      downside: "Another account adds correlated exposure and another fee at risk.",
      impact: "Adds funded capacity once the next payout funds it.",
      confidence: "Medium",
      href: "/payouts",
    });

  if (!A.length)
    A.push({
      id: "execute",
      priority: 10,
      title: "Execute the plan — nothing needs changing",
      reason: "No alerts, no pending decisions.",
      data: [],
      downside: "None.",
      impact: "Consistency is the edge.",
      confidence: "High",
      href: "/daily",
    });

  return A.sort((a, b) => b.priority - a.priority);
}
