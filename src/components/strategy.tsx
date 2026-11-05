import Link from "next/link";
import { AlertTriangle, Check, Clock, Flag, Zap } from "lucide-react";
import type { Mission } from "@/lib/data";
import type { Template } from "@/lib/settings";
import { daysBetween } from "@/lib/engine/util";
import { Badge, Card, CardTitle, cx } from "./ui";
import { fmtDate, prob, usd } from "@/lib/format";

type M = Mission;
const d = (s: string | null | undefined, today: string) => (s ? fmtDate(s, { month: "short", day: "numeric", year: s.slice(0, 4) !== today.slice(0, 4) ? "numeric" : undefined }) : "—");

function stepsOf(m: M): { idx: number; t: Template }[] {
  return m.settings.plan.steps.map((id, idx) => ({ idx, t: m.settings.templates.find((x) => x.id === id)! })).filter((x) => x.t);
}

/** Payouts each account takes before the rotation moves on (first account one, later two). */
function payoutsFor(m: M, idx: number): number {
  const a = m.settings.plan.payoutsByStep;
  return a[Math.min(idx, a.length - 1)] ?? m.settings.plan.payoutsPerAccount;
}

function accountProgress(m: M, t: Template) {
  const accs = m.accounts.filter((a) => a.kind === "prop" && a.firm === t.firm && a.size === t.size);
  const pays = m.payouts.filter((p) => p.status === "received" && accs.some((a) => a.id === p.accountId)).length;
  return { bought: accs.length > 0, p1: accs.some((a) => a.phase1PassedAt), funded: accs.some((a) => a.phase2PassedAt), pays };
}

function Cell({ date, done, today, typical }: { date: string | null; done: boolean; today: string; typical?: string | null }) {
  const late = !done && date && daysBetween(today, date) < 0;
  const soon = !done && date && !late && daysBetween(today, date) <= 7;
  return (
    <td className="num whitespace-nowrap">
      <span className={cx("inline-flex items-center gap-1 font-semibold", done ? "text-good-ink" : late ? "text-crit-ink" : soon ? "text-warn-ink" : "text-ink")}>
        {done ? <Check className="size-3.5" /> : late ? <AlertTriangle className="size-3.5" /> : soon ? <Clock className="size-3.5" /> : null}
        {done ? "Done" : d(date, today)}
      </span>
      {!done && typical && <div className="text-[11px] font-normal text-ink-3">typ. {d(typical, today)}</div>}
    </td>
  );
}

/** The rotation: every account with its buy, pass, funded and payout dates (your target schedule). */
export function RotationCard({ m }: { m: M }) {
  const S = m.strategy.plan;
  const dmap = S.deadlines;
  const trig = m.settings.policy.payoutTriggerPct;
  const debt = m.wealth.debts.filter((x) => x.outstanding > 0)[0];
  const P = m.settings.plan;
  const hasP2 = P.payoutsByStep.some((n) => n >= 2);
  const dueRow = debt ? S.months.find((r) => r.month === debt.dueDate.slice(0, 7)) : null;
  const byDue = dueRow?.debtPaidCumP50 ?? 0;
  return (
    <Card>
      <CardTitle
        title="The rotation plan"
        hint={`Climb to the first of each size on these dates — then run up to ${m.settings.policy.maxConcurrentProp} accounts at once, funded from payout cash. That parallel scaling is where the money comes from. Honest odds below.`}
        right={<Badge tone="dark">Target schedule</Badge>}
      />
      <div className="-mx-2 overflow-x-auto">
        <table className="table">
          <thead><tr><th>#</th><th>Account</th><th className="text-right">Fee</th><th>Buy</th><th>Phase 1</th><th>Funded</th><th>Payout 1</th>{hasP2 && <th>Payout 2</th>}<th className="text-right">Per payout</th></tr></thead>
          <tbody>
            {debt && (
              <tr className="bg-warn-soft/60">
                <td><Flag className="size-3.5 text-warn-ink" /></td>
                <td className="font-medium" colSpan={3}>{usd(debt.amount)} debt — due {d(debt.dueDate, m.today)}</td>
                <td colSpan={hasP2 ? 5 : 4} className="text-[12.5px] text-warn-ink">Paid from trading, no outside money. From the first payout, the debt takes {P.debtSharePct}% of what&apos;s left after your {usd(P.livingPerPayout)} living. By {d(debt.dueDate, m.today)} trading has typically repaid only <b>{usd(byDue)}</b> of {usd(debt.amount)} — it clears around <b>{d(S.debtFree?.p50, m.today)}</b> (and {d(S.debtFree?.p90, m.today)} in slower runs). The due date can&apos;t come from trading alone.</td>
              </tr>
            )}
            {stepsOf(m).map(({ idx, t }) => {
              const pr = accountProgress(m, t);
              const g = (k: string) => dmap[`${k}_${idx}`] ?? null;
              const per = (t.size * trig) / 100 * (t.splitPct / 100);
              return (
                <tr key={idx}>
                  <td className="text-ink-3 num">{idx + 1}</td>
                  <td className="whitespace-nowrap font-semibold">{t.firm} ${t.size / 1000}K<div className="text-[11px] font-normal text-ink-3">{t.profitTargetP1}% / {t.profitTargetP2}% · {t.minTradingDays} min days</div></td>
                  <td className="num text-right">{usd(t.price)}{!t.priceVerified && <div className="text-[10.5px] text-warn-ink">verify</div>}</td>
                  {idx === 0 && pr.bought ? <td className="text-good-ink"><Check className="inline size-3.5" /> Held</td> : <Cell date={g("buy")} done={pr.bought} today={m.today} />}
                  <Cell date={g("p1")} done={pr.p1 || pr.funded} today={m.today} />
                  <Cell date={g("p2")} done={pr.funded} today={m.today} />
                  <Cell date={g("payout1")} done={pr.pays >= 1} today={m.today} />
                  {hasP2 && (payoutsFor(m, idx) >= 2
                    ? <Cell date={g("payout2")} done={pr.pays >= 2} today={m.today} />
                    : <td className="num text-ink-4" title="This account takes one payout, then you move on">—</td>)}
                  <td className="num text-right font-medium">{usd(per)}{t.feeRefundOnFirstPayout && <div className="text-[11px] font-normal text-ink-3">+{usd(t.price)} refund once</div>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-3 text-[12.5px] leading-[18px] sm:grid-cols-3">
        <div className="rounded-[12px] bg-accent-soft p-3"><b className="text-accent-ink">Run them in parallel.</b> <span className="text-ink-2">The dates above are when you first reach each size. Once funded, spare payout cash buys more accounts — up to {m.settings.policy.maxConcurrentProp} at once. Same trades, more size.</span></div>
        <div className="rounded-[12px] bg-ink/[0.03] p-3"><b className="text-ink">Missed a date?</b> <span className="text-ink-2">Keep going if the account is healthy; the later dates move with it. Never raise size to catch up.</span></div>
        <div className="rounded-[12px] bg-ink/[0.03] p-3"><b className="text-ink">Failed a challenge?</b> <span className="text-ink-2">Re-buy the same account that week from reinvestment money or the {usd(P.retryBudget)} retry budget. Two in a row: stop and review.</span></div>
        <div className="rounded-[12px] bg-ink/[0.03] p-3"><b className="text-ink">Prices marked “verify”</b> <span className="text-ink-2">weren&apos;t on the firm&apos;s rules page. Check the checkout price, and edit it in Settings → Advanced → templates.</span></div>
      </div>
    </Card>
  );
}

/** Your speed targets vs what the plan's performance actually delivers. */
export function SpeedCard({ m }: { m: M }) {
  const P = m.settings.plan;
  const steps = m.strategy.plan.steps.filter((s) => s.passRate > 0);
  return (
    <Card>
      <CardTitle title="Your speed targets" hint={`Phase 1 within ${P.phase1Days} days, Phase 2 within ${P.phase2Days} more. How often the plan meets them at ~${P.avgRiskPct}% average risk.`} right={<Zap className="size-4 text-accent" />} />
      <div className="space-y-2">
        {steps.map((st) => {
          const t = m.settings.templates.find((x) => x.id === st.templateId);
          if (!t) return null;
          return (
            <div key={st.step} className="grid grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))] items-center gap-2 rounded-[12px] bg-ink/[0.03] px-3 py-2 text-[12.5px]">
              <span className="truncate font-medium">{t.firm} ${t.size / 1000}K</span>
              <span className="num text-right"><b>{prob(st.fastP1)}</b><span className="text-ink-3"> P1 fast</span></span>
              <span className="num text-right"><b>{prob(st.fastP2)}</b><span className="text-ink-3"> P2 fast</span></span>
              <span className="num text-right"><b>{prob(st.passRate)}</b><span className="text-ink-3"> pass</span></span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] leading-[18px] text-ink-3">Phase 2 in one week sits right at the firms&apos; minimum trading days, so it only happens when the target lands by day 5. Missing a speed target costs time, not the account.</p>
    </Card>
  );
}

/** Where every payout goes: living off the top, then debt, your account and the next challenge all grow together. */
export function PayoutSplitCard({ m }: { m: M }) {
  const P = m.settings.plan;
  const debtOpen = m.wealth.debtOutstanding > 0;
  const step0Share = P.personalShareByStep[0] ?? P.personalSharePct;
  const lastShare = P.personalShareByStep[P.personalShareByStep.length - 1] ?? step0Share;

  // Worked through on the $25K's first payout — the first real scaling payout.
  const ex = m.settings.templates.find((x) => x.id === P.steps[1]) ?? m.settings.templates[0];
  const exNext = m.settings.templates.find((x) => x.id === P.steps[2]);
  const amt = (ex.size * m.settings.policy.payoutTriggerPct) / 100 * (ex.splitPct / 100);
  const living = Math.min(amt, P.livingPerPayout);
  const fee = Math.min(amt - living, exNext?.price ?? 0);
  const base = Math.max(0, amt - living - fee);
  const toDebt = debtOpen ? (base * P.debtSharePct) / 100 : 0;
  const share = debtOpen ? Math.min(step0Share, 100 - P.debtSharePct) : step0Share;
  const toPersonal = (base * share) / 100;
  const toReinvest = base - toDebt - toPersonal;

  const rows = [
    { n: 1, label: "Living costs", rule: `${usd(P.livingPerPayout)} off the top — your day-to-day money`, ex: living, tone: "" },
    { n: 2, label: "Next challenge fee", rule: `scale up — the next ${exNext ? `$${exNext.size / 1000}K` : "account"}`, ex: fee, tone: "" },
    { n: 3, label: "Debt", rule: debtOpen ? `${P.debtSharePct}% of what's left, from the first payout` : "cleared ✓", ex: toDebt, tone: "warn" },
    { n: 4, label: "Your own account", rule: debtOpen ? `${share}% now, rising to ${lastShare}%` : `${step0Share}%+, rising each account`, ex: toPersonal, tone: "accent" },
    { n: 5, label: "Reinvestment reserve", rule: "the rest — more challenges, retries", ex: toReinvest, tone: "" },
  ];

  return (
    <Card>
      <CardTitle title="Where every payout goes" hint={`${usd(P.livingPerPayout)} comes off the top for living. The rest splits three ways — debt down, your own account up, and the next challenge.`} />
      <div className="mb-2 text-[12.5px] font-semibold text-ink-2">Example: a {ex.firm} ${ex.size / 1000}K payout of {usd(amt)} <span className="font-normal text-ink-3">· every payout follows this split</span></div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.n} className="flex items-center gap-3 rounded-[12px] bg-ink/[0.03] px-3.5 py-2.5">
            <span className={cx("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-fill-fg", r.tone === "warn" ? "bg-warn" : r.tone === "accent" ? "bg-fill" : "bg-fill")}>{r.n}</span>
            <div className="min-w-0 flex-1"><div className="text-[13.5px] font-medium">{r.label}</div><div className="text-[12px] text-ink-3">{r.rule}</div></div>
            <div className="num text-[15px] font-semibold">{usd(r.ex)}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-[18px] text-ink-3">Living is yours to spend; the next-challenge fee keeps the ladder moving. Debt, your account and reinvestment grow together — no single one starves the others.</p>
      <Link href="/money" className="mt-3 inline-block text-[12.5px] font-medium text-accent-ink">Record payouts and debt payments →</Link>
    </Card>
  );
}

/** Month by month: what the plan can promise (90%) and what's typical. */
export function MoneyPlanCard({ m }: { m: M }) {
  const rows = m.strategy.plan.months;
  return (
    <Card>
      <CardTitle title="Money plan by month" hint="Safe = reached by the end of that month in 9 in 10 runs. The safe column is what you can count on; the typical column is the median." />
      <div className="-mx-2 overflow-x-auto">
        <table className="table">
          <thead><tr><th>Month</th><th className="text-right">Payouts to date · safe</th><th className="text-right">typical</th><th className="text-right">Living</th><th className="text-right">Debt repaid · safe</th><th className="text-right">typical</th><th className="text-right">Personal account · typical</th><th className="text-right">Net worth · typical</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month}>
                <td className="whitespace-nowrap font-medium">{new Date(r.month + "-01T00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}</td>
                <td className="num text-right font-semibold">{usd(r.payoutsCumP10)}</td>
                <td className="num text-right text-ink-2">{usd(r.payoutsCumP50)}</td>
                <td className="num text-right">{usd(r.livingP50)}</td>
                <td className="num text-right font-semibold">{usd(r.debtPaidCumP10)}</td>
                <td className="num text-right text-ink-2">{usd(r.debtPaidCumP50)}</td>
                <td className="num text-right">{usd(r.personalP50)}</td>
                <td className={cx("num text-right", r.netWorthP50 < 0 && "text-crit-ink")}>{usd(r.netWorthP50)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** What the numbers really say, without spin. */
export function HonestOddsCard({ m }: { m: M }) {
  const S = m.strategy;
  const P = m.settings.plan;
  const tgt = m.settings.targetAmount;
  const cols = [
    { label: "Plan performance", sub: `${Math.round(P.winRate * 100)}% wins at ${P.avgWinR}:1`, r: S.plan },
    { label: "Base case", sub: `${Math.round(m.settings.scenarios.base.winRate * 100)}% at ${m.settings.scenarios.base.avgWinR}:1`, r: S.base },
    ...(S.yours ? [{ label: "Your trades", sub: `${m.stats.n} trades`, r: S.yours }] : []),
  ];
  const actual = m.stats.n >= 15 ? m.stats.avgR : null;
  const end = fmtDate(m.settings.missionEnd, { month: "short", day: "numeric" });
  return (
    <Card>
      <CardTitle title="Honest odds" hint={`At ${end}, at about ${P.avgRiskPct}% average risk.`} />
      <div className="-mx-2 overflow-x-auto">
        <table className="table">
          <thead><tr><th />{cols.map((c) => <th key={c.label} className="text-right">{c.label}<div className="font-normal normal-case tracking-normal text-ink-4">{c.sub}</div></th>)}</tr></thead>
          <tbody>
            <tr><td>Net worth you can count on (90%)</td>{cols.map((c) => <td key={c.label} className="num text-right font-semibold">{usd(c.r.finalNetP10)}</td>)}</tr>
            <tr><td>Typical net worth</td>{cols.map((c) => <td key={c.label} className="num text-right">{usd(c.r.finalNetP50)}</td>)}</tr>
            <tr><td>Personal account (typical)</td>{cols.map((c) => <td key={c.label} className="num text-right">{usd(c.r.personalP50)}</td>)}</tr>
            <tr><td>Reach {usd(tgt)}</td>{cols.map((c) => <td key={c.label} className="num text-right">{prob(c.r.pTarget(tgt))}</td>)}</tr>
            <tr><td>Debt cleared by {end}</td>{cols.map((c) => <td key={c.label} className="num text-right">{c.r.debtFree ? prob(c.r.debtFree.byEnd) : "—"}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <div className={cx("mt-4 rounded-[12px] p-3.5 text-[13px] leading-5", actual == null ? "bg-ink/[0.03] text-ink-2" : actual >= S.requiredR ? "bg-good-soft text-good-ink" : "bg-warn-soft text-warn-ink")}>
        {actual == null
          ? `These deadlines need about ${S.requiredR.toFixed(2)}R per trade on average. After 15 journaled trades this box shows whether you're there (${m.stats.n} so far).`
          : actual >= S.requiredR
            ? `You're averaging ${actual.toFixed(2)}R per trade — at or above the ${S.requiredR.toFixed(2)}R the plan needs.`
            : `You're averaging ${actual.toFixed(2)}R per trade; the plan needs ${S.requiredR.toFixed(2)}R. Expect the deadlines to slip — fix execution before buying the next challenge.`}
      </div>
    </Card>
  );
}

/** The transition: payout money moving from prop challenges to your own capital, step by step. */
export function OwnAccountCard({ m }: { m: M }) {
  const P = m.settings.plan;
  const S = m.strategy;
  const steps = stepsOf(m);
  const last = m.strategy.plan.months[m.strategy.plan.months.length - 1];
  const personalTarget = last?.personalP50 ?? 0;
  return (
    <Card>
      <CardTitle
        title="Building your own account"
        hint="Each account sends a bigger share of its payouts to your personal capital. By the end, your own money does the work — not the prop firms."
      />
      <div className="mb-4 flex items-end gap-2">
        <div className="num text-[30px] font-semibold leading-none tracking-[-0.04em]">{usd(personalTarget)}</div>
        <div className="pb-0.5 text-[13px] text-ink-2">typical personal account by {fmtDate(m.settings.missionEnd, { month: "short", day: "numeric" })} · {usd(S.plan.personalP10)} safe</div>
      </div>
      <div className="space-y-1.5">
        {steps.map(({ idx, t }) => {
          const share = P.personalShareByStep[Math.min(idx, P.personalShareByStep.length - 1)] ?? P.personalSharePct;
          return (
            <div key={idx} className="flex items-center gap-3 text-[12.5px]">
              <span className="w-24 shrink-0 font-medium">{t.firm} ${t.size / 1000}K</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                <div className="h-full rounded-full bg-fill transition-[width]" style={{ width: `${share}%` }} />
              </div>
              <span className="num w-20 text-right text-ink-2"><b className="text-ink">{share}%</b> to you</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] leading-[18px] text-ink-3">While the debt is open it gets priority, so your account grows slowly at first — then faster once the debt is clear and the rising share kicks in. Your own account trades at {P.personalRiskPct}% risk and compounds on its own.</p>
    </Card>
  );
}
