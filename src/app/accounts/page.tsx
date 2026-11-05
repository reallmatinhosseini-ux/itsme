import { Wallet, Plus } from "lucide-react";
import { loadMission } from "@/lib/data";
import { Badge, Card, CardTitle, Empty, KV, PageHeader, Stat, cx } from "@/components/ui";
import { AccountMini, stageTone } from "@/components/blocks";
import { AccountSheet } from "@/components/forms/account-form";
import { LedgerSheet, DeleteLedger } from "@/components/forms/ledger-form";
import { GroupedBars } from "@/components/charts";
import { fmtDate, pct, signedUsd, stageLabel, usd } from "@/lib/format";

const LEDGER_LABEL: Record<string, string> = {
  fee: "Fee", refund: "Refund", expense: "Expense", income: "Income", transfer_to_personal: "→ Personal", transfer_from_personal: "← Personal",
};

export default async function Accounts() {
  const m = await loadMission();
  const live = m.states.filter((s) => !s.account.archived && s.account.stage !== "failed");
  const personal = m.states.filter((s) => !s.isProp);
  const exp = m.exposure;
  const combinedLimit = live.reduce((s, x) => s + (x.isProp ? x.dailyLossLimit : 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Funded and personal capital, side by side"
        description="Prop accounts are the firm's money; your personal account and cash are yours. They're monitored together because you trade them with the same brain on the same market."
        actions={
          <>
            <LedgerSheet personal={personal.map((p) => ({ id: p.account.id, name: p.account.name }))} today={m.today} />
            <AccountSheet templates={m.settings.templates} kind="personal" today={m.today} trigger={<><Plus className="size-4" /> Personal account</>} />
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><Stat label="Combined P/L today" value={signedUsd(exp.todayRealized)} tone={exp.todayRealized >= 0 ? "text-good-ink" : "text-crit-ink"} sub={`Worst case incl. open risk ${signedUsd(exp.todayWorstCase)}`} /></Card>
        <Card><Stat label="Open risk, all accounts" value={usd(exp.openRisk)} sub={`${exp.openPositions} positions · ${exp.ideas} distinct ideas`} /></Card>
        <Card><Stat label="Combined prop daily limits" value={usd(combinedLimit)} sub="Sum of firm daily-loss limits" /></Card>
        <Card><Stat label="Personal equity" value={usd(m.wealth.personalEquity)} sub={`Cash ${usd(m.wealth.cash)}`} /></Card>
      </div>

      {exp.ideas > 0 && exp.openPositions > exp.ideas && (
        <Card className="mb-4 bg-warn-soft">
          <div className="text-[13px] text-warn-ink">
            <b>{exp.openPositions} positions are really {exp.ideas} idea(s).</b> When the same trade sits on several accounts, one wrong call hits every account at once. Treat combined open risk as a single bet.
          </div>
        </Card>
      )}

      {live.length ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{live.map((s) => <AccountMini key={s.account.id} s={s} />)}</div>
      ) : (
        <Card className="mb-4"><Empty title="No active accounts" icon={<Wallet className="size-5" />}>Add a challenge in the Challenge Tracker or a personal live account here.</Empty></Card>
      )}

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardTitle title="Account comparison" hint="Stage P/L and current open risk per account." />
          {live.length ? (
            <GroupedBars data={live.map((s) => ({ name: s.account.name, pnl: +s.profit.toFixed(2), risk: +s.openRisk.toFixed(2) }))} series={[{ key: "pnl", label: "Stage P/L" }, { key: "risk", label: "Open risk" }]} />
          ) : (
            <Empty title="Nothing to compare yet" />
          )}
        </Card>
        <Card className="xl:col-span-5">
          <CardTitle title="Currency exposure" hint="Net open risk by currency leg across all accounts (+ long / − short)." />
          {exp.byCurrency.length ? (
            <div className="space-y-2">
              {exp.byCurrency.map((c) => {
                const max = Math.max(...exp.byCurrency.map((x) => Math.abs(x.net)), 1);
                return (
                  <div key={c.ccy} className="flex items-center gap-3 text-[12.5px]">
                    <span className="w-14 font-medium">{c.ccy}</span>
                    <div className="relative h-2 flex-1 rounded-full bg-ink/[0.05]">
                      <div className="absolute top-0 h-2 rounded-full" style={{ left: c.net >= 0 ? "50%" : `${50 - (Math.abs(c.net) / max) * 50}%`, width: `${(Math.abs(c.net) / max) * 50}%`, background: c.net >= 0 ? "#2a78d6" : "#eb6834" }} />
                      <div className="absolute top-[-3px] bottom-[-3px] left-1/2 w-px bg-ink/[0.04]" />
                    </div>
                    <span className="w-20 text-right num">{signedUsd(c.net)}</span>
                  </div>
                );
              })}
              {exp.correlatedGroups.map((g) => (
                <div key={g.ccy} className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-[12px] text-warn-ink">Concentrated {g.ccy} exposure across {g.trades.length} positions ({usd(g.risk)} at risk)</div>
              ))}
            </div>
          ) : (
            <Empty title="No open positions">Log open trades in the journal to see live exposure.</Empty>
          )}
        </Card>

        <Card className="xl:col-span-12" pad={false}>
          <div className="p-5 pb-0"><CardTitle title="All accounts" /></div>
          <div className="overflow-x-auto px-2 pb-2">
            <table className="table">
              <thead><tr><th>Account</th><th>Type</th><th>Stage</th><th className="text-right">Balance</th><th className="text-right">Today</th><th className="text-right">Daily limit used</th><th className="text-right">Max loss used</th><th className="text-right">Open risk</th></tr></thead>
              <tbody>
                {m.states.map((s) => (
                  <tr key={s.account.id} className={s.account.archived || s.account.stage === "failed" ? "opacity-55" : ""}>
                    <td className="font-medium">{s.account.name}<div className="text-[11.5px] font-normal text-ink-3">{s.account.firm}</div></td>
                    <td>{s.isProp ? "Prop (firm capital)" : "Personal (your capital)"}</td>
                    <td><Badge tone={stageTone(s.account.stage)}>{stageLabel[s.account.stage]}</Badge></td>
                    <td className="num text-right">{usd(s.balance)}</td>
                    <td className={cx("num text-right", s.todayPnl >= 0 ? "text-good-ink" : "text-crit-ink")}>{signedUsd(s.todayPnl)}</td>
                    <td className="num text-right">{pct(s.dailyLossUsedPct, 0)}</td>
                    <td className="num text-right">{pct(s.drawdownUsedPct, 0)}</td>
                    <td className="num text-right">{usd(s.openRisk)} <span className="text-ink-3">({pct(s.openRiskPct, 2)})</span></td>
                  </tr>
                ))}
                {!m.states.length && <tr><td colSpan={8} className="py-8 text-center text-ink-3">No accounts</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="xl:col-span-12" pad={false}>
          <div className="p-5 pb-0">
            <CardTitle title="Cash ledger" hint="Every non-payout movement of your own money." right={<span className="text-[12.5px] text-ink-3">Starting cash {usd(m.settings.startingCash)}</span>} />
          </div>
          {m.ledger.length ? (
            <div className="overflow-x-auto px-2 pb-2">
              <table className="table">
                <thead><tr><th>Date</th><th>Type</th><th>Account</th><th>Note</th><th className="text-right">Amount</th><th /></tr></thead>
                <tbody>
                  {[...m.ledger].sort((a, b) => b.date.localeCompare(a.date)).map((l) => {
                    const out = l.type === "fee" || l.type === "expense" || l.type === "transfer_to_personal";
                    return (
                      <tr key={l.id}>
                        <td className="num">{fmtDate(l.date)}</td>
                        <td><Badge tone={l.type === "fee" || l.type === "expense" ? "warn" : l.type.startsWith("transfer") ? "neutral" : "good"}>{LEDGER_LABEL[l.type]}</Badge></td>
                        <td>{m.accounts.find((a) => a.id === l.accountId)?.name ?? "—"}</td>
                        <td className="max-w-[320px] truncate text-ink-2">{l.note ?? ""}</td>
                        <td className="num text-right font-medium">{out ? "−" : "+"}{usd(l.amount)}</td>
                        <td className="text-right"><DeleteLedger id={l.id} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No cash movements yet">Challenge fees are added here automatically when you create a challenge.</Empty>
          )}
          <div className="border-t border-line px-5 py-3">
            <KV k="Cash on hand" v={usd(m.wealth.cash)} />
          </div>
        </Card>
      </div>
    </>
  );
}
