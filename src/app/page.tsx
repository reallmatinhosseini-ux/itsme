import { redirect } from "next/navigation";
import { OctagonAlert } from "lucide-react";
import { loadMission, actionsFor } from "@/lib/data";
import { db, schema } from "@/db";
import { addDays, daysBetween } from "@/lib/engine/util";
import { usd } from "@/lib/format";
import { PLAN, liveSchedule, liveGrowthChart, liveTarget } from "@/lib/growth-plan";
import { CommandCenter, type ChallengeInfo, type DailySummary, type Milestone } from "@/components/command-center";

export const dynamic = "force-dynamic";

const STAGE: Record<string, string> = { phase1: "Step 1", phase2: "Step 2", funded: "Funded", failed: "Failed" };

export default function Overview() {
  const m = loadMission();
  if (!m.settings.setupCompleted) redirect("/setup");
  const { wealth, today } = m;
  const debt = wealth.debts.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const dueDate = debt?.dueDate ?? "2026-12-29";
  const stop = m.alerts.find((a) => a.level === "critical");
  const action = actionsFor(m, null)[0];

  // Challenge + milestones (real state — nothing invented).
  const acc = m.states.find((s) => s.isProp && !s.account.archived) ?? m.states.find((s) => s.isProp);
  const dl = m.strategy.plan.deadlines;
  const received = m.payouts.filter((pp) => pp.status === "received").length;
  const liveBalance = wealth.personalEquity;

  // The deterministic growth plan: 5 weekly $300 payouts → live account, grown 60%/week.
  const firstPayout = dl["payout1_0"] ?? addDays(today, 14);
  const schedule = liveSchedule(firstPayout);
  const liveChart = liveGrowthChart(firstPayout);
  const target = liveTarget();
  const fiveKWeek = schedule.find((w) => w.end >= PLAN.debtPayoff)?.date ?? PLAN.deadline;

  const milestones: Milestone[] = [
    { label: "Pass Step 1", date: dl["p1_0"] ?? null, done: !!acc?.account.phase1PassedAt },
    { label: "Pass Step 2 — get funded", date: dl["p2_0"] ?? null, done: !!acc?.account.phase2PassedAt },
    { label: `First ${usd(PLAN.weeklyPayout)} payout → live account`, date: dl["payout1_0"] ?? null, done: received >= 1 },
    { label: `Live account reaches ${usd(PLAN.debtPayoff)}`, date: fiveKWeek, done: liveBalance >= PLAN.debtPayoff },
    { label: `Dec 29 — clear ${usd(PLAN.debtPayoff)} debt, buy $50K`, date: PLAN.deadline, done: (debt?.outstanding ?? 0) <= 0, hard: true },
  ];

  const challenge: ChallengeInfo | null = acc
    ? {
        id: acc.account.id,
        name: `${acc.account.firm} $${acc.account.size / 1000}K`,
        stage: acc.account.stage as ChallengeInfo["stage"],
        profit: acc.profit,
        targetPct: acc.targetPct ?? (acc.account.stage === "phase2" ? acc.account.profitTargetP2 : acc.account.profitTargetP1),
        size: acc.account.size,
        tradingDays: acc.tradingDays,
        minDays: acc.account.minTradingDays,
      }
    : null;

  // Daily tracker summary for this week (Mon–Sun).
  const trackMap = new Map(db.select().from(schema.dailyTrack).all().map((r) => [r.date, r]));
  const dow = new Date(today + "T00:00").getDay();
  const monday = addDays(today, -((dow + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const r = trackMap.get(date);
    return { date, pnl: r?.pnl ?? 0, noTrade: !!r?.noTrade, logged: !!r };
  });
  const te = week.find((d) => d.date === today);
  const daily: DailySummary = {
    week,
    weekTotal: week.filter((d) => d.logged && !d.noTrade).reduce((s, d) => s + d.pnl, 0),
    dailyTarget: m.settings.plan.dailyTargetUsd,
    todayLogged: !!te?.logged,
    todayPnl: te?.pnl ?? 0,
    todayNoTrade: !!te?.noTrade,
  };

  return (
    <>
      {stop && (
        <div className="mb-4 flex gap-3 rounded-[16px] bg-crit p-4 text-fill-fg shadow-[0_12px_32px_-12px_rgb(208_59_59/0.6)]">
          <OctagonAlert className="mt-0.5 size-5 shrink-0" />
          <div><div className="text-[15px] font-semibold">Stop trading for today</div><div className="mt-0.5 text-[13.5px] leading-5 text-white/85">{stop.title}. {stop.detail}</div></div>
        </div>
      )}
      <CommandCenter
        today={today}
        deadline={PLAN.deadline}
        daysLeft={Math.max(0, daysBetween(today, PLAN.deadline))}
        debtPayoff={PLAN.debtPayoff}
        liveBalance={liveBalance}
        liveTarget={target}
        liveChart={liveChart}
        weeklyPayout={PLAN.weeklyPayout}
        payoutCount={PLAN.payoutCount}
        weeklyGrowthPct={PLAN.weeklyGrowthPct}
        fiftyKFee={PLAN.fiftyKFee}
        schedule={schedule}
        challengeStage={acc ? STAGE[acc.account.stage] ?? acc.account.stage : "Not started"}
        challenge={challenge}
        milestones={milestones}
        daily={daily}
      />
      {action && (
        <div className="mt-4 rounded-[16px] border border-line bg-ink/[0.03] p-4">
          <div className="eyebrow mb-1 text-accent-ink">Do this next</div>
          <div className="text-[14px] font-semibold">{action.title}</div>
          <div className="mt-0.5 text-[13px] text-ink-2">{action.reason}</div>
        </div>
      )}
    </>
  );
}
