import Link from "next/link";
import { redirect } from "next/navigation";
import { loadMission } from "@/lib/data";
import { daysBetween } from "@/lib/engine/util";
import { Badge, Card, cx, PageHeader } from "@/components/ui";
import { LedgerSheet } from "@/components/forms/ledger-form";
import { ProgressPayoutSheet, RequestPayoutSheet } from "@/components/forms/payout-forms";
import { fmtDate, usd, usd2 } from "@/lib/format";

const LABEL: Record<string, string> = {
  fee: "Challenge fee", refund: "Refund", expense: "Expense", income: "Income", transfer_to_personal: "To personal account", transfer_from_personal: "From personal account", debt_payment: "Debt payment",
};

export default async function Money() {
  const m = await loadMission();
  if (!m.settings.setupCompleted) redirect("/setup");
  const { wealth } = m;
  const personal = m.states.filter((s) => !s.isProp && !s.account.archived).map((s) => ({ id: s.account.id, name: s.account.name }));
  const debts = wealth.debts.filter((d) => d.outstanding > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const nextDebt = debts[0] ? { id: debts[0].id, outstanding: debts[0].outstanding, dueDate: debts[0].dueDate } : null;
  const funded = m.states.filter((s) => s.isProp && s.account.stage === "funded" && !s.account.archived);
  const pending = m.payouts.filter((p) => p.status === "requested" || p.status === "approved");
  const active = m.states.filter((s) => s.isProp && !s.account.archived && s.account.stage !== "failed");
  const nominal = active.reduce((a, x) => a + x.account.size, 0);
  const moves = [
    ...m.ledger.map((l) => ({ key: `l${l.id}`, date: l.date, label: LABEL[l.type], note: l.note, amount: ["fee", "expense", "transfer_to_personal", "debt_payment"].includes(l.type) ? -l.amount : l.amount })),
    ...m.payouts.filter((p) => p.status === "received").map((p) => ({ key: `p${p.id}`, date: p.receivedAt!, label: "Payout received", note: m.accounts.find((a) => a.id === p.accountId)?.name ?? null, amount: (p.receivedAmount ?? 0) + p.feeRefund - p.fees })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Money" title="Real money only" description="Cash, debt and payouts. Prop-firm balances never appear here." />

      <div className="mb-4 grid grid-cols-2 gap-4">
        <Card>
          <div className="eyebrow mb-1">Cash</div>
          <div className="num text-[26px] font-semibold tracking-[-0.03em]">{usd(wealth.cash)}</div>
          {wealth.personalEquity > 0 && <div className="mt-0.5 text-[12px] text-ink-3">+ {usd(wealth.personalEquity)} in personal account</div>}
        </Card>
        <Card>
          <div className="eyebrow mb-1">Owed</div>
          <div className={cx("num text-[26px] font-semibold tracking-[-0.03em]", wealth.debtOutstanding > 0 && "text-crit-ink")}>{usd(wealth.debtOutstanding)}</div>
          {debts[0] && <div className="mt-0.5 text-[12px] text-ink-3">Due {fmtDate(debts[0].dueDate)} · {Math.max(0, daysBetween(m.today, debts[0].dueDate))} days</div>}
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {debts.length > 0 && <LedgerSheet personal={personal} today={m.today} debts={debts} defaultType="debt_payment" variant="primary" trigger="Pay debt" title="Record a debt payment" />}
        <LedgerSheet personal={personal} today={m.today} debts={debts} trigger="Add money in / out" />
      </div>

      <Card className="mb-4">
        <div className="eyebrow mb-3">Payouts</div>
        {funded.length === 0 && pending.length === 0 && <p className="text-[13.5px] text-ink-2">Payouts start once an account is funded. You&apos;ll see a button here when one is ready.</p>}
        <div className="space-y-3">
          {funded.map((s) => (
            <div key={s.account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-ink/[0.035] px-3.5 py-3">
              <div>
                <div className="text-[14px] font-medium">{s.account.name}</div>
                <div className="text-[12.5px] text-ink-3">{s.payout?.eligible ? `Ready: ${usd2(s.payout.traderShare + s.payout.feeRefundDue)} to you` : `Not yet: ${s.payout?.checks.find((c) => !c.ok)?.label.toLowerCase() ?? "conditions not met"}`}</div>
              </div>
              <RequestPayoutSheet today={m.today} account={{ id: s.account.id, name: s.account.name, cycleProfit: s.payout?.cycleProfit ?? 0, splitPct: s.account.splitPct, refund: s.payout?.feeRefundDue ?? 0, eligible: !!s.payout?.eligible }} />
            </div>
          ))}
          {pending.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-accent-soft px-3.5 py-3">
              <div>
                <div className="text-[14px] font-medium">{usd2(p.approvedAmount ?? p.requestedAmount)} <Badge tone={p.status === "approved" ? "accent" : "warn"} className="ml-1">{p.status}</Badge></div>
                <div className="text-[12.5px] text-ink-3">{m.accounts.find((a) => a.id === p.accountId)?.name} · requested {fmtDate(p.requestedAt)}</div>
              </div>
              <ProgressPayoutSheet payout={p} personal={personal} settings={m.settings} gate={m.gate} cashBefore={wealth.cash} activeProp={active.length} nominal={nominal} today={m.today} debt={nextDebt} />
            </div>
          ))}
        </div>
        <Link href="/payouts" className="mt-3 inline-block text-[12.5px] font-medium text-accent-ink">Payout details & scenarios →</Link>
      </Card>

      <Card pad={false}>
        <div className="eyebrow px-5 pt-5 pb-2">Recent</div>
        {moves.length ? (
          <ul>
            {moves.slice(0, 20).map((x) => (
              <li key={x.key} className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 first:border-0">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium">{x.label}</div>
                  <div className="truncate text-[12px] text-ink-3">{fmtDate(x.date)}{x.note ? ` · ${x.note}` : ""}</div>
                </div>
                <span className={cx("num shrink-0 text-[14px] font-semibold", x.amount >= 0 ? "text-good-ink" : "text-ink")}>{x.amount >= 0 ? "+" : "−"}{usd2(Math.abs(x.amount))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-5 text-[13.5px] text-ink-3">Nothing yet.</p>
        )}
      </Card>
    </div>
  );
}
