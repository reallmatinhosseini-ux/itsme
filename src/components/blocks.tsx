import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { Action } from "@/lib/engine/advisor";
import type { AccountState } from "@/lib/engine/accounts";
import type { Wealth } from "@/lib/engine/wealth";
import type { RiskAlert } from "@/lib/engine/risk";
import { Badge, Card, CardTitle, Progress, StatusIcon, cx } from "./ui";
import { pct, signedPct, stageLabel, usd, compactUsd } from "@/lib/format";

export function NextActionCard({ actions, compact = false }: { actions: Action[]; compact?: boolean }) {
  const [top, ...rest] = actions;
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-accent/10 blur-3xl" />
      <CardTitle title="Next Best Action" hint="Ranked from your data. A recommendation, not a guarantee." right={<Badge tone={top.confidence === "High" ? "dark" : "accent"}>{top.confidence} confidence</Badge>} />
      <Link href={top.href} className="group block">
        <div className="text-[19px] leading-[26px] font-semibold tracking-[-0.02em] text-ink group-hover:text-accent-ink">
          {top.title}
          <ArrowRight className="ml-1.5 inline size-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
      <p className="mt-1.5 text-[13px] leading-5 text-ink-2">{top.reason}</p>
      {!compact && (
        <div className="mt-4 grid gap-3 text-[12.5px] leading-[18px] sm:grid-cols-3">
          <div>
            <div className="eyebrow mb-1">Supporting data</div>
            {top.data.length ? top.data.slice(0, 3).map((d) => <div key={d} className="text-ink-2">{d}</div>) : <div className="text-ink-3">—</div>}
          </div>
          <div>
            <div className="eyebrow mb-1">Expected impact</div>
            <div className="text-ink-2">{top.impact}</div>
          </div>
          <div>
            <div className="eyebrow mb-1">Potential downside</div>
            <div className="text-ink-2">{top.downside}</div>
          </div>
        </div>
      )}
      {rest.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="eyebrow mb-1.5">Then</div>
          <ul className="space-y-1">
            {rest.slice(0, compact ? 2 : 4).map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="flex items-center justify-between gap-3 rounded-lg py-1 text-[13px] text-ink-2 hover:text-ink">
                  <span className="truncate">{a.title}</span>
                  <ArrowUpRight className="size-3.5 shrink-0 text-ink-4" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function WealthLayers({ w }: { w: Wealth }) {
  const layers = [
    { label: "Nominal funded capital", value: w.nominalFunded, note: "Firm's money — never yours", real: false },
    { label: "Funded paper profit", value: w.fundedPaperShare, note: "Your share if paid today", real: false },
    { label: "Payouts in flight", value: w.requested + w.approved, note: `${usd(w.requested)} requested · ${usd(w.approved)} approved`, real: false },
    { label: "Payouts received", value: w.receivedNet, note: "Net of fees, incl. refunds", real: true },
    { label: "Personal liquid capital", value: w.liquidCapital, note: `${usd(w.cash)} cash · ${usd(w.personalEquity)} live acct`, real: true },
    { label: "Realized net wealth", value: w.realizedNetWealth, note: `After ${usd(w.feesPaid)} fees & ${usd(w.expenses)} expenses`, real: true },
  ];
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-[var(--color-line)] md:grid-cols-3 xl:grid-cols-6">
        {layers.map((l, i) => (
          <div key={l.label} className={cx("relative p-4", i === 5 ? "bg-ink/85" : "bg-ink/[0.06]")}>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className={cx("size-1.5 rounded-full", l.real ? "bg-good" : "bg-ink-4")} />
              <span className="eyebrow truncate">{l.label}</span>
            </div>
            <div className={cx("num text-[20px] font-semibold tracking-[-0.03em]", l.real ? "text-ink" : "text-ink-3")}>{usd(l.value)}</div>
            <div className="mt-0.5 truncate text-[11.5px] text-ink-3" title={l.note}>{l.note}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function stageTone(stage: string): "accent" | "good" | "crit" | "neutral" | "dark" {
  return stage === "funded" ? "good" : stage === "failed" ? "crit" : stage === "live" ? "dark" : "accent";
}

export function AccountMini({ s }: { s: AccountState }) {
  const a = s.account;
  return (
    <Link href={`/accounts#acct-${a.id}`} className="glass group block p-4 transition-shadow hover:shadow-[var(--shadow-float)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold">{a.name}</div>
          <div className="text-[12px] text-ink-3">{a.firm} · {compactUsd(a.kind === "prop" ? a.size : s.balance)}</div>
        </div>
        <Badge tone={stageTone(a.stage)}>{stageLabel[a.stage]}</Badge>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="num text-[18px] font-semibold tracking-[-0.02em]">{usd(s.balance)}</span>
        <span className={cx("num text-[12.5px] font-medium", s.profit >= 0 ? "text-good-ink" : "text-crit-ink")}>{signedPct(s.profitPct)}</span>
      </div>
      {s.targetPct != null && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-ink-3"><span>Target {s.targetPct}%</span><span className="num">{pct((s.targetProgress ?? 0) * 100, 0)} · {s.tradingDays}/{a.minTradingDays}d</span></div>
          <Progress value={(s.targetProgress ?? 0) * 100} tone="accent" />
        </div>
      )}
      <div className="mt-2.5">
        <div className="mb-1 flex justify-between text-[11px] text-ink-3"><span>Max-loss used</span><span className="num">{pct(s.drawdownUsedPct, 0)}</span></div>
        <Progress value={s.drawdownUsedPct} tone={s.drawdownUsedPct >= 85 ? "crit" : s.drawdownUsedPct >= 60 ? "warn" : "ink"} />
      </div>
    </Link>
  );
}

export function AlertList({ alerts, limit }: { alerts: RiskAlert[]; limit?: number }) {
  const list = limit ? alerts.slice(0, limit) : alerts;
  if (!list.length)
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-good-soft px-3.5 py-3 text-[13px] text-good-ink">
        <StatusIcon level="good" /> No risk alerts. Rules, limits and behaviour are within plan.
      </div>
    );
  return (
    <ul className="space-y-2">
      {list.map((a, i) => (
        <li key={i} className={cx("flex gap-3 rounded-xl px-3.5 py-3", a.level === "critical" ? "bg-crit-soft" : a.level === "warning" ? "bg-warn-soft" : "bg-ink/[0.06] shadow-[0_0_0_1px_var(--color-line)]")}>
          <StatusIcon level={a.level} className="mt-0.5" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink">{a.title}</div>
            <div className="mt-0.5 text-[12.5px] leading-[18px] text-ink-2">{a.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
