import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, AlertTriangle } from "lucide-react";
import { loadMission } from "@/lib/data";
import { addDays, daysBetween } from "@/lib/engine/util";
import { Card, cx, PageHeader, Ring } from "@/components/ui";
import { TrendChart } from "@/components/trend-chart";
import { PLAN, liveSchedule, liveGrowthChart, liveTarget } from "@/lib/growth-plan";
import { fmtDate, usd } from "@/lib/format";

const d = (s: string | null | undefined) =>
  s ? fmtDate(s, { month: "short", day: "numeric", year: s.slice(0, 4) !== "2026" ? "numeric" : undefined }) : "—";

export default function DebtTracker() {
  const m = loadMission();
  if (!m.settings.setupCompleted) redirect("/setup");
  const { wealth, today } = m;
  const debt = wealth.debts.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  if (!debt) {
    return (
      <>
        <PageHeader title="Debt" description="No debt on record. Add one in Settings to track it here." />
        <Card><p className="text-ink-2">You have no outstanding debt tracked. Nothing to clear.</p></Card>
      </>
    );
  }

  const remaining = debt.outstanding;
  const paid = debt.paid;
  const pctCleared = debt.amount > 0 ? (paid / debt.amount) * 100 : 0;
  const daysLeft = Math.max(0, daysBetween(today, PLAN.deadline));

  // The plan: the debt is cleared in ONE payment on Dec 29, from the grown live account.
  const dl = m.strategy.plan.deadlines;
  const firstPayout = dl["payout1_0"] ?? addDays(today, 14);
  const liveBalance = wealth.personalEquity;
  const target = liveTarget();
  const schedule = liveSchedule(firstPayout);
  const covers = target >= PLAN.debtPayoff;
  const afterDebt = Math.max(0, target - PLAN.debtPayoff);

  return (
    <>
      <PageHeader eyebrow="Debt" title="Cleared Dec 29, in one payment" description="The debt isn't paid off piece by piece. The live account grows from weekly payouts, and on December 29 it clears the debt in full." />

      {/* Countdown + ring */}
      <Card className="mb-4">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <Ring value={Math.round(pctCleared)} size={128} stroke={11} tone={pctCleared >= 100 ? "var(--color-good)" : "var(--color-warn)"}>
              <div className="text-center"><div className="num text-[26px] font-semibold tracking-[-0.04em]">{Math.round(pctCleared)}%</div><div className="text-[11px] text-ink-3">cleared</div></div>
            </Ring>
            <div>
              <div className="eyebrow mb-1">Outstanding</div>
              <div className={cx("num text-[34px] font-semibold tracking-[-0.03em]", remaining > 0 && "text-warn-ink")}>{usd(remaining)}</div>
              <div className="mt-1 text-[12.5px] text-ink-3">of {usd(debt.amount)} · due {d(PLAN.deadline)}</div>
            </div>
          </div>
          <div className="flex gap-8 sm:gap-10">
            <div><div className="eyebrow mb-1">Days to Dec 29</div><div className="num text-[30px] font-semibold tracking-[-0.03em]">{daysLeft}</div></div>
            <div><div className="eyebrow mb-1">Paid from</div><div className="text-[18px] font-semibold tracking-[-0.02em]">Live account</div><div className="text-[12px] text-ink-3">not weekly</div></div>
          </div>
        </div>
      </Card>

      {/* Verdict — will the live account cover it? */}
      <Card className={cx("mb-4", covers ? "border-good/40 bg-good-soft/30" : "border-warn/40 bg-warn-soft/30")}>
        <div className="flex items-start gap-3">
          <span className={cx("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-fill-fg", covers ? "bg-good" : "bg-warn")}>
            {covers ? <Check className="size-5" /> : <AlertTriangle className="size-5" />}
          </span>
          <div>
            <h2 className="text-[16px] font-semibold">Will the live account cover it by Dec 29?</h2>
            {covers ? (
              <p className="mt-1.5 text-[13.5px] leading-5 text-ink-2">
                <b className="text-ink">Yes.</b> On the plan — {PLAN.payoutCount} weekly {usd(PLAN.weeklyPayout)} payouts grown {PLAN.weeklyGrowthPct}% a week — the live account reaches about{" "}
                <b className="text-ink">{usd(target)}</b> by Dec 29. That clears the {usd(PLAN.debtPayoff)} debt payment in one shot and still leaves about{" "}
                <b className="text-ink">{usd(afterDebt)}</b> for the $50K challenge and trading capital. Hit the weekly {PLAN.weeklyGrowthPct}% and log every payout so this stays real.
              </p>
            ) : (
              <p className="mt-1.5 text-[13.5px] leading-5 text-ink-2">
                The projected live account (<b className="text-ink">{usd(target)}</b>) is below the {usd(PLAN.debtPayoff)} payment. Close the gap with extra payouts or a stronger growth week — never by raising risk.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Live account growth toward the payoff */}
      <Card className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="eyebrow">Live account growth to the {usd(PLAN.debtPayoff)} payoff</div>
          <span className="num text-[13px] font-semibold text-good-ink">{usd(target)} by Dec 29</span>
        </div>
        <p className="mb-3 text-[12.5px] text-ink-3">The dashed line is the {usd(PLAN.debtPayoff)} you need to clear the debt. The live account crosses it before the deadline.</p>
        <TrendChart name="Live account" color="var(--color-good)" data={liveGrowthChart(firstPayout)} goal={PLAN.debtPayoff} goalLabel={`${usd(PLAN.debtPayoff)} payoff`} />
      </Card>

      {/* Week by week — live account, not debt */}
      <Card className="mb-4">
        <div className="eyebrow mb-1">Week by week to Dec 29</div>
        <p className="mb-3 text-[12.5px] text-ink-3">Each week adds a {usd(PLAN.weeklyPayout)} payout, then grows {PLAN.weeklyGrowthPct}%. Debt-clearing power is reached once the balance passes {usd(PLAN.debtPayoff)}.</p>
        <div className="-mx-2 overflow-x-auto">
          <table className="table">
            <thead><tr><th>Week</th><th>By</th><th className="text-right">Payout in</th><th className="text-right">Live account</th><th className="text-right">Clears debt?</th></tr></thead>
            <tbody>
              {schedule.map((w) => (
                <tr key={w.n}>
                  <td className="font-medium">Week {w.n}{w.cushion ? " · cushion" : ""}</td>
                  <td className="num">{d(w.date)}</td>
                  <td className="num text-right text-good-ink">+{usd(w.deposit)}</td>
                  <td className="num text-right font-semibold">{usd(w.end)}</td>
                  <td className={cx("text-right num font-semibold", w.end >= PLAN.debtPayoff ? "text-good-ink" : "text-ink-3")}>{w.end >= PLAN.debtPayoff ? "Yes" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Dec 29 settlement */}
      <Card className="mb-4">
        <div className="eyebrow mb-1">Dec 29 — settlement</div>
        <p className="mb-3 text-[12.5px] text-ink-3">The grown live account (~{usd(target)}) splits three ways.</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="rounded-[13px] border border-warn/40 bg-warn-soft p-3.5">
            <div className="eyebrow text-warn-ink">Clear the debt</div>
            <div className="num mt-1 text-[22px] font-bold tracking-[-0.03em] text-warn-ink">{usd(PLAN.debtPayoff)}</div>
            <div className="mt-0.5 text-[11px] text-ink-3">paid in one shot</div>
          </div>
          <div className="rounded-[13px] border border-line bg-ink/[0.03] p-3.5">
            <div className="eyebrow">Buy $50K challenge</div>
            <div className="num mt-1 text-[22px] font-bold tracking-[-0.03em] text-ink">{usd(PLAN.fiftyKFee)}</div>
            <div className="mt-0.5 text-[11px] text-ink-3">the next engine</div>
          </div>
          <div className="rounded-[13px] border border-line bg-ink/[0.03] p-3.5">
            <div className="eyebrow text-good-ink">Keep trading</div>
            <div className="num mt-1 text-[22px] font-bold tracking-[-0.03em] text-good-ink">{usd(Math.max(0, target - PLAN.debtPayoff - PLAN.fiftyKFee))}</div>
            <div className="mt-0.5 text-[11px] text-ink-3">stays in the live account</div>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link href="/money" className="inline-flex items-center gap-1.5 rounded-[11px] bg-fill px-3.5 py-2 text-[13px] font-semibold text-fill-fg">Record a debt payment</Link>
        <Link href="/plan" className="inline-flex items-center gap-1.5 rounded-[11px] border border-line px-3.5 py-2 text-[13px] font-semibold text-ink">Full plan</Link>
      </div>
    </>
  );
}
