import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarCheck2, Check, Flag, Minus, Plus, TrendingUp } from "lucide-react";
import { Card, Ring, cx } from "./ui";
import { ChallengeControl } from "./challenge-control";
import { TrendChart } from "./trend-chart";

const usd = (n: number) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const wdL = (iso: string) => new Date(iso + "T00:00").toLocaleDateString("en-US", { weekday: "narrow" });
const fmt = (iso: string | null) => (iso ? new Date(iso + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

export type DailySummary = {
  week: { date: string; pnl: number; noTrade: boolean; logged: boolean }[];
  weekTotal: number;
  dailyTarget: number;
  todayLogged: boolean;
  todayPnl: number;
  todayNoTrade: boolean;
};
export type Milestone = { label: string; date: string | null; done: boolean; hard?: boolean };
export type ChallengeInfo = { id: number; name: string; stage: "phase1" | "phase2" | "funded" | "failed"; profit: number; targetPct: number; size: number; tradingDays: number; minDays: number };
export type PayoutWeek = { n: number; label: string; date: string; deposit: number; afterDeposit: number; end: number; cushion: boolean };

type Props = {
  today: string;
  deadline: string;
  daysLeft: number;
  debtPayoff: number;
  liveBalance: number;
  liveTarget: number;
  liveChart: { name: string; v: number }[];
  weeklyPayout: number;
  payoutCount: number;
  weeklyGrowthPct: number;
  fiftyKFee: number;
  schedule: PayoutWeek[];
  challengeStage: string;
  challenge: ChallengeInfo | null;
  milestones: Milestone[];
  daily: DailySummary;
};

export function CommandCenter(p: Props) {
  const livePct = p.liveTarget > 0 ? Math.round((p.liveBalance / p.liveTarget) * 100) : 0;
  const doneCount = p.milestones.filter((m) => m.done).length;
  const nextIdx = p.milestones.findIndex((m) => !m.done);
  const totalPaidIn = p.weeklyPayout * p.payoutCount;

  return (
    <div className="stagger space-y-4">
      {/* HERO — matte glass */}
      <section className="glass glass-strong relative overflow-hidden p-7 sm:p-9">
        <div className="relative flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-md">
            <div className="eyebrow mb-3">Mission · grow the live account, clear the debt</div>
            <div className="flex items-end gap-3">
              <div className="num text-[76px] font-bold leading-[0.82] tracking-[-0.05em] text-ink">{p.daysLeft}</div>
              <div className="pb-3 text-[15px] font-medium leading-5 text-ink-3">days to<br /><span className="text-[17px] font-semibold text-ink">Dec 29</span></div>
            </div>
            <p className="mt-4 text-[13.5px] leading-6 text-ink-2">Pass the $6K challenge, take {p.payoutCount} weekly {usd(p.weeklyPayout)} payouts into your live account and grow it {p.weeklyGrowthPct}% a week. By Dec 29 it clears the {usd(p.debtPayoff)} debt and funds a $50K challenge.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/tracker" className="inline-flex items-center gap-1.5 rounded-[11px] bg-fill px-4 py-2.5 text-[13.5px] font-semibold text-fill-fg shadow-[0_6px_18px_-8px_rgb(0_0_0/0.5)] transition active:scale-[0.98]"><Plus className="size-4" /> Track today</Link>
              <Link href="/plan" className="inline-flex items-center gap-1.5 rounded-[11px] border border-line-strong px-4 py-2.5 text-[13.5px] font-semibold text-ink transition hover:bg-ink/[0.04]">The plan</Link>
            </div>
          </div>
          <div className="relative shrink-0">
            <Ring value={livePct} size={176} stroke={13} tone="var(--color-accent)" track="var(--color-line)">
              <div className="text-center">
                <div className="num text-[34px] font-bold leading-none tracking-[-0.05em] text-ink">{usd(p.liveBalance)}</div>
                <div className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-ink-3">live account</div>
                <div className="num mt-1 text-[12px] text-ink-2">target {usd(p.liveTarget)} by Dec 29</div>
              </div>
            </Ring>
          </div>
        </div>
      </section>

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Days to deadline" value={String(p.daysLeft)} sub="until Dec 29" />
        <KpiTile label="Live account" value={usd(p.liveBalance)} sub={`target ${usd(p.liveTarget)}`} tone="good" />
        <KpiTile label="Weekly payouts" value={`${p.payoutCount} × ${usd(p.weeklyPayout)}`} sub={`${usd(totalPaidIn)} paid in`} />
        <KpiTile label="Weekly growth" value={`${p.weeklyGrowthPct}%`} sub="deposit, then grow" tone="good" />
      </div>

      {/* MOTIVATION */}
      <div className="flex items-center gap-2.5 rounded-[14px] bg-accent-soft px-4 py-3 text-[13px] font-medium text-accent-ink">
        <Flag className="size-4 shrink-0" />
        {p.milestones[1]?.done
          ? `Funded. Pull ${usd(p.weeklyPayout)} a week into the live account and compound ${p.weeklyGrowthPct}% — ${p.daysLeft} days to clear the debt and buy the $50K.`
          : p.milestones[0]?.done
            ? `Step 1 done. Pass Step 2 to get funded, then the ${usd(p.weeklyPayout)} weekly payouts start the growth engine — ${p.daysLeft} days to Dec 29.`
            : `You're on Step 1. Pass it, get funded, and the ${usd(p.weeklyPayout)} weekly payouts begin — ${p.daysLeft} days to grow the live account by Dec 29.`}
      </div>

      {/* CHALLENGE — interactive */}
      {p.challenge && <ChallengeControl {...p.challenge} />}

      {/* LIVE ACCOUNT GROWTH */}
      <Card>
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2"><TrendingUp className="size-4 text-good-ink" /><h2 className="text-[15px] font-semibold">Live account growth to Dec 29</h2></div>
          <span className="num text-[13px] font-semibold text-good-ink">{usd(p.liveTarget)} projected</span>
        </div>
        <p className="mb-3 text-[12.5px] text-ink-3">{p.payoutCount} weekly {usd(p.weeklyPayout)} payouts, each grown {p.weeklyGrowthPct}% — deposit, then compound.</p>
        <TrendChart name="Live account" color="var(--color-good)" data={p.liveChart} height={210} />
      </Card>

      {/* PAYOUT PLAN */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">The {p.payoutCount}-week payout plan</h2>
          <span className="num text-[12.5px] text-ink-3">{usd(p.weeklyPayout)}/wk · {p.weeklyGrowthPct}% growth</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {p.schedule.map((w) => (
            <div key={w.n} className={cx("rounded-[13px] border p-3", w.cushion ? "border-warn/40 bg-warn-soft" : "border-line bg-ink/[0.03]")}>
              <div className="flex items-center justify-between">
                <div className="eyebrow">{w.label}</div>
                {w.cushion && <span className="text-[9.5px] font-semibold uppercase tracking-[0.05em] text-warn-ink">Cushion</span>}
              </div>
              <div className="num mt-1.5 text-[18px] font-semibold tracking-[-0.03em] text-ink">{usd(w.end)}</div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-good-ink"><ArrowUpRight className="size-3" />+{usd(w.deposit)} in</div>
              <div className="mt-0.5 text-[10.5px] text-ink-3">{fmt(w.date)}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-3"><span className="size-2 rounded-full bg-warn" /> One cushion week a month — losses expected, the plan still holds.</p>
      </Card>

      {/* TODAY */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><CalendarCheck2 className="size-4 text-accent-ink" /><h2 className="text-[15px] font-semibold">Today</h2></div>
          <Link href="/tracker" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent-ink">Daily tracker <ArrowRight className="size-3.5" /></Link>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-4">
          <div>
            <div className="eyebrow mb-1">Result</div>
            {p.daily.todayLogged ? (
              p.daily.todayNoTrade
                ? <div className="text-[18px] font-semibold text-ink-2">No-trade day</div>
                : <div className={cx("num text-[24px] font-semibold tracking-[-0.03em]", p.daily.todayPnl > 0 ? "text-good-ink" : p.daily.todayPnl < 0 ? "text-crit-ink" : "")}>{signed(p.daily.todayPnl)}</div>
            ) : (
              <Link href="/tracker" className="inline-flex items-center gap-1.5 rounded-[11px] bg-fill px-4 py-2.5 text-[13.5px] font-semibold text-fill-fg transition active:scale-[0.98]"><Plus className="size-4" /> Track today</Link>
            )}
          </div>
          <div>
            <div className="eyebrow mb-1">This week</div>
            <div className={cx("num text-[24px] font-semibold tracking-[-0.03em]", p.daily.weekTotal > 0 ? "text-good-ink" : p.daily.weekTotal < 0 ? "text-crit-ink" : "text-ink")}>{signed(p.daily.weekTotal)}</div>
          </div>
          <div className="ml-auto flex gap-1.5">
            {p.daily.week.map((dd) => {
              const isToday = dd.date === p.today;
              const good = dd.logged && !dd.noTrade && dd.pnl >= 0;
              const loss = dd.logged && !dd.noTrade && dd.pnl < 0;
              return (
                <div key={dd.date} className={cx("grid size-9 place-items-center rounded-[10px] border text-[11px] font-semibold", isToday ? "border-accent/60" : "border-line", good ? "bg-good-soft text-good-ink" : loss ? "bg-crit-soft text-crit-ink" : dd.noTrade ? "bg-ink/[0.05] text-ink-3" : "bg-ink/[0.05] text-ink-4")} title={dd.date}>
                  {dd.noTrade ? <Minus className="size-3" /> : wdL(dd.date)}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* THE PATH */}
      <Card>
        <div className="mb-1 flex items-center justify-between">
          <div>
            <div className="eyebrow">North star</div>
            <h2 className="mt-0.5 text-[15px] font-semibold">Debt-free, funded, and trading live</h2>
          </div>
          <div className="text-right">
            <div className="num text-[22px] font-bold leading-none tracking-[-0.03em] text-ink">{doneCount}<span className="text-[14px] font-medium text-ink-3">/{p.milestones.length}</span></div>
            <div className="mt-1 text-[11px] text-ink-3">milestones</div>
          </div>
        </div>
        <div className="mb-4 mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]"><div className="h-full rounded-full bg-fill transition-[width] duration-700" style={{ width: `${Math.round((doneCount / p.milestones.length) * 100)}%` }} /></div>
        <ol className="relative">
          {p.milestones.map((mi, i) => {
            const isNext = !mi.done && i === nextIdx;
            return (
              <li key={mi.label} className="relative flex gap-3 pb-5 last:pb-0">
                <div className="flex flex-col items-center">
                  <span className={cx("grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold transition", mi.done ? "bg-good text-fill-fg" : isNext ? "bg-accent text-white shadow-[0_0_0_4px_var(--color-accent-soft)]" : mi.hard ? "bg-warn-soft text-warn-ink shadow-[0_0_0_1.5px_var(--color-warn)]" : "bg-fill text-ink-3 shadow-[0_0_0_1px_var(--color-line-strong)]")}>
                    {mi.done ? <Check className="size-4" /> : mi.hard ? <Flag className="size-3.5" /> : i + 1}
                  </span>
                  {i < p.milestones.length - 1 && <span className={cx("mt-1 w-px flex-1", mi.done ? "bg-good/40" : "bg-ink/10")} />}
                </div>
                <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3 pb-1">
                  <span className="flex items-center gap-2">
                    <span className={cx("text-[14px] font-semibold", mi.done && "text-ink-2 line-through")}>{mi.label}</span>
                    {isNext && <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-accent-ink">Next</span>}
                    {mi.hard && !mi.done && <span className="rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-warn-ink">Deadline</span>}
                  </span>
                  <span className="num text-[12.5px] font-medium text-ink-3">{mi.done ? "Done" : fmt(mi.date)}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {/* DEC 29 SETTLEMENT */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Dec 29 — settlement day</h2>
          <Link href="/debt" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent-ink">Debt <ArrowRight className="size-3.5" /></Link>
        </div>
        <p className="mt-1.5 text-[12.5px] text-ink-3">The grown live account (~{usd(p.liveTarget)}) splits three ways on the deadline.</p>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="rounded-[13px] border border-warn/40 bg-warn-soft p-3.5">
            <div className="eyebrow text-warn-ink">Clear the debt</div>
            <div className="num mt-1 text-[22px] font-bold tracking-[-0.03em] text-warn-ink">{usd(p.debtPayoff)}</div>
            <div className="mt-0.5 text-[11px] text-ink-3">paid in one shot</div>
          </div>
          <div className="rounded-[13px] border border-line bg-ink/[0.03] p-3.5">
            <div className="eyebrow">Buy $50K challenge</div>
            <div className="num mt-1 text-[22px] font-bold tracking-[-0.03em] text-ink">{usd(p.fiftyKFee)}</div>
            <div className="mt-0.5 text-[11px] text-ink-3">the next engine</div>
          </div>
          <div className="rounded-[13px] border border-line bg-ink/[0.03] p-3.5">
            <div className="eyebrow text-good-ink">Keep trading</div>
            <div className="num mt-1 text-[22px] font-bold tracking-[-0.03em] text-good-ink">{usd(Math.max(0, p.liveTarget - p.debtPayoff - p.fiftyKFee))}</div>
            <div className="mt-0.5 text-[11px] text-ink-3">stays in the live account</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function KpiTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "good" | "crit" }) {
  return (
    <div className="glass group relative overflow-hidden p-4 transition-shadow hover:shadow-[var(--shadow-float)]">
      <div className="eyebrow">{label}</div>
      <div className={cx("num mt-2 text-[26px] font-semibold leading-none tracking-[-0.04em]", tone === "warn" && "text-warn-ink", tone === "good" && "text-good-ink", tone === "crit" && "text-crit-ink")}>{value}</div>
      {sub && <div className="mt-2 text-[11.5px] text-ink-3">{sub}</div>}
    </div>
  );
}
