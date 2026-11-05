import { Suspense } from "react";
import { loadMission, scenarioProjections, sensitivity, liveProjection, yieldToStream } from "@/lib/data";
import { Assumption, Badge, Card, CardTitle, PageHeader, cx } from "@/components/ui";
import { FanChart, Histogram, Legend } from "@/components/charts";
import { ScenarioEditor } from "@/components/forms/settings-forms";
import { prob, usd, compactUsd, pct } from "@/lib/format";

export default function Planning() {
  const m = loadMission();
  return (
    <>
      <PageHeader
        eyebrow="Financial Planning"
        title="The financial engine"
        description="A day-by-day Monte Carlo of the whole mission: evaluations under real firm rules, activation and payout delays, payout eligibility, allocation, new challenge purchases and the personal account. Pass rates are an output of the trade assumptions, not a guess."
      />
      <div className="grid gap-4">
        <Suspense fallback={<Loading label="Running three scenarios" h={420} />}>
          <ScenarioTable />
        </Suspense>
        <Suspense fallback={<Loading label="Simulating outcome distribution" h={360} />}>
          <Distribution />
        </Suspense>
        <Suspense fallback={<Loading label="Running stress tests" h={380} />}>
          <Sensitivity />
        </Suspense>
        <Card>
          <CardTitle title="Scenario assumptions" hint="These are not your statistics. Once you have enough trades, Probability of Success switches to your own data automatically." right={<Assumption>editable assumptions</Assumption>} />
          <ScenarioEditor s={m.settings} />
        </Card>
        <Card>
          <CardTitle title="How to read this model" />
          <div className="grid gap-5 text-[13px] leading-5 text-ink-2 md:grid-cols-3">
            <div><div className="mb-1 font-semibold text-ink">What it simulates</div>Each trading day draws a Poisson number of trades. Each trade's R comes from the scenario (win/loss with variable winners, minus costs) or from your journal (bootstrap). Accounts trading the same day share outcomes with probability ρ={m.settings.simulation.crossAccountCorrelation}. Firm daily/max loss rules end accounts; targets plus minimum days pass phases.</div>
            <div><div className="mb-1 font-semibold text-ink">Policy it follows</div>Payouts are requested at {m.settings.policy.payoutTriggerPct}% growth if the best-day cap allows. Received cash funds new challenges (largest that fits {m.settings.policy.feeBudgetPct}% of cash above a ${m.settings.policy.reserveFloor} reserve, max {m.settings.policy.maxConcurrentProp} accounts). {m.settings.policy.personalPct}% of each payout funds the personal account. New challenges are only bought with payout money.</div>
            <div><div className="mb-1 font-semibold text-ink">Limitations</div>Intraday floating drawdown, slippage spikes, rule changes, firm payout denials, tax and behavioural decay are not modelled. Bootstrap mode also widens uncertainty by resampling your own sample for each path. Treat outputs as ranges, never promises.</div>
          </div>
        </Card>
      </div>
    </>
  );
}

function Loading({ label, h }: { label: string; h: number }) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-[13px] text-ink-3"><span className="size-2 animate-pulse rounded-full bg-fill" />{label}…</div>
      <div className="mt-4 animate-pulse rounded-xl bg-ink/[0.04]" style={{ height: h - 60 }} />
    </Card>
  );
}

async function ScenarioTable() {
  await yieldToStream();
  const m = loadMission();
  const rows = scenarioProjections(m);
  const tpl6 = m.settings.templates.find((t) => t.size === 6000);
  const startCap = m.wealth.realizedNetWealth;
  const line = (label: string, f: (r: (typeof rows)[number]) => React.ReactNode, hint?: string) => (
    <tr>
      <td className="whitespace-nowrap text-ink-2">{label}{hint && <div className="text-[11px] text-ink-3">{hint}</div>}</td>
      {rows.map((r) => <td key={r.key} className="num text-right">{f(r)}</td>)}
    </tr>
  );
  const feasible = rows.some((r) => r.result.probability >= 0.25);
  return (
    <Card>
      <CardTitle
        title="Three scenarios to the deadline"
        hint={`${rows[0].ctx.horizonDays} days from ${rows[0].ctx.startDay}. Median values across ${m.settings.simulation.paths.toLocaleString()} simulated paths per scenario.`}
        right={feasible ? <Badge tone="good">Feasible in at least one scenario</Badge> : <Badge tone="crit">Not feasible under any scenario</Badge>}
      />
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th />{rows.map((r) => <th key={r.key} className="text-right">{r.scenario.label}</th>)}</tr></thead>
          <tbody>
            {line("Edge assumption", (r) => <>{r.result.expectancyR.toFixed(2)}R · {Math.round(r.scenario.winRate * 100)}% WR · {r.scenario.riskPct}% risk</>)}
            {line("Starting capital (realized)", () => usd(startCap))}
            {line("Starting challenge", () => (rows[0].ctx.seededFirstChallenge ? `$6K (fee ${usd(tpl6?.price ?? 0)} assumed paid)` : "Your current accounts"))}
            {line("Evaluation pass rate", (r) => (r.result.evalPassRate == null ? "—" : pct(r.result.evalPassRate * 100, 0)), "simulated, not assumed")}
            {line("Days to first funded", (r) => r.result.medianDaysToFunded ?? "not in most paths")}
            {line("Days to first payout", (r) => r.result.medianDaysToFirstPayout ?? "not in most paths", "includes payout delay")}
            {line("Challenges failed", (r) => r.result.challengesFailedMean.toFixed(2), "mean per path")}
            {line("Challenge fees spent", (r) => usd(r.result.feesMedian), "after the first challenge")}
            {line("Payouts received", (r) => usd(r.result.payoutsMedian))}
            {line("Funded activation / payout delay", (r) => `${r.scenario.activationDelayDays}d / ${r.scenario.payoutDelayDays}d`)}
            {line("Probability of ending with nothing active", (r) => prob(r.result.ruinProbability))}
            <tr className="bg-ink/[0.06]">
              <td className="font-semibold">Six-month realized wealth</td>
              {rows.map((r) => <td key={r.key} className="num text-right"><div className="text-[15px] font-semibold">{usd(r.result.final.p50)}</div><div className="text-[11.5px] text-ink-3">{compactUsd(r.result.final.p5)} – {compactUsd(r.result.final.p95)} (90%)</div></td>)}
            </tr>
            <tr className="bg-ink/[0.06]">
              <td className="font-semibold">P(reach {compactUsd(m.settings.targetAmount)})</td>
              {rows.map((r) => <td key={r.key} className="num text-right text-[15px] font-semibold">{prob(r.result.probability)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12.5px] leading-[19px] text-ink-2">
        <b className="text-ink">Verdict: </b>
        {feasible
          ? "The target is reachable in at least one scenario, but only with the edge that scenario assumes. Verify that edge with your own data before relying on it."
          : `Under every scenario here, ${compactUsd(m.settings.targetAmount)} of realized wealth by the deadline is not mathematically likely. The bottleneck is time: evaluations, minimum days and payout cycles use up most of the six months before funded capital can compound. Use the median outcomes as your realistic targets and keep the process intact.`}
      </p>
    </Card>
  );
}

async function Distribution() {
  await yieldToStream();
  const m = loadMission();
  const live = liveProjection(m);
  const base = scenarioProjections(m).find((r) => r.key === "base")!;
  const r = live.result ?? base.result;
  const label = live.result ? `Your data (${live.ctx.live!.n} trades)` : "Base-case assumptions";
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <Card className="xl:col-span-7">
        <CardTitle title="Forecast fan" hint={`Realized wealth percentiles over time · ${label}`} right={<Legend items={[{ label: "Median", color: "#2a78d6" }, { label: "25–75%", color: "rgba(42,120,214,.35)" }, { label: "10–90%", color: "rgba(42,120,214,.15)" }]} />} />
        <FanChart data={r.fan} target={m.settings.targetAmount} />
      </Card>
      <Card className="xl:col-span-5">
        <CardTitle title="Monte Carlo outcome distribution" hint={r.histogram.some((h) => h.hit) ? `Final realized wealth across ${r.paths.toLocaleString()} paths. Blue bins are at or above the target.` : `Final realized wealth across ${r.paths.toLocaleString()} paths. The ${compactUsd(m.settings.targetAmount)} target lies beyond 99% of outcomes, so it is off this scale.`} />
        <Histogram data={r.histogram} />
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          {(["p5", "p50", "p95"] as const).map((k) => (
            <div key={k} className="rounded-xl bg-ink/[0.03] py-2">
              <div className="eyebrow">{k === "p50" ? "Median" : k === "p5" ? "5th pct" : "95th pct"}</div>
              <div className="num text-[15px] font-semibold">{usd(r.final[k])}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

async function Sensitivity() {
  await yieldToStream();
  const m = loadMission();
  const s = sensitivity(m);
  const base = s.rows[0].result;
  const dbl = s.rows.find((r) => r.label === "Always max size")?.result;
  return (
    <Card>
      <CardTitle title="Sensitivity analysis" hint={`What happens if… · ${s.usedLive ? "using your recorded trades" : "using base-case assumptions"} · ${s.rows[0].result.paths} paths each`} />
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Scenario</th><th>What changes</th><th className="text-right">Median wealth</th><th className="text-right">Δ vs baseline</th><th className="text-right">Pass rate</th><th className="text-right">First payout (days)</th><th className="text-right">P(goal)</th></tr></thead>
          <tbody>
            {s.rows.map((row, i) => {
              const d = row.result.final.p50 - base.final.p50;
              return (
                <tr key={row.label} className={cx(i === 0 && "bg-ink/[0.06]", row.label === "Always max size" && "bg-warn-soft")}>
                  <td className="font-medium whitespace-nowrap">{row.label}</td>
                  <td className="text-ink-2">{row.note}</td>
                  <td className="num text-right">{usd(row.result.final.p50)}</td>
                  <td className={cx("num text-right", i === 0 ? "text-ink-3" : d >= 0 ? "text-good-ink" : "text-crit-ink")}>{i === 0 ? "—" : `${d >= 0 ? "+" : "−"}${usd(Math.abs(d))}`}</td>
                  <td className="num text-right">{row.result.evalPassRate == null ? "—" : pct(row.result.evalPassRate * 100, 0)}</td>
                  <td className="num text-right">{row.result.medianDaysToFirstPayout ?? "—"}</td>
                  <td className="num text-right font-semibold">{prob(row.result.probability)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {dbl && (
        <p className="mt-3 text-[12.5px] leading-[19px] text-ink-2">
          <b className="text-ink">Always {m.settings.risk.maxRiskPerTradePct}% vs the smart ladder:</b> evaluation pass rate {pct((base.evalPassRate ?? 0) * 100, 0)} → {pct((dbl.evalPassRate ?? 0) * 100, 0)}, chance of ending with no active account {prob(base.ruinProbability)} → {prob(dbl.ruinProbability)}, 5th-percentile outcome {usd(base.final.p5)} → {usd(dbl.final.p5)}, median {usd(base.final.p50)} → {usd(dbl.final.p50)}.{" "}
          {dbl.final.p50 > base.final.p50
            ? "With a positive edge, more risk raises the median — but it moves you closer to the firm's loss limits, and this model assumes your edge and discipline stay the same at double size, which is rarely true in practice. The probability of reaching the target barely moves, which is why the system never recommends sizing up to meet a deadline."
            : "Higher risk does not improve the outcome here. Doubling size to catch up makes things worse."}
        </p>
      )}
    </Card>
  );
}
