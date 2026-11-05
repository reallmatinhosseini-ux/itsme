import type { Payout } from "@/db/schema";
import type { Settings } from "../settings";
import type { AccountState } from "./accounts";
import type { Wealth, MissionClock } from "./wealth";
import type { DailyLog } from "@/db/schema";
import { addDays, daysBetween, sum } from "./util";

/**
 * The roadmap: the mission broken into stages, each with a target window, exit criteria,
 * live progress and a net-worth checkpoint. Target dates are the plan you commit to —
 * the model's estimate is shown separately so the plan never pretends to be a forecast.
 */
export type StageStatus = "done" | "current" | "upcoming" | "late";

export interface StageMetric {
  label: string;
  value: string;
  target: string;
  pct: number; // 0-100
}

export interface Stage {
  id: string;
  n: number;
  title: string;
  short: string;
  why: string;
  start: string;
  end: string;
  status: StageStatus;
  progress: number; // 0-1
  doneAt: string | null;
  checkpoint: number | null; // target net worth at the end of the stage
  metrics: StageMetric[];
  tasks: { label: string; done: boolean }[];
  needs: string[];
  parallel?: boolean;
  /** A hard real-world date (the debt). Part of the main path, shown with a flag. */
  deadline?: boolean;
}

export interface Roadmap {
  stages: Stage[];
  current: Stage;
  overall: number; // 0-1, share of the path completed
  daysLeft: number;
  nextDeadline: { stage: Stage; days: number };
}

interface Input {
  settings: Settings;
  states: AccountState[];
  payouts: Payout[];
  wealth: Wealth;
  clock: MissionClock;
  logs: DailyLog[];
  today: string;
  /** 90%-confidence dates from the strategy simulator, keyed by milestone. */
  deadlines?: Record<string, string | null>;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (v: number, t: number) => (t <= 0 ? 0 : Math.max(0, Math.min(100, (v / t) * 100)));

export function buildRoadmap({ settings: s, states, payouts, wealth, clock, logs, today, deadlines }: Input): Roadmap {
  const S = s.missionStart;
  const total = Math.max(1, daysBetween(S, s.missionEnd));
  const at = (frac: number) => addDays(S, Math.round(total * frac));
  const risk$ = (size: number) => (size * s.risk.maxRiskPerTradePct) / 100;

  const props = states.filter((x) => x.isProp);
  const small = props.filter((x) => x.account.size < 25_000).sort((a, b) => b.account.createdAt.localeCompare(a.account.createdAt));
  const smallLive = small.find((x) => x.account.stage !== "failed" && !x.account.archived) ?? small[0];
  const big = props.filter((x) => x.account.size >= 25_000).sort((a, b) => b.account.createdAt.localeCompare(a.account.createdAt));
  const bigLive = big.find((x) => x.account.stage !== "failed" && !x.account.archived) ?? big[0];
  const received = payouts.filter((p) => p.status === "received").sort((a, b) => (a.receivedAt ?? "").localeCompare(b.receivedAt ?? ""));
  const bigReceived = received.filter((p) => big.some((b) => b.account.id === p.accountId));
  const receivedNet = (ps: Payout[]) => sum(ps.map((p) => (p.receivedAmount ?? 0) + p.feeRefund - p.fees));

  const tpl6 = s.templates.find((t) => t.size === 6000) ?? s.templates[0];
  const size6 = smallLive?.account.size ?? tpl6.size;
  const tpl50 = s.templates.find((t) => t.size === 50_000) ?? s.templates[s.templates.length - 1];
  const size50 = bigLive?.account.size ?? tpl50.size;

  const stages: Omit<Stage, "status" | "n">[] = [];

  const dl = (key: string, fallback: string) => deadlines?.[key] ?? fallback;
  const avg = s.plan.avgRiskPct;
  const trigger = s.policy.payoutTriggerPct;
  /** Payouts each account takes before moving on (first account one fast payout, later two). */
  const payoutsFor = (i: number) => s.plan.payoutsByStep[Math.min(i, s.plan.payoutsByStep.length - 1)] ?? s.plan.payoutsPerAccount;

  // 1 — Foundation
  const verified = !!smallLive?.account.rulesVerifiedAt;
  const planned = logs.some((l) => l.planCompletedAt);
  const f = [
    { label: "Mission set up", done: s.setupCompleted },
    { label: "FundedNext $6K challenge added", done: !!smallLive },
    { label: "Rules checked against your purchase", done: verified },
    { label: "First daily plan written", done: planned },
  ];
  stages.push({
    id: "foundation", title: "Foundation", short: "Set up", why: "Know the exact rules and your limits before the first trade. Most failed challenges are rule surprises.",
    start: S, end: addDays(S, 2), progress: f.filter((t) => t.done).length / f.length, doneAt: f.every((t) => t.done) ? (smallLive?.account.startDate ?? S) : null,
    checkpoint: null, metrics: [], tasks: f,
    needs: [
      `You choose the risk on every trade (ceiling ${s.risk.maxRiskPerTradePct}%). The deadlines assume about ${avg}% on average`,
      `Firm limits on $6K: ${usd((size6 * 5) / 100)} a day, ${usd((size6 * 10) / 100)} total`,
      `Your own daily stop: ${usd((size6 * s.risk.maxDailyLossPct) / 100)} · max ${s.risk.maxTradesPerDay} trades`,
    ],
  });

  // 2 & 3 — $6K phases
  for (const phase of [1, 2] as const) {
    const key = `phase${phase}` as const;
    const target = phase === 1 ? smallLive?.account.profitTargetP1 ?? tpl6.profitTargetP1 : smallLive?.account.profitTargetP2 ?? tpl6.profitTargetP2;
    const minDays = smallLive?.account.minTradingDays ?? tpl6.minTradingDays;
    const passedAt = phase === 1 ? smallLive?.account.phase1PassedAt ?? null : smallLive?.account.phase2PassedAt ?? null;
    const inStage = smallLive?.account.stage === key;
    const profit$ = inStage ? Math.max(0, smallLive!.profit) : passedAt ? (size6 * target) / 100 : 0;
    const days = inStage ? smallLive!.tradingDays : passedAt ? minDays : 0;
    const need$ = (size6 * target) / 100;
    const end = phase === 1 ? dl("p1_0", at(0.17)) : dl("p2_0", at(0.29));
    stages.push({
      id: `six-${key}`, title: `$6K · Phase ${phase}`, short: `Phase ${phase}`,
      why: phase === 1 ? "Prove the process under real rules with only $60 at stake." : "Same rules, smaller target. Consistency, not speed.",
      start: phase === 1 ? S : dl("p1_0", at(0.17)), end,
      progress: passedAt ? 1 : 0.7 * pct(profit$, need$) / 100 + 0.3 * pct(days, minDays) / 100, doneAt: passedAt,
      checkpoint: null,
      metrics: [
        { label: "Profit", value: usd(profit$), target: `${usd(need$)} (${target}%)`, pct: pct(profit$, need$) },
        { label: "Trading days", value: String(days), target: `${minDays} minimum`, pct: pct(days, minDays) },
        ...(inStage ? [{ label: "Max-loss used", value: `${Math.round(smallLive!.drawdownUsedPct)}%`, target: "stay under 60%", pct: smallLive!.drawdownUsedPct }] : []),
      ],
      tasks: [
        { label: `Reach +${target}% (${usd(need$)})`, done: profit$ >= need$ },
        { label: `Trade on at least ${minDays} days`, done: days >= minDays },
        { label: "No daily-loss or max-loss breach", done: !(inStage && smallLive!.breaches.length) },
        { label: "Firm confirms the pass", done: !!passedAt },
      ],
      needs: [
        `${usd(need$)} = about ${Math.ceil(need$ / ((size6 * avg) / 100))}R at ${avg}% average risk`,
        `Your speed target: Phase ${phase} in ${phase === 1 ? s.plan.phase1Days : s.plan.phase2Days} days. The 90% deadline is ${end}`,
        "Failed? Re-buy the $6K from the retry budget the same week",
      ],
    });
  }

  // Debt — a hard real-world date inside the challenge
  for (const d of wealth.debts) {
    const simP50 = deadlines?.debt_sim_p50 || null;
    const simP90 = deadlines?.debt_sim_p90 || null;
    stages.push({
      id: `debt-${d.id}`, title: `Clear the ${usd(d.amount)} debt`, short: "Debt", deadline: true,
      why: `Part of the challenge, paid from trading — no outside money. From the first payout on, the debt takes ${s.plan.debtSharePct}% of what's left after your living share and the next account fee, alongside your own account and the next challenge.`,
      start: S, end: d.dueDate, progress: d.paid / d.amount, doneAt: d.outstanding <= 0 ? (simP50 || d.dueDate) : null,
      checkpoint: 0,
      metrics: [
        { label: "Repaid", value: usd(d.paid), target: usd(d.amount), pct: pct(d.paid, d.amount) },
        { label: "Still open", value: usd(d.outstanding), target: usd(0), pct: 100 - pct(d.outstanding, d.amount) },
      ],
      tasks: [
        { label: "First payout received — debt repayment starts", done: received.length > 0 },
        { label: `A quarter repaid (${usd(d.amount / 4)})`, done: d.paid >= d.amount / 4 },
        { label: `Half repaid (${usd(d.amount / 2)})`, done: d.paid >= d.amount / 2 },
        { label: "Fully repaid", done: d.outstanding <= 0 },
      ],
      needs: [
        `${usd(Math.max(0, d.outstanding))} still to repay · ${s.plan.debtSharePct}% of each payout's remainder, from the first payout on`,
        `Due ${d.dueDate} — your fixed marker. Trading can't clear it that fast: only part is covered by then, since living and scaling come first.`,
        simP90
          ? `Realistic clear from trading: typically ${simP50}, and ${simP90} in 9 of 10 runs — taking ${usd(s.plan.livingPerPayout)} for living each payout slows it. This is why the ${d.dueDate} date can't come from trading alone.`
          : "Repaid as payouts come in",
      ],
    });
  }

  // First payout
  const smallFunded = !!smallLive?.account.phase2PassedAt;
  const firstSmall = received.find((p) => small.some((x) => x.account.id === p.accountId));
  const kyc = smallLive?.account.kycStatus === "approved";
  const cycle = smallLive?.account.stage === "funded" ? Math.max(0, smallLive.payout?.cycleProfit ?? 0) : 0;
  const payEnd = dl("payout1_0", at(0.38));
  const firstPayout$ = (size6 * trigger) / 100 * (tpl6.splitPct / 100) + tpl6.price;
  const nextTpl = s.templates.find((t) => t.id === s.plan.steps[1]) ?? s.templates.find((t) => t.size === (s.plan.ladder[1] ?? 25000));
  stages.push({
    id: "six-payout", title: "$6K · first payout, then move on", short: "First payout",
    why: `The first real money from trading: about ${usd(firstPayout$)} by ${dl("payout1_0", "—")} (the ${trigger}% split plus the ${usd(tpl6.price)} fee refund). Take one payout, then rotate straight to the ${nextTpl ? `$${nextTpl.size / 1000}K` : "next account"} — this one trades about a week.`,
    start: dl("p2_0", at(0.29)), end: payEnd, progress: firstSmall ? 1 : smallFunded ? 0.2 + 0.2 * (kyc ? 1 : 0) + 0.6 * pct(cycle, (size6 * trigger) / 100) / 100 : 0, doneAt: firstSmall?.receivedAt ?? null,
    checkpoint: null,
    metrics: [
      { label: "Funded profit", value: usd(cycle), target: `${usd((size6 * trigger) / 100)} (${trigger}%)`, pct: pct(cycle, (size6 * trigger) / 100) },
      { label: "First payout", value: usd(receivedNet(firstSmall ? [firstSmall] : [])), target: usd(firstPayout$), pct: firstSmall ? 100 : 0 },
    ],
    tasks: [
      { label: "Account funded", done: smallFunded },
      { label: "KYC approved", done: kyc },
      { label: `Grow ${trigger}% with no single day over 40% of profit`, done: !!smallLive?.payout?.eligible || !!firstSmall },
      { label: "Payout received, then move on", done: !!firstSmall },
    ],
    needs: [
      `Request at ${trigger}%: ${usd((size6 * trigger) / 100 * (tpl6.splitPct / 100))} + ${usd(tpl6.price)} refund ≈ ${usd(firstPayout$)}`,
      `Every payout, including this one: ${usd(s.plan.livingPerPayout)} to living, the next ${nextTpl ? `$${nextTpl.size / 1000}K` : "challenge"} fee, then the rest splits between debt, your own account, and more challenges.`,
    ],
  });

  // The rotation: each next firm/account, bought from payouts, two payouts each.
  s.plan.steps.forEach((id, idx) => {
    if (idx === 0) return;
    const t = s.templates.find((x) => x.id === id);
    if (!t) return;
    const acc = props.filter((x) => x.account.firm === t.firm && x.account.size === t.size).sort((a, b) => b.account.createdAt.localeCompare(a.account.createdAt));
    const al = acc.find((x) => x.account.stage !== "failed" && !x.account.archived) ?? acc[0];
    const p1 = al?.account.phase1PassedAt ?? null, p2 = al?.account.phase2PassedAt ?? null;
    const pays = received.filter((p) => acc.some((a) => a.account.id === p.accountId));
    const prof = al && (al.account.stage === "phase1" || al.account.stage === "phase2") ? Math.max(0, al.profit) : 0;
    const tg = al?.targetPct ?? t.profitTargetP1;
    const payout = (t.size * trigger) / 100 * (t.splitPct / 100);
    const nPay = payoutsFor(idx);
    const lastKey = nPay >= 2 ? `payout2_${idx}` : `payout1_${idx}`;
    stages.push({
      id: `step-${idx}`, title: `${t.firm} $${t.size / 1000}K`, short: `${t.firm === "FundedNext" ? "FN" : t.firm} $${t.size / 1000}K`,
      why: `Buy from payout money (${usd(t.price)}${t.priceVerified ? "" : ", check the price at checkout"}). Pass, take ${nPay === 1 ? "one payout" : `${nPay} payouts`} of about ${usd(payout)}, move on. Each payout splits three ways: debt, the next challenge, and your real account.`,
      start: dl(`buy_${idx}`, at(0.42)), end: dl(lastKey, dl(`payout1_${idx}`, dl(`p2_${idx}`, at(0.86)))),
      progress: Math.min(1, (al ? 0.1 : 0) + (p1 ? 0.25 : 0.25 * pct(prof, (t.size * tg) / 100) / 100) + (p2 ? 0.25 : 0) + 0.4 * Math.min(1, pays.length / nPay)),
      doneAt: pays.length >= nPay ? pays[pays.length - 1].receivedAt : null,
      checkpoint: null,
      metrics: al && !p2 ? [{ label: p1 ? "Phase 2 profit" : "Phase 1 profit", value: usd(prof), target: usd((t.size * tg) / 100), pct: pct(prof, (t.size * tg) / 100) }] : [],
      tasks: [
        { label: `Buy by ${dl(`buy_${idx}`, "—")}`, done: !!al },
        { label: `Phase 1 +${t.profitTargetP1}% (${usd((t.size * t.profitTargetP1) / 100)}) by ${dl(`p1_${idx}`, "—")}`, done: !!p1 },
        { label: `Funded by ${dl(`p2_${idx}`, "—")}`, done: !!p2 },
        { label: `Payout 1 by ${dl(`payout1_${idx}`, "—")}`, done: pays.length >= 1 },
        ...(nPay >= 2 ? [{ label: `Payout 2 by ${dl(`payout2_${idx}`, "—")}`, done: pays.length >= 2 }] : []),
      ],
      needs: [`${t.profitTargetP1}% / ${t.profitTargetP2}% targets · ${t.dailyLossPct}% daily · ${t.maxLossPct}% max · ${t.minTradingDays} min days`, `About ${usd(payout)} per payout at ${trigger}% (${t.splitPct}% split)`],
    });
  });

  // Goal
  stages.push({
    id: "goal", title: `${usd(s.targetAmount)} net worth`, short: "Goal",
    why: "The stretch target. The deadlines above are what you hold yourself to; this is where they lead if the edge holds.",
    start: at(0.86), end: s.missionEnd, progress: Math.max(0, Math.min(1, clock.goalPct / 100)), doneAt: wealth.realizedNetWealth >= s.targetAmount ? today : null,
    checkpoint: s.targetAmount,
    metrics: [{ label: "Net worth", value: usd(wealth.realizedNetWealth), target: usd(s.targetAmount), pct: clock.goalPct }],
    tasks: [{ label: `Reach ${usd(s.targetAmount)}`, done: wealth.realizedNetWealth >= s.targetAmount }],
    needs: [`Up to ${s.policy.maxConcurrentProp} accounts at once`, "Pause scaling after any failed account"],
  });

  // Status, numbering, ordering.
  const key = (x: (typeof stages)[number]) => (x.id === "goal" ? "9999" : x.end);
  const ordered = stages.sort((a, b) => key(a).localeCompare(key(b)) || (a.parallel ? 1 : -1));
  let currentFound = false;
  const out: Stage[] = ordered.map((st, i) => {
    let status: StageStatus;
    if (st.doneAt) status = "done";
    else if (!st.parallel && !currentFound) {
      currentFound = true;
      status = today > st.end ? "late" : "current";
    } else status = today > st.end ? "late" : st.parallel && today >= st.start ? "current" : "upcoming";
    return { ...st, n: i + 1, status, progress: Math.max(0, Math.min(1, st.progress)) };
  });
  const main = out.filter((x) => !x.parallel);
  const current = main.find((x) => x.status === "current" || x.status === "late") ?? main[main.length - 1];
  const open = out.filter((x) => x.status !== "done");
  const next = open.sort((a, b) => a.end.localeCompare(b.end))[0] ?? current;

  return {
    stages: out,
    current,
    overall: sum(main.map((x) => x.progress)) / main.length,
    daysLeft: clock.remainingDays,
    nextDeadline: { stage: next, days: daysBetween(today, next.end) },
  };
}
