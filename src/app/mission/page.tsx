import { Suspense } from "react";
import { CheckCircle2, Circle, Lock, ArrowRight } from "lucide-react";
import { loadMission, requiredEdge, actionsFor, yieldToStream } from "@/lib/data";
import { Assumption, Badge, Card, CardTitle, PageHeader, Progress, StatusIcon, cx } from "@/components/ui";
import { NextActionCard } from "@/components/blocks";
import { ProbabilityCard, ProbabilitySkeleton } from "@/components/probability";
import { TimeSeries, Legend } from "@/components/charts";
import { compactUsd, fmtDate, prob, usd } from "@/lib/format";
import { daysBetween } from "@/lib/engine/util";

type Status = "done" | "current" | "locked";

export default function Mission() {
  const m = loadMission();
  const { settings: s, states, payouts, wealth, clock } = m;
  const props = states.filter((x) => x.isProp);
  const small = props.find((x) => x.account.size <= 10_000);
  const big = props.filter((x) => x.account.size >= 50_000);
  const received = payouts.filter((p) => p.status === "received");
  const firstPayout = received.sort((a, b) => (a.receivedAt ?? "").localeCompare(b.receivedAt ?? ""))[0];
  const bigFunded = big.find((x) => x.account.phase2PassedAt);
  const bigPayout = received.find((p) => big.some((b) => b.account.id === p.accountId));
  const personal = states.filter((x) => !x.isProp);

  const stages: { n: number; title: string; status: Status; goal: string; entry: string; exit: string; detail: string[] }[] = [
    {
      n: 1, title: "FundedNext $6K — pass both phases", status: small?.account.phase2PassedAt ? "done" : small ? "current" : "current",
      goal: "Prove the process under real rules with the smallest possible fee at risk.",
      entry: "Challenge purchased ($59.99 list price).",
      exit: "Phase 1 (8%) and Phase 2 (5%), ≥5 trading days each, no breach.",
      detail: ["Risk ≤0.5% per trade: 8% needs ~16R of net profit. A two-week Phase 1 means ~1.6R per trading day — not a realistic plan at sane risk.", "Budget 3–8 weeks per phase. No time limit exists, so there is no reason to rush."],
    },
    {
      n: 2, title: "First payout from the $6K account", status: firstPayout ? "done" : small?.account.phase2PassedAt ? "current" : "locked",
      goal: "Convert the first funded profit into real cash and recover the fee.",
      entry: "Funded, KYC approved.",
      exit: "On-Demand payout received (≥2% growth, best day ≤40% of profit).",
      detail: ["A $500 first withdrawal needs ~$490 profit (8.2%) after the $59.99 fee refund at 90% split — close to the full 10% loss allowance.", `Recommended: withdraw at ~${s.policy.payoutTriggerPct}% growth (≈$${Math.round(6000 * s.policy.payoutTriggerPct / 100 * 0.9 + 60)} incl. refund). That already covers a $25K fee and builds toward the $50K fee.`],
    },
    {
      n: 3, title: "Second challenge — $50K two-step", status: bigFunded ? "done" : big.length ? "current" : firstPayout ? "current" : "locked",
      goal: "Scale capacity using payout money only — never fresh savings under pressure.",
      entry: "Payout received, reserve ≥ floor, fee ≤ fee budget. FundedNext $50K Stellar 2-Step list price $299.99 (not $240 — check current promotions).",
      exit: "Both phases passed; KYC already done.",
      detail: ["If the payout can't cover $300 + reserve, buy the $15K/$25K instead or wait for a second $6K payout.", "EAs are not permitted on $50K+ FundedNext accounts."],
    },
    {
      n: 4, title: "$50K funded → payouts → personal capital", status: bigPayout ? "done" : bigFunded ? "current" : "locked",
      goal: "Turn funded capacity into steady withdrawals and start real-capital trading.",
      entry: "$50K funded.",
      exit: "First $50K payout received and allocated (reserve / challenge / personal / other).",
      detail: [`Conservative payout plan: request at ${s.policy.payoutTriggerPct}% growth (≈${usd(50_000 * s.policy.payoutTriggerPct / 100 * 0.9)} at 90%). Larger targets keep more profit at risk for longer.`, `Personal account funded with ${s.policy.personalPct}% of payout remainder only after the scaling gate passes.`],
    },
    {
      n: 5, title: "Scaling — earned, not scheduled", status: bigPayout ? "current" : "locked",
      goal: "Add accounts only when evidence supports it; pause when it doesn't.",
      entry: "Scaling gate: ≥30 trades, positive expectancy, no critical alerts, execution score ≥70.",
      exit: `Mission end (${fmtDate(s.missionEnd, { month: "short", day: "numeric", year: "numeric" })}) or ${compactUsd(s.targetAmount)} reached.`,
      detail: [`Max ${s.policy.maxConcurrentProp} concurrent prop accounts and ${compactUsd(s.policy.maxFundedAllocation)} total allocation (assumption — verify the firm's cap).`, "Pause scaling after any account failure, a negative 20-trade expectancy, or a breach of the weekly loss limit."],
    },
  ];

  const ms = [
    { label: "$6K Phase 1 passed", done: !!small?.account.phase1PassedAt, date: small?.account.phase1PassedAt },
    { label: "$6K funded", done: !!small?.account.phase2PassedAt, date: small?.account.phase2PassedAt },
    { label: "First payout received", done: !!firstPayout, date: firstPayout?.receivedAt },
    { label: "$50K challenge purchased", done: big.length > 0, date: big[0]?.account.startDate },
    { label: "$50K funded", done: !!bigFunded, date: bigFunded?.account.phase2PassedAt },
    { label: "Personal live account opened", done: personal.length > 0, date: personal[0]?.account.startDate },
    ...[1000, 5000, 10_000, 25_000, s.targetAmount / 2, s.targetAmount].map((v) => {
      const hit = m.timeline.find((p) => p.wealth >= v);
      return { label: `${compactUsd(v)} realized`, done: !!hit && wealth.realizedNetWealth >= 0, date: hit?.day };
    }),
  ];
  const nextMs = ms.find((x) => !x.done);
  const pacedSeries = m.timeline.map((p) => ({ ...p, paced: s.startingCash + (s.targetAmount - s.startingCash) * Math.min(1, Math.max(0, daysBetween(s.missionStart, p.day) / clock.totalDays)) }));

  return (
    <>
      <PageHeader
        eyebrow={`${compactUsd(s.targetAmount)} Mission`}
        title={<>The <span className="font-display italic font-normal">{compactUsd(s.targetAmount)}</span> Challenge</>}
        description={<>Objective: <b className="text-ink">{usd(s.targetAmount)} of realized, withdrawable net wealth</b> by {fmtDate(s.missionEnd, { month: "long", day: "numeric", year: "numeric" })}. Funded balances, paper profit and pending payouts never count.</>}
      />

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardTitle title="Where am I right now?" hint={nextMs ? <>Next milestone: <b className="text-ink">{nextMs.label}</b></> : "All milestones reached."} right={clock.elapsedDays === 0 ? <Badge>Not started</Badge> : <Badge tone={clock.aheadBy >= 0 ? "good" : "warn"}>{clock.aheadBy >= 0 ? `Ahead by ${usd(clock.aheadBy)}` : `Behind pace by ${usd(-clock.aheadBy)}`}</Badge>} />
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <div className="eyebrow mb-1">Money</div>
              <div className="num text-[34px] font-semibold tracking-[-0.04em]">{usd(wealth.realizedNetWealth)}</div>
              <Progress value={clock.goalPct} tone="accent" className="mt-2 h-2" />
              <div className="mt-1.5 text-[12px] text-ink-3 num">{clock.goalPct.toFixed(2)}% of {usd(s.targetAmount)}</div>
            </div>
            <div>
              <div className="eyebrow mb-1">Time</div>
              <div className="num text-[34px] font-semibold tracking-[-0.04em]">{clock.elapsedDays}<span className="text-[18px] text-ink-3"> / {clock.totalDays} days</span></div>
              <Progress value={clock.timePct} tone="ink" className="mt-2 h-2" />
              <div className="mt-1.5 text-[12px] text-ink-3 num">{clock.timePct.toFixed(1)}% elapsed · {clock.remainingDays} days remain</div>
            </div>
          </div>
          <div className="mt-5">
            <Legend items={[{ label: "Realized net wealth", color: "#2a78d6" }, { label: "Linear pace to target", color: "#868c99", dashed: true }]} />
            <TimeSeries data={pacedSeries} series={[{ key: "wealth", label: "Realized" }, { key: "paced", label: "Linear pace", color: "#868c99", dashed: true, area: false }]} height={220} />
          </div>
        </Card>
        <div className="xl:col-span-4">
          <Suspense fallback={<ProbabilitySkeleton />}><ProbabilityCard detailed /></Suspense>
        </div>

        <div className="xl:col-span-12">
          <NextActionCard actions={actionsFor(m, null)} />
        </div>

        <Card className="xl:col-span-8">
          <CardTitle title="Progression model" hint="Each stage unlocks on actual results and available capital — not on calendar dates." />
          <ol className="relative space-y-1">
            {stages.map((st, i) => (
              <li key={st.n} className="relative flex gap-4 pb-5 last:pb-0">
                {i < stages.length - 1 && <span className="absolute top-8 bottom-0 left-[15px] w-px bg-line-strong" />}
                <div className={cx("z-10 grid size-8 shrink-0 place-items-center rounded-full", st.status === "done" ? "bg-good text-fill-fg" : st.status === "current" ? "bg-fill text-fill-fg" : "bg-fill text-ink-4 shadow-[0_0_0_1px_var(--color-line-strong)]")}>
                  {st.status === "done" ? <CheckCircle2 className="size-4" /> : st.status === "locked" ? <Lock className="size-3.5" /> : <span className="text-[12px] font-semibold">{st.n}</span>}
                </div>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14.5px] font-semibold tracking-[-0.01em]">{st.title}</h3>
                    {st.status === "current" && <Badge tone="accent">Current</Badge>}
                  </div>
                  <p className="mt-0.5 text-[13px] text-ink-2">{st.goal}</p>
                  <div className="mt-2 grid gap-2 text-[12.5px] sm:grid-cols-2">
                    <div><span className="eyebrow mr-1.5">Entry</span><span className="text-ink-2">{st.entry}</span></div>
                    <div><span className="eyebrow mr-1.5">Exit</span><span className="text-ink-2">{st.exit}</span></div>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {st.detail.map((d) => <li key={d} className="flex gap-2 text-[12.5px] leading-[18px] text-ink-3"><ArrowRight className="mt-0.5 size-3 shrink-0" />{d}</li>)}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="xl:col-span-4">
          <CardTitle title="Milestones" />
          <ul className="space-y-0.5">
            {ms.map((x) => (
              <li key={x.label} className={cx("flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-[13px]", x === nextMs && "bg-accent-soft")}>
                {x.done ? <CheckCircle2 className="size-4 text-good" /> : <Circle className={cx("size-4", x === nextMs ? "text-accent" : "text-ink-4")} />}
                <span className={cx("flex-1", x.done ? "text-ink" : "text-ink-2")}>{x.label}</span>
                <span className="num text-[12px] text-ink-3">{x.done ? fmtDate(x.date) : x === nextMs ? "Next" : ""}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="xl:col-span-7">
          <CardTitle title="Workflow audit" hint="Weaknesses found in the original plan, and how the system handles each." />
          <div className="space-y-3">
            {AUDIT.map((a) => (
              <div key={a.title} className="rounded-xl bg-ink/[0.06] p-3.5 shadow-[0_0_0_1px_var(--color-line)]">
                <div className="flex items-start gap-2">
                  <StatusIcon level={a.level} className="mt-0.5" />
                  <div>
                    <div className="text-[13.5px] font-semibold">{a.title}</div>
                    <div className="mt-0.5 text-[12.5px] leading-[19px] text-ink-2">{a.body}</div>
                    <div className="mt-1.5 text-[12.5px] leading-[19px] text-ink"><span className="eyebrow mr-1">Fix</span>{a.fix}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4 xl:col-span-5">
          <Suspense fallback={<Card><div className="eyebrow">What it would take</div><div className="mt-3 h-40 animate-pulse rounded-xl bg-ink/[0.04]" /></Card>}>
            <RequiredEdge />
          </Suspense>
          <Card>
            <CardTitle title="Plan-killers" hint="The mistakes that end the mission, in order of how often they end prop careers." />
            <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-5 text-ink-2 marker:text-ink-3">
              <li><b className="text-ink">Raising risk to hit a deadline.</b> The sensitivity table shows doubled risk lowers the odds of surviving evaluations.</li>
              <li><b className="text-ink">Revenge trading after a loss.</b> Watched by the risk engine (re-entry within 15 minutes, size after losses).</li>
              <li><b className="text-ink">Treating several accounts as several bets.</b> Mirrored trades are one bet with several fees at risk.</li>
              <li><b className="text-ink">Counting funded balances as wealth.</b> Only received money moves the goal line.</li>
              <li><b className="text-ink">Unverified rules or KYC.</b> A passed account that can't pay out is worth nothing.</li>
              <li><b className="text-ink">Spending the reserve on challenges.</b> The reserve floor is enforced in every allocation.</li>
            </ol>
          </Card>
          <Card>
            <CardTitle title="Eligibility to check before buying" right={<Assumption>verify yourself</Assumption>} />
            <ul className="space-y-1.5 text-[12.5px] leading-[18px] text-ink-2">
              <li>• Minimum age and country eligibility in the firm's terms (not stated in the rules article).</li>
              <li>• KYC: national ID, passport or residence permit; proof of address may be requested. Must be approved within 30 days of passing.</li>
              <li>• Payout methods available in your country, and any sanctions restrictions on the payment rails.</li>
              <li>• The payout option (On-Demand vs 21-day) is chosen at checkout and cannot be changed later.</li>
              <li>• Prop payouts are usually taxable income where you live. Check your local rules.</li>
              <li>• Copy trading involving FundedNext accounts is prohibited. Check before running the same trades on several accounts.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

async function RequiredEdge() {
  await yieldToStream();
  const m = loadMission();
  const rows = requiredEdge(m);
  const sc = m.settings.scenarios;
  return (
    <Card>
      <CardTitle title="What it would take" hint={`Probability of ${compactUsd(m.settings.targetAmount)} by the deadline vs edge per trade, holding the base-case risk (${sc.base.riskPct}%), frequency and policy fixed.`} right={<Assumption>model</Assumption>} />
      <table className="table">
        <thead><tr><th>Expectancy / trade</th><th>Needs avg win</th><th className="text-right">Median outcome</th><th className="text-right">P(goal)</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.expectancy}>
              <td className="num font-medium">{r.expectancy.toFixed(2)}R {Math.abs(r.expectancy - (sc.base.winRate * sc.base.avgWinR - (1 - sc.base.winRate) * sc.base.avgLossR - sc.base.costR)) < 0.08 && <Badge tone="accent">≈ base</Badge>}</td>
              <td className="num text-ink-2">{r.avgWinR.toFixed(1)}R @ {Math.round(sc.base.winRate * 100)}% WR</td>
              <td className="num text-right">{usd(r.median)}</td>
              <td className="num text-right font-semibold">{prob(r.probability)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[12px] leading-[18px] text-ink-3">Most consistently profitable discretionary traders sit well below 0.5R per trade after costs. If the goal only becomes likely at edges you have not shown, the deadline is the variable to move, not the risk.</p>
    </Card>
  );
}

const AUDIT: { level: "critical" | "warning" | "info"; title: string; body: string; fix: string }[] = [
  {
    level: "critical",
    title: "A six-month money target this size is far out of reach at sustainable risk",
    body: "At 0.5% risk and a strong 0.2–0.5R edge, a funded account grows about 2–10% a month. Even at a full $300K allocation (assumed cap) and 4%/month, that is about $11K/month of payouts. You only reach that size after several months of evaluations, so the reachable range is low five figures. The “What it would take” table shows that even edges several times stronger than a very good trader's do not make it likely at 0.5% risk.",
    fix: "Track the target as the north star, but judge success on process milestones and realized wealth. Never close the gap by raising risk; extend the timeline instead.",
  },
  {
    level: "warning",
    title: "Phase 1 in ~2 weeks implies ~1.6R per trading day",
    body: "8% at 0.5% risk is 16R of net profit. Ten trading days means 1.6R a day, which pushes you toward oversizing. Reaching the target early also doesn't skip the 5-day minimum.",
    fix: "No timer exists on Stellar 2-Step. The plan uses no deadline for evaluations; the daily planner caps trades and risk.",
  },
  {
    level: "warning",
    title: "A $500 first payout from $6K needs ~8.2% growth",
    body: "At 90% split plus the $59.99 refund, $500 needs about $490 of profit. That is roughly 80% of the 10% loss allowance, held at risk until withdrawn, and it must satisfy the 40% best-day cap.",
    fix: `Withdraw at ~${4}% growth (≈$276 with refund). Do it twice if needed. The allocation calculator then decides between a $25K now or the $50K after the next payout.`,
  },
  {
    level: "info",
    title: "The $50K price assumption ($240) is below the current list price",
    body: "The official help centre lists the $50K Stellar 2-Step at $299.99. Discounts come and go.",
    fix: "Templates use list prices (verified 31 Oct 2026); you enter what you actually paid.",
  },
  {
    level: "warning",
    title: "Funded + personal trading is mostly one bet",
    body: "Running the same ideas on a funded and a personal account doubles exposure to one decision. Copy trading involving FundedNext accounts is also prohibited.",
    fix: "Combined exposure, idea de-duplication, currency-leg concentration and a mirrored-trade alert are built into the Risk Center. The Monte Carlo correlates accounts (default ρ=0.8).",
  },
  {
    level: "info",
    title: "Funded accounts have a 3% max open-risk rule",
    body: "Stellar funded accounts cap risk at 3% of initial balance at any time. Quick Strike (≤30s trades) must stay under 30% of profit, and profits from trades within ±5 min of high-impact news count only 40%.",
    fix: "All three are tracked per account and flagged before they cost you an account or a payout.",
  },
];
