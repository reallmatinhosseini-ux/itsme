import Link from "next/link";
import { Sparkles, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { loadMission, onTrackText } from "@/lib/data";
import { findings, periodReport, type Finding } from "@/lib/engine/insights";
import { weekKey, monthKey } from "@/lib/engine/util";
import { Badge, Card, CardTitle, Empty, PageHeader, Segmented, Stat, Strength, cx } from "@/components/ui";
import { NarrativeButton } from "@/components/forms/narrative";
import { fmtDate, pct, rr, signedUsd } from "@/lib/format";

export default async function Insights({ searchParams }: { searchParams: Promise<{ period?: string; key?: string }> }) {
  const sp = await searchParams;
  const m = await loadMission();
  const period = sp.period === "month" ? "month" : "week";
  const fn = period === "week" ? weekKey : monthKey;
  const keys = [...new Set([...m.closed.map((t) => fn(t.day)), fn(m.today)])].sort().reverse();
  const key = sp.key && keys.includes(sp.key) ? sp.key : keys[0];
  const all = findings(m.closed, m.settings.risk.maxTradesPerDay);
  const report = periodReport(period, key, m.closed, m.scores, onTrackText(m), m.settings.risk.maxTradesPerDay);
  const kinds: Record<Finding["kind"], string> = { mistake: "Recurring mistake", behaviour: "Behaviour change", deterioration: "Deterioration", overtrading: "Overtrading", emotion: "Emotional pattern", strategy: "Strategy", expectancy: "Expectancy", plan: "Plan vs execution" };

  return (
    <>
      <PageHeader
        eyebrow="AI Insights"
        title="What the evidence says — and how strong it is"
        description="Findings are computed by a transparent statistics engine (Welch tests, confidence intervals, sample sizes). Each is graded significant, suggestive or anecdotal. An optional Claude summary works only from these numbers."
      />

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardTitle title="Findings" hint={`${m.closed.length} closed trades analysed`} />
          {all.length ? (
            <ul className="space-y-2.5">
              {all.map((f, i) => (
                <li key={i} className="flex gap-3 rounded-xl bg-ink/[0.06] p-3.5 shadow-[0_0_0_1px_var(--color-line)]">
                  <div className={cx("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", f.tone === "negative" ? "bg-crit-soft text-crit-ink" : f.tone === "positive" ? "bg-good-soft text-good-ink" : "bg-ink/5 text-ink-2")}>
                    {f.tone === "negative" ? <TrendingDown className="size-3.5" /> : f.tone === "positive" ? <TrendingUp className="size-3.5" /> : <Minus className="size-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5"><span className="eyebrow">{kinds[f.kind]}</span><Strength s={f.strength} /><span className="text-[11px] text-ink-3 num">n={f.n}</span></div>
                    <div className="text-[13.5px] font-semibold leading-5">{f.title}</div>
                    <div className="mt-0.5 text-[12.5px] leading-[18px] text-ink-2">{f.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title={m.closed.length < 5 ? "Not enough data for findings" : "No notable patterns"} icon={<Sparkles className="size-5" />}>
              {m.closed.length < 5 ? `${m.closed.length}/5 closed trades. Findings appear once there is something to compare — and are graded by sample size.` : "Nothing stands out yet. That's a valid result."}
            </Empty>
          )}
        </Card>

        <div className="space-y-4 xl:col-span-5">
          <Card>
            <CardTitle title="Grading" />
            <div className="space-y-2 text-[12.5px] leading-[18px] text-ink-2">
              <div className="flex gap-2"><Strength s="significant" /><span>p &lt; 0.05 with n ≥ 20, or a group's expectancy CI excludes zero (n ≥ 10).</span></div>
              <div className="flex gap-2"><Strength s="suggestive" /><span>n ≥ 10 and p &lt; 0.2. Worth watching, not acting on alone.</span></div>
              <div className="flex gap-2"><Strength s="anecdotal" /><span>Small sample. Shown for awareness only.</span></div>
            </div>
          </Card>
          <Card>
            <CardTitle title="Model vs reality" />
            <div className="grid grid-cols-2 gap-4">
              <Stat size="sm" label="Your expectancy" value={m.stats.n ? rr(m.stats.avgR) : "—"} sub={m.stats.n >= 2 && Number.isFinite(m.stats.expectancyCI[0]) ? `CI ${rr(m.stats.expectancyCI[0])}…${rr(m.stats.expectancyCI[1])}` : "Need data"} />
              <Stat size="sm" label="Base-case model" value={rr(m.settings.scenarios.base.winRate * m.settings.scenarios.base.avgWinR - (1 - m.settings.scenarios.base.winRate) * m.settings.scenarios.base.avgLossR - m.settings.scenarios.base.costR)} sub="Assumption" />
            </div>
          </Card>
        </div>

        <Card className="xl:col-span-12">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold">{period === "week" ? "Weekly" : "Monthly"} report · {report.label}</h2>
              <p className="text-[12.5px] text-ink-3">{report.n} trades · {signedUsd(report.netPnl)} · {rr(report.totalR, 1)} · win rate {report.n ? pct(report.winRate * 100, 0) : "—"} · execution score {report.avgScore == null ? "—" : Math.round(report.avgScore)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented active={period === "week" ? "Weekly" : "Monthly"} items={[{ href: "/insights?period=week", label: "Weekly" }, { href: "/insights?period=month", label: "Monthly" }]} />
              <div className="flex max-w-[420px] gap-1 overflow-x-auto">
                {keys.slice(0, 8).map((k) => (
                  <Link key={k} href={`/insights?period=${period}&key=${k}`} scroll={false} className={cx("rounded-lg px-2.5 py-1 text-[12px] whitespace-nowrap", k === key ? "bg-fill text-fill-fg" : "text-ink-2 hover:bg-ink/5")}>
                    {period === "week" ? fmtDate(k) : fmtDate(k + "-01", { month: "short", year: "2-digit" })}
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Q n={1} q="What went well?" items={report.wentWell} />
            <Q n={2} q="What went wrong?" items={report.wentWrong} />
            <Q n={3} q="What is statistically significant?" items={report.significant} />
            <Q n={4} q="What should change?" items={report.change} />
            <Q n={5} q="What should remain unchanged?" items={report.keep} />
            <Q n={6} q="Am I still on track?" items={[report.onTrack]} />
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <NarrativeButton period={period} periodKey={key} />
          </div>
        </Card>
      </div>
    </>
  );
}

function Q({ n, q, items }: { n: number; q: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-ink/[0.06] p-4 shadow-[0_0_0_1px_var(--color-line)]">
      <div className="mb-2 flex items-center gap-2"><Badge tone="dark">{n}</Badge><span className="text-[13px] font-semibold">{q}</span></div>
      <ul className="space-y-1.5">
        {items.map((x, i) => <li key={i} className="text-[12.5px] leading-[18px] text-ink-2">{x}</li>)}
      </ul>
    </div>
  );
}
