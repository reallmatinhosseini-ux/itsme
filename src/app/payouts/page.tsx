import { HandCoins, ArrowRight } from "lucide-react";
import { loadMission, activeSampler } from "@/lib/data";
import { payoutScenarios } from "@/lib/engine/payout";
import { daysBetween, mean } from "@/lib/engine/util";
import { Assumption, Badge, Card, CardTitle, Empty, PageHeader, Stat, StatusIcon, cx } from "@/components/ui";
import { AllocationCalculator, ProgressPayoutSheet, RequestPayoutSheet } from "@/components/forms/payout-forms";
import { TimeSeries } from "@/components/charts";
import { PLAN, liveTarget } from "@/lib/growth-plan";
import { fmtDate, prob, usd, usd2 } from "@/lib/format";

export default async function Payouts() {
  const m = await loadMission();
  const funded = m.states.filter((s) => s.isProp && s.account.stage === "funded" && !s.account.archived);
  const personal = m.states.filter((s) => !s.isProp && !s.account.archived).map((s) => ({ id: s.account.id, name: s.account.name }));
  const active = m.states.filter((s) => s.isProp && !s.account.archived && s.account.stage !== "failed");
  const nominal = active.reduce((s, x) => s + x.account.size, 0);
  const received = m.payouts.filter((p) => p.status === "received");
  const lag = received.filter((p) => p.receivedAt).map((p) => daysBetween(p.requestedAt, p.receivedAt!));
  const sampler = activeSampler(m);
  const debtOpen = m.wealth.debts.filter((d) => d.outstanding > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const debt = debtOpen ? { id: debtOpen.id, outstanding: debtOpen.outstanding, dueDate: debtOpen.dueDate } : null;
  const lastReceived = [...received].sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""))[0];

  // Payout scenarios for each funded account, or the planned $50K if none is funded yet.
  const targets = funded.length
    ? funded.map((s) => ({ name: s.account.name, size: s.account.size, pnl: s.payout?.cycleProfit ?? 0, split: s.account.splitPct, refund: s.payout?.feeRefundDue ?? 0, a: s.account }))
    : [{ name: "Planned $50K funded (hypothetical)", size: 50_000, pnl: 0, split: 90, refund: 299.99, a: null }];

  return (
    <>
      <PageHeader eyebrow="Payouts" title="Turning paper profit into real money" description="Only received payouts count toward the mission. Requested and approved amounts are tracked separately until the cash arrives." />

      {/* The payout plan */}
      <Card className="mb-4 border-accent/30 bg-accent-soft/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow text-accent-ink">The payout plan</div>
            <h2 className="mt-0.5 text-[15px] font-semibold">{PLAN.payoutCount} weekly {usd(PLAN.weeklyPayout)} payouts → 100% into the live account</h2>
            <p className="mt-1 text-[12.5px] text-ink-2">Each payout is deposited and compounded {PLAN.weeklyGrowthPct}% a week. By Dec 29 the live account reaches ~{usd(liveTarget())}, which clears the {usd(PLAN.debtPayoff)} debt and funds the $50K challenge. After the $50K is funded, the weekly transfer rises to {usd(PLAN.scaleTransfer)}.</p>
          </div>
          <a href="/live" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent-ink">Live account <ArrowRight className="size-3.5" /></a>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card><Stat label="Requested" value={usd(m.wealth.requested)} size="sm" sub={`${m.payouts.filter((p) => p.status === "requested").length} pending`} /></Card>
        <Card><Stat label="Approved" value={usd(m.wealth.approved)} size="sm" sub="Not yet received" /></Card>
        <Card><Stat label="Received (net)" value={usd(m.wealth.receivedNet)} size="sm" tone="text-good-ink" sub={`${received.length} payout(s)`} /></Card>
        <Card><Stat label="Fees on payouts" value={usd(received.reduce((s, p) => s + p.fees, 0))} size="sm" sub={`${usd(m.wealth.refunds)} challenge fees refunded`} /></Card>
        <Card className="col-span-2 lg:col-span-1"><Stat label="Avg request → received" value={lag.length ? `${mean(lag).toFixed(1)} days` : "—"} size="sm" sub="FundedNext: approved requests processed within 24h" /></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <Card>
            <CardTitle title="Payout eligibility" hint="Tracked from your journal. Always confirm on the firm dashboard before requesting." />
            {funded.length ? (
              <div className="space-y-4">
                {funded.map((s) => (
                  <div key={s.account.id} className="rounded-2xl bg-ink/[0.06] p-4 shadow-[0_0_0_1px_var(--color-line)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2"><span className="text-[14px] font-semibold">{s.account.name}</span>{s.payout?.eligible ? <Badge tone="good">Eligible</Badge> : <Badge>Not yet</Badge>}</div>
                        <div className="mt-0.5 text-[12.5px] text-ink-3">Cycle profit {usd2(s.payout?.cycleProfit ?? 0)} → your share <b className="text-ink num">{usd2(s.payout?.traderShare ?? 0)}</b>{s.payout?.feeRefundDue ? <> + {usd2(s.payout.feeRefundDue)} refund</> : null}</div>
                      </div>
                      <RequestPayoutSheet today={m.today} account={{ id: s.account.id, name: s.account.name, cycleProfit: s.payout?.cycleProfit ?? 0, splitPct: s.account.splitPct, refund: s.payout?.feeRefundDue ?? 0, eligible: !!s.payout?.eligible }} />
                    </div>
                    <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                      {s.payout?.checks.map((c) => (
                        <div key={c.label} className="flex items-center gap-2 text-[12.5px]"><StatusIcon level={c.ok ? "good" : "pending"} /><span className="flex-1 text-ink-2">{c.label}</span><span className="num text-ink-3">{c.detail}</span></div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="No funded accounts yet" icon={<HandCoins className="size-5" />}>Pass both phases first. Eligibility (≥2% growth, best day ≤40% of profit, KYC approved) is checked here automatically.</Empty>
            )}
          </Card>

          {targets.map((t) => {
            const res = payoutScenarios({
              size: t.size, currentPnl: t.pnl, splitPct: t.split, refund: t.refund,
              minGrowthPct: t.a?.payoutMinGrowthPct ?? 2, maxLossPct: t.a?.maxLossPct ?? 10, dailyLossPct: t.a?.dailyLossPct ?? 5,
              riskPct: sampler.riskPct, tradesPerDay: sampler.tradesPerDay, sampler: sampler.sampler, seed: m.settings.simulation.seed,
            });
            return (
              <Card key={t.name}>
                <CardTitle
                  title={`Withdrawal scenarios · ${t.name}`}
                  hint={`P(reach the trigger before breaching max/daily loss), from ${sampler.source === "data" ? `your ${sampler.n} trades` : "base-case assumptions"} at ${sampler.riskPct.toFixed(2)}% risk.`}
                  right={sampler.source === "assumption" ? <Assumption>assumption</Assumption> : <Badge tone="accent">your data</Badge>}
                />
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>Request at</th><th className="text-right">Profit</th><th className="text-right">Your share</th><th className="text-right">+ refund</th><th className="text-right">P(reach)</th><th className="text-right">Median days</th><th className="text-right">Cash / 30 trading days</th></tr></thead>
                    <tbody>
                      {res.rows.map((r) => (
                        <tr key={r.triggerPct} className={cx(r.triggerPct === res.recommended && "bg-accent-soft")}>
                          <td className="font-medium num">{r.triggerPct}% {r.triggerPct === res.recommended && <Badge tone="accent" className="ml-1">Recommended</Badge>}</td>
                          <td className="num text-right">{usd(r.gross)}</td>
                          <td className="num text-right">{usd(r.share)}</td>
                          <td className="num text-right">{usd(r.withRefund)}</td>
                          <td className="num text-right font-semibold">{prob(r.pReach)}</td>
                          <td className="num text-right">{r.medianDays ?? "—"}</td>
                          <td className="num text-right">{usd(r.evPer30)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-[12px] leading-[18px] text-ink-3">
                  The recommendation maximises expected cash per unit of time among triggers with at least a 50% chance of being reached, breaking ties toward the smaller trigger. Larger targets keep more profit exposed for longer; after each payout the balance resets to the starting level. {res.recommended == null && "No trigger reaches 50% — your current edge does not support a reliable payout plan yet."}
                </p>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4 xl:col-span-5">
          <Card>
            <CardTitle title="Allocation calculator" hint="Every recommendation states its reason. Uses your reserve floor, fee budget and scaling gate." />
            <AllocationCalculator settings={m.settings} gate={m.gate} cashBefore={m.wealth.cash} activeProp={active.length} nominal={nominal} initial={lastReceived?.receivedAmount ?? 500} debt={debt} />
          </Card>
          {received.length > 0 && (
            <Card>
              <CardTitle title="Cumulative realized payouts" />
              <TimeSeries data={m.timeline} series={[{ key: "payouts", label: "Payouts (net)" }]} height={180} />
            </Card>
          )}
        </div>

        <Card className="xl:col-span-12" pad={false}>
          <div className="p-5 pb-0"><CardTitle title="Payout history" /></div>
          {m.payouts.length ? (
            <div className="overflow-x-auto px-2 pb-2">
              <table className="table">
                <thead><tr><th>Account</th><th>Status</th><th>Requested</th><th>Approved</th><th>Received</th><th className="text-right">Split</th><th className="text-right">Requested $</th><th className="text-right">Received $</th><th className="text-right">Fees</th><th className="text-right">Net</th><th>Destination</th><th>Allocation</th><th /></tr></thead>
                <tbody>
                  {[...m.payouts].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)).map((p) => {
                    const alloc = JSON.parse(p.allocation) as Record<string, number>;
                    const net = (p.receivedAmount ?? 0) + (p.status === "received" ? p.feeRefund : 0) - p.fees;
                    return (
                      <tr key={p.id}>
                        <td className="font-medium whitespace-nowrap">{m.accounts.find((a) => a.id === p.accountId)?.name}</td>
                        <td><Badge tone={p.status === "received" ? "good" : p.status === "rejected" ? "crit" : p.status === "approved" ? "accent" : "warn"}>{p.status}</Badge></td>
                        <td className="num">{fmtDate(p.requestedAt)}</td>
                        <td className="num">{fmtDate(p.approvedAt)}</td>
                        <td className="num">{fmtDate(p.receivedAt)}</td>
                        <td className="num text-right">{p.splitPct}%</td>
                        <td className="num text-right">{usd2(p.requestedAmount)}</td>
                        <td className="num text-right">{p.receivedAmount != null ? usd2(p.receivedAmount) : "—"}</td>
                        <td className="num text-right">{usd2(p.fees)}</td>
                        <td className="num text-right font-semibold">{p.status === "received" ? usd2(net) : "—"}</td>
                        <td className="text-ink-2">{p.destination ?? "—"}</td>
                        <td className="text-[12px] whitespace-nowrap text-ink-2">{Object.keys(alloc).length ? Object.entries(alloc).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${usd(v)}`).join(" · ") : "—"}</td>
                        <td><ProgressPayoutSheet payout={p} personal={personal} settings={m.settings} gate={m.gate} cashBefore={m.wealth.cash} activeProp={active.length} nominal={nominal} today={m.today} debt={debt} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No payouts yet">Your first payout will appear here — requested, approved and received are tracked separately.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
