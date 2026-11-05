import { BarChart3 } from "lucide-react";
import { loadMission } from "@/lib/data";
import { byPeriod, byWeekday, closedTrades, groupStats, rCurve, rHistogram, tradeStats, type GroupRow } from "@/lib/engine/stats";
import { Badge, Card, CardTitle, Empty, LinkButton, PageHeader, Segmented, Stat, cx } from "@/components/ui";
import { CountBars, DrawdownChart, HBars, SignedBars, TimeSeries, Legend, SERIES } from "@/components/charts";
import { PnlCalendar } from "@/components/calendar";
import { fmtDate, pct, rr, signedUsd, usd } from "@/lib/format";

export default async function Analytics({ searchParams }: { searchParams: Promise<{ account?: string; unit?: string }> }) {
  const sp = await searchParams;
  const m = await loadMission();
  const unitR = sp.unit !== "usd";
  const trades = sp.account ? m.trades.filter((t) => String(t.accountId) === sp.account) : m.trades;
  const closed = closedTrades(trades);
  const s = tradeStats(closed);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/analytics?${p}`;
  };

  if (!closed.length)
    return (
      <>
        <PageHeader eyebrow="Analytics" title="Performance analytics" />
        <Card><Empty title="No performance data yet" icon={<BarChart3 className="size-5" />}>Charts here fill in from your payouts and account progress as the plan runs.</Empty></Card>
      </>
    );

  let eq = 0;
  const equity = closed.map((t) => ({ day: t.day, equity: +(eq += t.pnl).toFixed(2) }));
  const curve = rCurve(closed);
  const months = byPeriod(closed, "month").map((p) => ({ key: fmtDate(p.key + "-01", { month: "short", year: "2-digit" }), value: +(unitR ? p.r : p.pnl).toFixed(2), n: p.n }));
  const weeks = byPeriod(closed, "week").map((p) => ({ key: fmtDate(p.key), value: +(unitR ? p.r : p.pnl).toFixed(2) }));
  const f = unitR ? "r" : "signedUsd";
  const toBars = (g: GroupRow[]) => g.slice(0, 10).map((x) => ({ key: x.key, value: +(unitR ? x.totalR : x.netPnl).toFixed(2), n: x.n }));
  const setups = groupStats(closed, (t) => t.setup);
  const strategies = groupStats(closed, (t) => t.strategy);
  const sessions = groupStats(closed, (t) => t.session);
  const instruments = groupStats(closed, (t) => t.instrument);
  const weekdays = byWeekday(closed);
  const conditions = groupStats(closed, (t) => t.marketCondition);
  const emotions = groupStats(closed, (t) => t.emotion);
  const quality = groupStats(closed, (t) => (t.executionQuality ? `Quality ${t.executionQuality}` : null));
  const grades = groupStats(closed, (t) => (t.grade ? `Grade ${t.grade}` : null)).sort((a, b) => a.key.localeCompare(b.key));
  const bestSession = sessions.filter((g) => g.n >= 3).sort((a, b) => b.avgR - a.avgR)[0];
  const bestSetup = setups.filter((g) => g.n >= 3).sort((a, b) => b.avgR - a.avgR)[0];
  const worstSetup = setups.filter((g) => g.n >= 3).sort((a, b) => a.avgR - b.avgR)[0];

  // Balance curves per account (stage-aware curves from the account engine).
  const accountCurves = m.states.filter((x) => x.curve.length > 1 && (!sp.account || String(x.account.id) === sp.account)).slice(0, 6);
  const byDay = new Map<string, Record<string, number | string>>();
  accountCurves.forEach((a, i) => a.curve.forEach((p) => byDay.set(p.day, { ...(byDay.get(p.day) ?? { day: p.day }), [`a${i}`]: p.balance })));
  const balanceRows = [...byDay.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)));

  const months2 = [...new Set(closed.map((t) => t.day.slice(0, 7)))].slice(-3);
  const scoreMap = new Map(m.scores.map((x) => [x.day, x.score]));

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title="What actually produces your results"
        description={`${s.n} closed trades${sp.account ? ` on ${m.accounts.find((a) => String(a.id) === sp.account)?.name}` : " across all accounts"}. Confidence intervals are shown where the sample allows; small groups are labelled.`}
        actions={
          <>
            <Segmented active={unitR ? "R" : "$"} items={[{ href: qs({ unit: undefined }), label: "R" }, { href: qs({ unit: "usd" }), label: "$" }]} />
            <form action="/analytics" className="flex gap-2">
              {sp.unit && <input type="hidden" name="unit" value={sp.unit} />}
              <select name="account" defaultValue={sp.account ?? ""} className="field h-9 w-48" aria-label="Account filter">
                <option value="">All accounts</option>
                {m.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button className="field h-9 w-auto px-3 text-[13px] font-medium">Apply</button>
            </form>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
        <Card><Stat size="sm" label="Win rate" value={pct(s.winRate * 100, 0)} sub={`CI ${pct(s.winRateCI[0] * 100, 0)}–${pct(s.winRateCI[1] * 100, 0)}`} /></Card>
        <Card><Stat size="sm" label="Expectancy" value={rr(s.avgR)} sub={Number.isFinite(s.expectancyCI[0]) ? `CI ${rr(s.expectancyCI[0])}…${rr(s.expectancyCI[1])}` : "n<2"} /></Card>
        <Card><Stat size="sm" label="Profit factor" value={s.profitFactor == null ? "∞" : s.profitFactor.toFixed(2)} /></Card>
        <Card><Stat size="sm" label="Avg winner" value={usd(s.avgWin)} sub={rr(s.avgWinR)} /></Card>
        <Card><Stat size="sm" label="Avg loser" value={usd(s.avgLoss)} sub={rr(s.avgLossR)} /></Card>
        <Card><Stat size="sm" label="Max drawdown" value={rr(-s.maxDrawdownR, 1)} sub={usd(s.maxDrawdown)} /></Card>
        <Card><Stat size="sm" label="Streaks" value={`${s.maxConsecWins}W / ${s.maxConsecLosses}L`} sub={s.currentStreak.kind === "none" ? "—" : `Now ${s.currentStreak.length}${s.currentStreak.kind === "win" ? "W" : "L"}`} /></Card>
        <Card><Stat size="sm" label="Net P/L" value={signedUsd(s.netPnl)} tone={s.netPnl >= 0 ? "text-good-ink" : "text-crit-ink"} /></Card>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Highlight label="Best session" g={bestSession} />
        <Highlight label="Best setup" g={bestSetup} />
        <Highlight label="Worst setup" g={worstSetup} bad />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardTitle title={unitR ? "Equity curve (R)" : "Equity curve ($)"} hint="Cumulative closed results, trade by trade. R normalises for different account sizes." />
          {unitR ? <TimeSeries data={curve} x="i" xf="none" f="r" series={[{ key: "r", label: "Cumulative R" }]} /> : <TimeSeries data={equity} f="signedUsd" series={[{ key: "equity", label: "Cumulative P/L" }]} />}
          <div className="mt-2"><div className="eyebrow mb-1">Drawdown from peak</div><DrawdownChart data={curve} /></div>
        </Card>
        <Card className="xl:col-span-4">
          <CardTitle title="R-multiple distribution" hint="Where your outcomes land. Fat right tails are where edges come from." />
          <CountBars data={rHistogram(closed)} height={320} />
        </Card>

        <Card className="xl:col-span-12">
          <CardTitle title="Balance by account" hint="Per stage (balances reset when an account changes phase)." right={<Legend items={accountCurves.map((a, i) => ({ label: a.account.name, color: SERIES[i] }))} />} />
          {balanceRows.length > 1 ? <TimeSeries data={balanceRows} area={false} series={accountCurves.map((a, i) => ({ key: `a${i}`, label: a.account.name, color: SERIES[i] }))} /> : <Empty title="Not enough history" />}
        </Card>

        <Card className="xl:col-span-6"><CardTitle title="Monthly performance" /><SignedBars data={months} f={f} label={unitR ? "R" : "P/L"} /></Card>
        <Card className="xl:col-span-6"><CardTitle title="Weekly performance" /><SignedBars data={weeks} f={f} label={unitR ? "R" : "P/L"} /></Card>

        <Card className="xl:col-span-6"><CardTitle title="By setup" /><HBars data={toBars(setups)} f={f} /><GroupTable rows={setups} /></Card>
        <Card className="xl:col-span-6"><CardTitle title="By strategy" /><HBars data={toBars(strategies)} f={f} /><GroupTable rows={strategies} /></Card>
        <Card className="xl:col-span-4"><CardTitle title="By session" /><HBars data={toBars(sessions)} f={f} /><GroupTable rows={sessions} compact /></Card>
        <Card className="xl:col-span-4"><CardTitle title="By weekday" /><HBars data={weekdays.map((x) => ({ key: x.key, value: +(unitR ? x.totalR : x.netPnl).toFixed(2) }))} f={f} /><GroupTable rows={weekdays} compact /></Card>
        <Card className="xl:col-span-4"><CardTitle title="By instrument" /><HBars data={toBars(instruments)} f={f} /><GroupTable rows={instruments} compact /></Card>
        <Card className="xl:col-span-4"><CardTitle title="By market condition" /><GroupTable rows={conditions} compact /></Card>
        <Card className="xl:col-span-4"><CardTitle title="By emotional state" hint="Self-reported labels." /><GroupTable rows={emotions} compact /></Card>
        <Card className="xl:col-span-4"><CardTitle title="By execution quality" /><GroupTable rows={quality.sort((a, b) => b.key.localeCompare(a.key))} compact /></Card>
        <Card className="xl:col-span-12"><CardTitle title="By setup grade" hint="Does sizing up on your A+ setups actually pay? R and $ per grade." /><GroupTable rows={grades} /></Card>

        <Card className="xl:col-span-12">
          <CardTitle title="Trading calendar" hint="Most recent months with closed trades." />
          <div className="grid gap-6 lg:grid-cols-3">
            {months2.map((mo) => (
              <div key={mo}>
                <div className="mb-2 text-[13px] font-semibold">{fmtDate(mo + "-01", { month: "long", year: "numeric" })}</div>
                <PnlCalendar days={byPeriod(closed, "day")} month={mo} scores={scoreMap} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function Highlight({ label, g, bad }: { label: string; g?: GroupRow; bad?: boolean }) {
  return (
    <Card>
      <div className="eyebrow mb-1.5">{label}</div>
      {g ? (
        <>
          <div className="text-[17px] font-semibold tracking-[-0.02em]">{g.key}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
            <span className={cx("num font-semibold", g.avgR >= 0 ? "text-good-ink" : "text-crit-ink")}>{rr(g.avgR)}/trade</span>
            <span>· {g.n} trades · {pct(g.winRate * 100, 0)} WR</span>
            {g.significant ? <Badge tone="dark">Significant</Badge> : <Badge>{g.n < 10 ? "Small sample" : "Not significant"}</Badge>}
          </div>
        </>
      ) : (
        <div className="text-[13px] text-ink-3">Needs ≥3 trades in a group{bad ? "" : ""}</div>
      )}
    </Card>
  );
}

function GroupTable({ rows, compact }: { rows: GroupRow[]; compact?: boolean }) {
  if (!rows.length) return <div className="text-[13px] text-ink-3">No data</div>;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="table">
        <thead><tr><th>Group</th><th className="text-right">n</th><th className="text-right">Win</th><th className="text-right">Avg R</th>{!compact && <th className="text-right">95% CI</th>}<th className="text-right">Net</th></tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key}>
              <td className="max-w-[160px] truncate font-medium">{g.key} {g.significant && <span title="Expectancy CI excludes zero" className="ml-1 inline-block size-1.5 rounded-full bg-fill align-middle" />}</td>
              <td className="num text-right text-ink-2">{g.n}</td>
              <td className="num text-right">{pct(g.winRate * 100, 0)}</td>
              <td className={cx("num text-right font-medium", g.avgR >= 0 ? "text-good-ink" : "text-crit-ink")}>{rr(g.avgR)}</td>
              {!compact && <td className="num text-right text-ink-3">{Number.isFinite(g.ci[0]) ? `${g.ci[0].toFixed(2)}…${g.ci[1].toFixed(2)}` : "—"}</td>}
              <td className="num text-right">{signedUsd(g.netPnl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
