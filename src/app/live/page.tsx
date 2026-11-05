import Link from "next/link";
import { redirect } from "next/navigation";
import { TrendingUp, Wallet, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { loadMission } from "@/lib/data";
import { addDays } from "@/lib/engine/util";
import { Card, cx, PageHeader, Progress, Ring } from "@/components/ui";
import { TrendChart } from "@/components/trend-chart";
import { PLAN, liveSchedule, liveGrowthChart, liveTarget } from "@/lib/growth-plan";
import { signedUsd, usd } from "@/lib/format";

export default async function LiveAccount() {
  const m = await loadMission();
  if (!m.settings.setupCompleted) redirect("/setup");

  const live = m.states.filter((s) => !s.isProp && !s.account.archived).sort((a, b) => a.account.createdAt.localeCompare(b.account.createdAt))[0];
  const L = (k: "transfer_to_personal" | "transfer_from_personal") => m.ledger.filter((e) => e.type === k).reduce((s, e) => s + e.amount, 0);
  const deposited = L("transfer_to_personal");
  const withdrawn = L("transfer_from_personal");
  const balance = live ? live.balance : 0;
  const netDeposited = Math.max(0, deposited - withdrawn);
  const tradingPnl = live ? live.profit : 0;          // balance − what you put in = what trading earned

  // The plan: grow this account from 5 weekly $300 payouts at 60%/week to ~$7,589 by Dec 29.
  const dl = m.strategy.plan.deadlines;
  const firstPayout = dl["payout1_0"] ?? addDays(m.today, 14);
  const GOAL = Math.round(liveTarget());
  const schedule = liveSchedule(firstPayout);
  const pct = Math.max(0, Math.min(100, (balance / GOAL) * 100));

  return (
    <>
      <PageHeader eyebrow="Live account" title="The growth engine" description={`Your one personal trading account. Every ${usd(PLAN.weeklyPayout)} payout goes in and compounds ${PLAN.weeklyGrowthPct}% a week toward ~${usd(GOAL)} by Dec 29.`} />

      {/* Balance + goal ring */}
      <Card className="mb-4">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-5">
            <Ring value={pct} size={128} stroke={11} tone="var(--color-accent)">
              <div className="text-center"><div className="num text-[24px] font-semibold tracking-[-0.04em]">{Math.round(pct)}%</div><div className="text-[11px] text-ink-3">of {usd(GOAL)}</div></div>
            </Ring>
            <div>
              <div className="eyebrow mb-1">Current balance</div>
              <div className="num text-[34px] font-semibold tracking-[-0.03em]">{usd(balance)}</div>
              <div className="mt-1 text-[12.5px] text-ink-3">Dec 29 target {usd(GOAL)} · {usd(Math.max(0, GOAL - balance))} to go</div>
            </div>
          </div>
          <div className="w-full sm:w-auto sm:min-w-[220px]">
            <Progress value={pct} tone="accent" />
            <p className="mt-2 text-[12px] leading-[17px] text-ink-3">Fund it with each {usd(PLAN.weeklyPayout)} payout and compound {PLAN.weeklyGrowthPct}% a week. On Dec 29 it clears the {usd(PLAN.debtPayoff)} debt and funds the $50K challenge — long-term capital, not an account you keep draining.</p>
          </div>
        </div>
      </Card>

      {/* Growth plan */}
      <Card className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="eyebrow">Growth plan to Dec 29</div>
          <span className="num text-[13px] font-semibold text-good-ink">{usd(GOAL)} projected</span>
        </div>
        <p className="mb-3 text-[12.5px] text-ink-3">{PLAN.payoutCount} weekly {usd(PLAN.weeklyPayout)} payouts, each grown {PLAN.weeklyGrowthPct}% — deposit, then compound.</p>
        <TrendChart name="Live account" color="var(--color-good)" data={liveGrowthChart(firstPayout)} />
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {schedule.map((w) => (
            <div key={w.n} className={cx("rounded-[12px] border p-2.5", w.cushion ? "border-warn/40 bg-warn-soft" : "border-line bg-ink/[0.03]")}>
              <div className="flex items-center justify-between"><div className="eyebrow">{w.label}</div>{w.cushion && <span className="text-[9px] font-semibold uppercase text-warn-ink">Cushion</span>}</div>
              <div className="num mt-1 text-[16px] font-semibold tracking-[-0.03em]">{usd(w.end)}</div>
              <div className="text-[10.5px] text-good-ink">+{usd(w.deposit)} in</div>
            </div>
          ))}
        </div>
      </Card>

      {/* The split that matters: deposits vs profit */}
      <Card className="mb-4">
        <div className="eyebrow mb-3">Where the balance comes from</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric icon={<ArrowDownLeft className="size-4" />} label="Deposited" value={usd(netDeposited)} sub="money you put in" />
          <Metric icon={<TrendingUp className="size-4" />} label="Trading profit" value={signedUsd(tradingPnl)} sub="earned by trading" tone={tradingPnl >= 0 ? "good" : "crit"} />
          <Metric icon={<ArrowUpRight className="size-4" />} label="Withdrawn" value={usd(withdrawn)} sub="taken back out" />
          <Metric icon={<Wallet className="size-4" />} label="Balance" value={usd(balance)} sub="deposits + profit" strong />
        </div>
        <div className="mt-4 rounded-[12px] bg-ink/[0.03] p-3.5 text-[12.5px] leading-5 text-ink-2">
          <b className="text-ink">Why this split matters.</b> Only <b className="text-ink">{signedUsd(tradingPnl)}</b> is real trading performance. The rest of your balance is capital you deposited — it isn&apos;t profit. Judge the account by its trading profit and capital preservation, not by its size.
        </div>
      </Card>

      {/* Growth log */}
      <Card className="mb-4">
        <div className="eyebrow mb-3">Account growth</div>
        {live && live.curve.length > 1 ? (
          <div className="space-y-1.5 text-[13px]">
            <Row k="Starting balance" v={usd(live.curve[0].balance)} />
            <Row k="Peak balance" v={usd(live.peakBalance)} />
            <Row k="Net growth since start" v={signedUsd(balance - live.curve[0].balance)} tone={balance - live.curve[0].balance >= 0 ? "good" : "crit"} />
            <Row k="Capital preserved" v={live.balance >= netDeposited ? "Yes — above deposits" : `Below deposits by ${usd(netDeposited - live.balance)}`} tone={live.balance >= netDeposited ? "good" : "crit"} />
          </div>
        ) : (
          <div className="rounded-[12px] border border-dashed border-line px-4 py-6 text-center">
            <p className="text-[13.5px] font-medium text-ink">No live account funded yet.</p>
            <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-ink-2">Set it up when you make your first deposit — it records as a transfer from your cash, so deposits never count as profit.</p>
            <Link href="/accounts" className="mt-3 inline-flex items-center gap-1.5 rounded-[11px] bg-fill px-3.5 py-2 text-[13px] font-semibold text-fill-fg">Set up the account</Link>
          </div>
        )}
      </Card>
    </>
  );
}

function Metric({ icon, label, value, sub, tone, strong }: { icon: React.ReactNode; label: string; value: string; sub: string; tone?: "good" | "crit"; strong?: boolean }) {
  return (
    <div className={cx("rounded-[14px] p-3.5", strong ? "bg-fill text-fill-fg" : "bg-ink/[0.03]")}>
      <div className={cx("mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.05em]", strong ? "text-white/70" : "text-ink-3")}>{icon}{label}</div>
      <div className={cx("num text-[20px] font-semibold tracking-[-0.02em]", !strong && tone === "good" && "text-good-ink", !strong && tone === "crit" && "text-crit-ink")}>{value}</div>
      <div className={cx("text-[11.5px]", strong ? "text-white/60" : "text-ink-3")}>{sub}</div>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "good" | "crit" }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-1.5 last:border-0">
      <span className="text-ink-2">{k}</span>
      <span className={cx("num font-semibold", tone === "good" && "text-good-ink", tone === "crit" && "text-crit-ink")}>{v}</span>
    </div>
  );
}
