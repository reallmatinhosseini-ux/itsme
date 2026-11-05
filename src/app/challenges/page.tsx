import { Trophy, ShieldCheck, ShieldQuestion, Plus } from "lucide-react";
import { loadMission } from "@/lib/data";
import type { AccountState } from "@/lib/engine/accounts";
import { daysBetween, dayKey } from "@/lib/engine/util";
import { Badge, Card, CardTitle, Empty, KV, PageHeader, Progress, Segmented, Stat, StatusIcon, cx } from "@/components/ui";
import { AccountSheet } from "@/components/forms/account-form";
import { StageControls, AdjustmentSheet } from "@/components/forms/account-controls";
import { stageTone } from "@/components/blocks";
import { TimeSeries } from "@/components/charts";
import { fmtDate, pct, signedPct, signedUsd, stageLabel, usd, compactUsd } from "@/lib/format";

export default async function Challenges({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = "active" } = await searchParams;
  const m = await loadMission();
  const props = m.states.filter((s) => s.isProp);
  const shown = props.filter((s) => (view === "archived" ? s.account.archived : view === "all" ? true : !s.account.archived));
  const fees = props.reduce((s, x) => s + x.account.purchasePrice, 0);
  const failed = props.filter((s) => s.account.stage === "failed");
  const failedCost = failed.reduce((s, x) => s + x.account.purchasePrice, 0);
  const refunds = m.payouts.filter((p) => p.status === "received").reduce((s, p) => s + p.feeRefund, 0);
  const funded = props.filter((s) => s.account.stage === "funded" || s.account.phase2PassedAt);
  const ended = props.filter((s) => s.account.stage === "failed" || s.account.phase2PassedAt).length;

  return (
    <>
      <PageHeader
        eyebrow="Challenge Tracker"
        title="Every evaluation, every rule, every dollar"
        description="Firm rules are tracked per account. Stage changes are confirmed by you after the firm confirms them — this app never assumes a pass."
        actions={<AccountSheet templates={m.settings.templates} today={m.today} trigger={<><Plus className="size-4" /> Add challenge</>} />}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card><Stat label="Challenges" value={props.length} sub={`${props.filter((s) => !s.account.archived && s.account.stage !== "failed").length} active`} /></Card>
        <Card><Stat label="Pass rate" value={ended ? pct((funded.length / ended) * 100, 0) : "—"} sub={ended ? `${funded.length} of ${ended} finished` : "No finished evaluations"} /></Card>
        <Card><Stat label="Fees paid" value={usd(fees)} sub={`${usd(refunds)} refunded so far`} /></Card>
        <Card><Stat label="Failed challenge cost" value={usd(failedCost)} tone={failedCost ? "text-crit-ink" : undefined} sub={`${failed.length} failed · fees are sunk`} /></Card>
        <Card className="col-span-2 lg:col-span-1"><Stat label="Net challenge cost" value={usd(fees - refunds)} sub="Fees minus refunds" /></Card>
      </div>

      <Card className="mb-4">
        <CardTitle title="Challenge progression timeline" hint="Phase 1 → Phase 2 → Funded. Hatched bars ended in failure." />
        {props.length ? <Timeline states={props} start={m.settings.missionStart} end={m.settings.missionEnd} today={m.today} /> : <Empty title="No challenges yet" icon={<Trophy className="size-5" />}>Add the $6K FundedNext challenge to begin.</Empty>}
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <Segmented active={view === "archived" ? "Archived" : view === "all" ? "All" : "Active"} items={[{ href: "/challenges", label: "Active" }, { href: "/challenges?view=archived", label: "Archived" }, { href: "/challenges?view=all", label: "All" }]} />
      </div>

      {shown.length === 0 ? (
        <Card>
          <Empty title={view === "archived" ? "Nothing archived" : "No active challenges"} icon={<Trophy className="size-5" />} action={view !== "archived" && <AccountSheet templates={m.settings.templates} today={m.today} trigger="Add the $6K challenge" />}>
            Stage 1 of the mission: FundedNext Stellar 2-Step, $6K, On-Demand payout.
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {shown.map((s) => <ChallengeCard key={s.account.id} s={s} m={m} />)}
        </div>
      )}

      {props.length > 1 && (
        <Card className="mt-4" pad={false}>
          <div className="p-5 pb-0"><CardTitle title="Compare accounts" /></div>
          <div className="overflow-x-auto px-2 pb-2">
            <table className="table">
              <thead><tr><th>Account</th><th>Stage</th><th className="text-right">Size</th><th className="text-right">Fee</th><th className="text-right">P/L</th><th className="text-right">Days</th><th className="text-right">DD used</th><th className="text-right">Trades</th><th>Started</th><th className="text-right">Age</th></tr></thead>
              <tbody>
                {props.map((s) => (
                  <tr key={s.account.id} className={s.account.archived ? "opacity-60" : ""}>
                    <td className="font-medium">{s.account.name}</td>
                    <td><Badge tone={stageTone(s.account.stage)}>{stageLabel[s.account.stage]}</Badge></td>
                    <td className="num text-right">{compactUsd(s.account.size)}</td>
                    <td className="num text-right">{usd(s.account.purchasePrice)}</td>
                    <td className={cx("num text-right", s.profit >= 0 ? "text-good-ink" : "text-crit-ink")}>{signedUsd(s.profit)} <span className="text-ink-3">({signedPct(s.profitPct, 1)})</span></td>
                    <td className="num text-right">{s.tradingDays}</td>
                    <td className="num text-right">{pct(s.drawdownUsedPct, 0)}</td>
                    <td className="num text-right">{s.allTrades}</td>
                    <td className="num">{fmtDate(s.account.startDate)}</td>
                    <td className="num text-right">{daysBetween(s.account.startDate, s.account.failedAt ?? m.today)}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function ChallengeCard({ s, m }: { s: AccountState; m: Awaited<ReturnType<typeof loadMission>> }) {
  const a = s.account;
  const phaseStatus = (p: 1 | 2) => {
    const passed = p === 1 ? a.phase1PassedAt : a.phase2PassedAt;
    if (passed) return <Badge tone="good">Passed {fmtDate(passed)}</Badge>;
    if (a.stage === "failed" && ((p === 1 && !a.phase1PassedAt) || (p === 2 && a.phase1PassedAt))) return <Badge tone="crit">Failed {fmtDate(a.failedAt)}</Badge>;
    if (a.stage === `phase${p}`) return <Badge tone="accent">In progress</Badge>;
    return <Badge>Pending</Badge>;
  };
  const accPayouts = m.payouts.filter((p) => p.accountId === a.id);

  return (
    <Card as="article" className={cx(a.archived && "opacity-70")}>
      <div id={`acct-${a.id}`} className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[16px] font-semibold tracking-[-0.02em]">{a.name}</h3>
            <Badge tone={stageTone(a.stage)}>{stageLabel[a.stage]}</Badge>
            {a.rulesVerifiedAt ? (
              <span title={`Rules verified ${a.rulesVerifiedAt}`}><ShieldCheck className="size-4 text-good" /></span>
            ) : (
              <span title="Rules not verified against your purchase"><ShieldQuestion className="size-4 text-warn" /></span>
            )}
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-3">{a.firm} · {a.model} · {a.payoutModel} · ${a.size.toLocaleString()} · paid {usd(a.purchasePrice)} · started {fmtDate(a.startDate)}{a.deadline ? ` · target ${fmtDate(a.deadline)}` : ""}</div>
        </div>
        <AccountSheet templates={m.settings.templates} account={a} variant="ghost" today={m.today} trigger="Edit" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Balance" value={usd(s.balance)} size="sm" />
        <Stat label="Stage P/L" value={signedPct(s.profitPct)} tone={s.profit >= 0 ? "text-good-ink" : "text-crit-ink"} size="sm" sub={signedUsd(s.profit)} />
        <Stat label="Today" value={signedUsd(s.todayPnl)} size="sm" sub={`${pct(s.dailyLossUsedPct, 0)} of daily limit`} />
        <Stat label="Hard floor" value={usd(s.maxLossFloor)} size="sm" sub={`${pct(s.drawdownUsedPct, 0)} of max loss used`} />
      </div>

      {s.targetPct != null && (
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-[12px]">
            <span className="text-ink-2">Profit target {s.targetPct}% ({usd((a.size * s.targetPct) / 100)})</span>
            <span className="num font-medium">{pct(Math.min(100, (s.targetProgress ?? 0) * 100), 0)}</span>
          </div>
          <Progress value={(s.targetProgress ?? 0) * 100} tone="accent" />
          <div className="mt-2.5 mb-1.5 flex justify-between text-[12px]">
            <span className="text-ink-2">Minimum trading days</span>
            <span className="num font-medium">{s.tradingDays}/{a.minTradingDays}</span>
          </div>
          <Progress value={(s.tradingDays / Math.max(1, a.minTradingDays)) * 100} tone={s.minDaysMet ? "good" : "ink"} />
        </div>
      )}
      <div className="mt-2.5">
        <div className="mb-1.5 flex justify-between text-[12px]"><span className="text-ink-2">Max loss used ({a.maxLossPct}% {a.maxLossType})</span><span className="num font-medium">{pct(s.drawdownUsedPct, 0)}</span></div>
        <Progress value={s.drawdownUsedPct} tone={s.drawdownUsedPct >= 85 ? "crit" : s.drawdownUsedPct >= 60 ? "warn" : "ink"} />
      </div>

      {s.curve.length > 2 && (
        <div className="mt-4">
          <TimeSeries data={s.curve} series={[{ key: "balance", label: "Balance" }]} height={140} refY={s.maxLossFloor} refLabel="Max-loss floor" />
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="eyebrow mb-1">Evaluation</div>
          <KV k="Phase 1" v={phaseStatus(1)} />
          <KV k="Phase 2" v={phaseStatus(2)} />
          <KV k="Daily loss limit" v={`${a.dailyLossPct}% · ${usd(s.dailyLossLimit)}`} />
          <KV k="KYC" v={<Badge tone={a.kycStatus === "approved" ? "good" : a.kycStatus === "pending" ? "warn" : "neutral"}>{a.kycStatus.replace("_", " ")}</Badge>} />
        </div>
        <div>
          <div className="eyebrow mb-1">Payout</div>
          {s.payout ? (
            <ul className="space-y-1">
              {s.payout.checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-[12.5px]">
                  <StatusIcon level={c.ok ? "good" : "pending"} className="mt-px" />
                  <span className="flex-1 text-ink-2">{c.label}</span>
                  <span className="num text-ink-3">{c.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <KV k="Split" v={`${a.splitPct}%`} />
              <KV k="On-Demand rule" v={`≥${a.payoutMinGrowthPct}% · best day ≤${a.bestDayCapPct}%`} />
              <KV k="Payouts" v={accPayouts.length} />
            </>
          )}
        </div>
      </div>

      {s.breaches.length > 0 && (
        <div className="mt-4 space-y-1.5 rounded-xl bg-crit-soft p-3">
          {s.breaches.map((b) => <div key={b} className="flex items-center gap-2 text-[12.5px] text-crit-ink"><StatusIcon level="critical" /> {b} — confirm on the firm dashboard and mark failed if so.</div>)}
        </div>
      )}
      {s.transition && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-good-soft p-3 text-[12.5px] text-good-ink">
          <StatusIcon level="good" /> Target and minimum days met. Confirm the pass with the firm, then advance the stage.
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <StageControls id={a.id} stage={a.stage} archived={a.archived} ready={s.transition} />
        <AdjustmentSheet accountId={a.id} today={m.today} />
      </div>
    </Card>
  );
}

function Timeline({ states, start, end, today }: { states: AccountState[]; start: string; end: string; today: string }) {
  const first = [start, ...states.map((s) => s.account.startDate)].sort()[0];
  const last = [end, today].sort().pop()!;
  const total = Math.max(1, daysBetween(first, last));
  const x = (d: string) => (Math.max(0, Math.min(total, daysBetween(first, d))) / total) * 100;
  const months: string[] = [];
  for (let d = new Date(first.slice(0, 7) + "-01T00:00"); d <= new Date(last + "T00:00"); d.setMonth(d.getMonth() + 1, 1)) months.push(dayKey(d));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="relative ml-[160px] h-6 border-b border-line text-[11px] text-ink-3">
          {months.map((mo) => (
            <span key={mo} className="absolute top-0 -translate-x-1/2 num" style={{ left: `${x(mo < first ? first : mo)}%` }} hidden={mo < first && months.length > 1}>{fmtDate(mo, { month: "short" })}</span>
          ))}
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute top-0 bottom-0 ml-[160px] w-[calc(100%-160px)]">
            <div className="absolute top-0 bottom-0 w-px bg-fill" style={{ left: `${x(today)}%` }} />
            <div className="absolute top-0 bottom-0 w-px bg-ink/[0.04]" style={{ left: `${x(end)}%` }} />
          </div>
          {states.map((s) => {
            const a = s.account;
            const p1End = a.phase1PassedAt ?? (a.stage === "phase1" ? today : a.failedAt ?? today);
            const segs: { from: string; to: string; cls: string; label: string }[] = [{ from: a.startDate, to: p1End, cls: "bg-s1/70", label: "Phase 1" }];
            if (a.phase1PassedAt) segs.push({ from: a.phase1PassedAt, to: a.phase2PassedAt ?? (a.stage === "phase2" ? today : a.failedAt ?? today), cls: "bg-s7/70", label: "Phase 2" });
            if (a.phase2PassedAt) segs.push({ from: a.phase2PassedAt, to: a.failedAt ?? today, cls: "bg-s3/80", label: "Funded" });
            const failedSeg = a.stage === "failed" ? segs.length - 1 : -1;
            return (
              <div key={a.id} className="flex h-10 items-center border-b border-line last:border-0">
                <div className="w-[160px] shrink-0 truncate pr-3 text-[12.5px] font-medium">{a.name}</div>
                <div className="relative h-5 flex-1">
                  {segs.map((g, i) => (
                    <div
                      key={i}
                      title={`${g.label}: ${fmtDate(g.from)} → ${fmtDate(g.to)}`}
                      className={cx("absolute top-0 h-5 rounded-[6px]", g.cls)}
                      style={{
                        left: `${x(g.from)}%`,
                        width: `max(6px, ${x(g.to) - x(g.from)}%)`,
                        backgroundImage: i === failedSeg ? "repeating-linear-gradient(135deg, rgba(255,255,255,.55) 0 3px, transparent 3px 7px)" : undefined,
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 ml-[160px] flex flex-wrap gap-4 text-[11.5px] text-ink-2">
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-s1/70" />Phase 1</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-s7/70" />Phase 2</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-s3/80" />Funded</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-fill" />Today</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-ink/[0.04]" />Mission end</span>
        </div>
      </div>
    </div>
  );
}
