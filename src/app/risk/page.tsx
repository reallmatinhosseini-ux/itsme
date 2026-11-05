import Link from "next/link";
import { loadMission } from "@/lib/data";
import { ideaKey, tradeRiskPct, checklistComplete } from "@/lib/engine/risk";
import { dayKey, weekKey, sum } from "@/lib/engine/util";
import { Badge, Card, CardTitle, Empty, KV, PageHeader, Progress, Ring, Stat, cx } from "@/components/ui";
import { AlertList } from "@/components/blocks";
import { CountBars, TimeSeries } from "@/components/charts";
import { pct, signedUsd, usd, fmtDate } from "@/lib/format";

export default async function Risk() {
  const m = await loadMission();
  const R = m.settings.risk;
  const live = m.states.filter((s) => !s.account.archived && s.account.stage !== "failed");
  const todays = m.trades.filter((t) => dayKey(t.openedAt) === m.today);
  const ideas = new Set(todays.map(ideaKey)).size;
  const wk = weekKey(m.today);
  const weekPnl = sum(m.closed.filter((t) => weekKey(t.day) === wk).map((t) => t.pnl));
  const recent = m.closed.slice(-60);
  const riskSeries = recent.map((t, i) => ({ i: i + 1, day: t.day, risk: +tradeRiskPct(t, m.sizeOf).toFixed(3), limit: R.maxRiskPerTradePct }));
  const buckets = new Map<string, number>();
  for (const t of recent) {
    const p = tradeRiskPct(t, m.sizeOf);
    const b = p <= 0.25 ? "≤0.25%" : p <= 0.5 ? "0.25–0.5%" : p <= 0.75 ? "0.5–0.75%" : p <= 1 ? "0.75–1%" : p <= 1.5 ? "1–1.5%" : ">1.5%";
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  const dist = ["≤0.25%", "0.25–0.5%", "0.5–0.75%", "0.75–1%", "1–1.5%", ">1.5%"].map((b) => ({ bucket: b, count: buckets.get(b) ?? 0 }));
  let streak = 0;
  for (let i = m.closed.length - 1; i >= 0 && m.closed[i].pnl < 0; i--) streak++;
  const checklistRate = m.trades.length ? m.trades.filter(checklistComplete).length / m.trades.length : null;
  const reviewed = m.logs.filter((l) => l.reviewCompletedAt).length;
  const crit = m.alerts.filter((a) => a.level === "critical").length;
  const warn = m.alerts.filter((a) => a.level === "warning").length;
  const health = Math.max(0, 100 - crit * 35 - warn * 12);

  return (
    <>
      <PageHeader
        eyebrow="Risk Center"
        title="Survive first. Everything else compounds from there."
        description={<>Limits come from <Link href="/settings" className="text-accent-ink hover:underline">Settings</Link>; firm rules come from each account. This page never suggests more risk to catch up.</>}
      />

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-4">
          <CardTitle title="Risk health" hint="Starts at 100; critical alerts cost 35, warnings 12." />
          <div className="flex items-center gap-6">
            <Ring value={health} size={128} stroke={11} tone={health >= 80 ? "var(--color-good)" : health >= 50 ? "var(--color-warn)" : "var(--color-crit)"}>
              <div className="num text-[28px] font-semibold tracking-[-0.04em]">{health}</div>
            </Ring>
            <div className="flex-1 space-y-0.5">
              <KV k="Critical" v={crit} tone={crit ? "text-crit-ink" : undefined} />
              <KV k="Warnings" v={warn} />
              <KV k="Info" v={m.alerts.length - crit - warn} />
            </div>
          </div>
        </Card>
        <Card className="xl:col-span-8">
          <CardTitle title="Today & this week" />
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            <Gauge label="Trade ideas today" value={ideas} max={R.maxTradesPerDay} fmt={(v) => `${v}/${R.maxTradesPerDay}`} />
            <Gauge label="Consecutive losses" value={streak} max={R.maxConsecutiveLosses} fmt={(v) => `${v}/${R.maxConsecutiveLosses}`} />
            <Stat label="Realized today" value={signedUsd(m.exposure.todayRealized)} tone={m.exposure.todayRealized >= 0 ? "text-good-ink" : "text-crit-ink"} size="sm" sub={`Worst case ${signedUsd(m.exposure.todayWorstCase)}`} />
            <Stat label="This week" value={signedUsd(weekPnl)} tone={weekPnl >= 0 ? "text-good-ink" : "text-crit-ink"} size="sm" sub={`Weekly stop ${R.maxWeeklyLossPct}% per account`} />
          </div>
        </Card>

        <Card className="xl:col-span-7">
          <CardTitle title="Active alerts" hint="Drawdown, behaviour, sessions, firm conduct rules, and model deviation." />
          <AlertList alerts={m.alerts} />
        </Card>

        <div className="space-y-4 xl:col-span-5">
          <Card>
            <CardTitle title="Drawdown by account" hint="Share of each limit already consumed." />
            {live.length ? (
              <div className="space-y-4">
                {live.map((s) => (
                  <div key={s.account.id}>
                    <div className="mb-1.5 flex justify-between text-[13px]"><span className="font-medium">{s.account.name}</span><span className="text-ink-3 num">{usd(s.balance)} · floor {usd(s.maxLossFloor)}</span></div>
                    <Limit label={`Daily (${s.isProp ? s.account.dailyLossPct : R.maxDailyLossPct}%)`} v={s.dailyLossUsedPct} warn={R.drawdownWarnPct} />
                    <Limit label={`Max loss (${s.isProp ? s.account.maxLossPct : R.personalMaxDrawdownPct}%)`} v={s.drawdownUsedPct} warn={R.drawdownWarnPct} />
                    {s.isProp && s.account.stage === "funded" && <Limit label={`Open risk (cap ${s.account.maxOpenRiskPct}%)`} v={(s.openRiskPct / s.account.maxOpenRiskPct) * 100} warn={R.drawdownWarnPct} />}
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="No active accounts" />
            )}
          </Card>
          <Card>
            <CardTitle title="Combined exposure" hint="Positions on different accounts in the same idea count once as an idea, but their risk adds up." />
            <KV k="Open positions" v={m.exposure.openPositions} />
            <KV k="Distinct ideas" v={m.exposure.ideas} />
            <KV k="Total open risk" v={usd(m.exposure.openRisk)} />
            <KV k="Correlated clusters" v={m.exposure.correlatedGroups.length ? m.exposure.correlatedGroups.map((g) => g.ccy).join(", ") : "None"} tone={m.exposure.correlatedGroups.length ? "text-warn-ink" : undefined} />
            <Link href="/accounts" className="mt-2 inline-block text-[12.5px] font-medium text-accent-ink hover:underline">Currency breakdown →</Link>
          </Card>
        </div>

        <Card className="xl:col-span-8">
          <CardTitle title="Risk per trade" hint={`Last ${recent.length} closed trades, % of account. Dashed line is your ${R.maxRiskPerTradePct}% limit.`} />
          {recent.length ? (
            <TimeSeries data={riskSeries} x="i" xf="none" f="pct" series={[{ key: "risk", label: "Risk %", area: false }]} refY={R.maxRiskPerTradePct} refLabel="Limit" height={220} />
          ) : (
            <Empty title="No closed trades yet" />
          )}
        </Card>
        <Card className="xl:col-span-4">
          <CardTitle title="Risk distribution" />
          {recent.length ? <CountBars data={dist} height={220} color="#2a78d6" /> : <Empty title="No data" />}
        </Card>

        <Card className="xl:col-span-12">
          <CardTitle title="Process compliance" hint="Mandatory pre-trade checklist (in the trade form) and post-session review (in the Daily Planner)." />
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            <Stat label="Checklist completion" value={checklistRate == null ? "—" : pct(checklistRate * 100, 0)} size="sm" />
            <Stat label="Days reviewed" value={reviewed} size="sm" sub={`${m.logs.filter((l) => l.planCompletedAt).length} days planned`} />
            <Stat label="Avg execution score" value={m.avgScore == null ? "—" : Math.round(m.avgScore)} size="sm" sub="Last 10 trading days" />
            <Stat label="Last breach" value={live.flatMap((s) => s.breaches).length ? <Badge tone="crit">Active</Badge> : "None"} size="sm" sub={m.accounts.filter((a) => a.stage === "failed").map((a) => `${a.name} failed ${fmtDate(a.failedAt)}`)[0]} />
          </div>
        </Card>

        <Card className="xl:col-span-12">
          <CardTitle title="Your configured limits" right={<Link href="/settings" className="text-[12.5px] font-medium text-accent-ink hover:underline">Edit</Link>} />
          <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
            <KV k="Max risk / trade" v={`${R.maxRiskPerTradePct}%`} />
            <KV k="Daily stop" v={`${R.maxDailyLossPct}%`} />
            <KV k="Weekly stop" v={`${R.maxWeeklyLossPct}%`} />
            <KV k="Max trades / day" v={R.maxTradesPerDay} />
            <KV k="Pause after losses" v={R.maxConsecutiveLosses} />
            <KV k="Warn at limit used" v={`${R.drawdownWarnPct}%`} />
            <KV k="Escalation flag" v={`>${R.riskEscalationFactor}× median`} />
            <KV k="Sessions" v={R.allowedSessions.join(", ")} />
          </div>
        </Card>
      </div>
    </>
  );
}

function Limit({ label, v, warn }: { label: string; v: number; warn: number }) {
  return (
    <div className="mb-1.5 flex items-center gap-3 text-[12px]">
      <span className="w-36 shrink-0 text-ink-3">{label}</span>
      <Progress value={v} tone={v >= 85 ? "crit" : v >= warn ? "warn" : "ink"} marker={warn} />
      <span className={cx("w-10 shrink-0 text-right num", v >= warn && "font-semibold")}>{pct(v, 0)}</span>
    </div>
  );
}

function Gauge({ label, value, max, fmt }: { label: string; value: number; max: number; fmt: (v: number) => string }) {
  const p = (value / Math.max(1, max)) * 100;
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="num text-[17px] font-semibold">{fmt(value)}</div>
      <Progress value={p} tone={p >= 100 ? "crit" : p >= 67 ? "warn" : "ink"} className="mt-2" />
    </div>
  );
}
