"use client";

import { useEffect, useMemo, useState } from "react";
import { deletePayout, progressPayout, requestPayout, type ActionState } from "@/app/actions";
import type { Payout } from "@/db/schema";
import type { Settings } from "@/lib/settings";
import { recommendAllocation, type ScalingGate } from "@/lib/engine/allocation";
import { Field, StatusIcon, cx } from "@/components/ui";
import { ConfirmButton, FormMessage, Sheet, SubmitButton, useActionForm } from "@/components/ui-client";
import { usd2, usd } from "@/lib/format";

export function RequestPayoutSheet({ account, today }: { account: { id: number; name: string; cycleProfit: number; splitPct: number; refund: number; eligible: boolean }; today: string }) {
  return (
    <Sheet trigger="Request payout" variant={account.eligible ? "primary" : "secondary"} size="sm" title={`Request payout · ${account.name}`} description="Record what you requested on the firm dashboard. The withdrawn profit is removed from the account balance.">
      {(close) => <RequestForm account={account} today={today} onDone={close} />}
    </Sheet>
  );
}

function RequestForm({ account, today, onDone }: { account: { id: number; cycleProfit: number; splitPct: number; refund: number; eligible: boolean }; today: string; onDone: () => void }) {
  const { state, onSubmit, pending } = useActionForm(requestPayout);
  const [gross, setGross] = useState(Math.max(0, account.cycleProfit).toFixed(2));
  const [split, setSplit] = useState(String(account.splitPct));
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const share = Number(gross) * (Number(split) / 100);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="accountId" value={account.id} />
      {!account.eligible && <div className="flex gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[12.5px] text-warn-ink"><StatusIcon level="warning" />Not all tracked eligibility checks pass. Only record this if the firm accepted the request.</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Profit withdrawn from account ($)" error={state?.fieldErrors?.grossProfit}><input name="grossProfit" type="number" step="0.01" className="field num" value={gross} onChange={(e) => setGross(e.target.value)} /></Field>
        <Field label="Split %"><input name="splitPct" type="number" step="0.01" className="field num" value={split} onChange={(e) => setSplit(e.target.value)} /></Field>
        <Field label="Fee refund included ($)" hint="FundedNext refunds the fee with the first reward."><input name="feeRefund" type="number" step="0.01" className="field num" defaultValue={account.refund} /></Field>
        <Field label="Requested on"><input name="requestedAt" type="date" className="field" defaultValue={today} /></Field>
        <Field label="Destination" className="sm:col-span-2"><input name="destination" className="field" placeholder="e.g. Rise, crypto wallet, bank" /></Field>
      </div>
      <div className="rounded-xl bg-ink/[0.03] px-3 py-2.5 text-[13px]">Your share: <b className="num">{usd2(share)}</b> + refund — net arrives after any gateway fees.</div>
      <FormMessage state={state} />
      <div className="flex justify-end"><SubmitButton pending={pending}>Record request</SubmitButton></div>
    </form>
  );
}

type DebtRef = { id: string; outstanding: number; dueDate: string } | null;

export function ProgressPayoutSheet({ payout, personal, settings, gate, cashBefore, activeProp, nominal, today, debt = null }: { payout: Payout; personal: { id: number; name: string }[]; settings: Settings; gate: ScalingGate; cashBefore: number; activeProp: number; nominal: number; today: string; debt?: DebtRef }) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {payout.status === "requested" && (
        <Sheet trigger="Approved" variant="secondary" size="sm" title="Mark payout approved">
          {(close) => <ProgressForm payout={payout} status="approved" today={today} onDone={close} />}
        </Sheet>
      )}
      {(payout.status === "requested" || payout.status === "approved") && (
        <>
          <Sheet trigger="Received" variant="primary" size="sm" title="Payout received — allocate it" description="Allocation is pre-filled with the explainable recommendation. Adjust as you like.">
            {(close) => <ProgressForm payout={payout} status="received" today={today} onDone={close} personal={personal} settings={settings} gate={gate} cashBefore={cashBefore} activeProp={activeProp} nominal={nominal} debt={debt} />}
          </Sheet>
          <Sheet trigger="Rejected" variant="ghost" size="sm" title="Mark payout rejected" description="The withdrawn profit is restored to the account balance.">
            {(close) => <ProgressForm payout={payout} status="rejected" today={today} onDone={close} />}
          </Sheet>
        </>
      )}
      <ConfirmButton action={() => deletePayout(payout.id)} confirm="Delete record?">Delete</ConfirmButton>
    </div>
  );
}

function ProgressForm(props: { payout: Payout; status: "approved" | "received" | "rejected"; today: string; onDone: () => void; personal?: { id: number; name: string }[]; settings?: Settings; gate?: ScalingGate; cashBefore?: number; activeProp?: number; nominal?: number; debt?: DebtRef }) {
  const { payout, status, today, onDone } = props;
  const { state, onSubmit, pending } = useActionForm(progressPayout);
  const [amount, setAmount] = useState(String(payout.approvedAmount ?? payout.requestedAmount));
  const [fees, setFees] = useState("0");
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const net = Number(amount) + payout.feeRefund - Number(fees || 0);
  const plan = useMemo(
    () => (status === "received" && props.settings ? recommendAllocation(Math.max(0, net), props.cashBefore!, props.settings, props.gate!, props.activeProp!, props.nominal!, props.debt ? { outstanding: props.debt.outstanding, dueDate: props.debt.dueDate } : undefined) : null),
    [status, net, props.settings, props.cashBefore, props.gate, props.activeProp, props.nominal, props.debt],
  );
  const line = (b: string) => plan?.lines.find((l) => l.bucket === b)?.amount.toFixed(2) ?? "0";
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="id" value={payout.id} />
      <input type="hidden" name="status" value={status} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date"><input type="date" name="date" defaultValue={today} className="field" /></Field>
        {status !== "rejected" && <Field label={status === "approved" ? "Approved amount ($)" : "Amount received ($)"}><input name="amount" type="number" step="0.01" className="field num" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>}
        {status === "received" && <Field label="Gateway fees ($)"><input name="fees" type="number" step="0.01" className="field num" value={fees} onChange={(e) => setFees(e.target.value)} /></Field>}
      </div>
      {plan && (
        <div className="rounded-2xl bg-ink/[0.025] p-4">
          <div className="mb-3 flex items-baseline justify-between"><span className="text-[13px] font-semibold">Allocation</span><span className="text-[12.5px] text-ink-2">Net <b className="num">{usd2(net)}</b> incl. {usd2(payout.feeRefund)} refund</span></div>
          {props.debt && <input type="hidden" name="debtId" value={props.debt.id} />}
          <div className={cx("grid gap-3", props.debt ? "sm:grid-cols-5" : "sm:grid-cols-4")} key={Math.round(net)}>
            {props.debt && <Field label="Debt"><input name="allocDebt" type="number" step="0.01" className="field num" defaultValue={line("debt")} /></Field>}
            <Field label="Reserve"><input name="allocReserve" type="number" step="0.01" className="field num" defaultValue={line("reserve")} /></Field>
            <Field label="Next challenge"><input name="allocChallenge" type="number" step="0.01" className="field num" defaultValue={line("challenge")} /></Field>
            <Field label="Personal account"><input name="allocPersonal" type="number" step="0.01" className="field num" defaultValue={line("personal")} /></Field>
            <Field label="Other"><input name="allocOther" type="number" step="0.01" className="field num" defaultValue={line("other")} /></Field>
          </div>
          {props.personal && props.personal.length > 0 && (
            <Field label="Transfer the personal share to" className="mt-3">
              <select name="personalAccountId" className="field" defaultValue={props.personal[0].id}>
                <option value="">Don&apos;t transfer yet</option>
                {props.personal.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          )}
          <ul className="mt-3 space-y-1 text-[12px] leading-[17px] text-ink-3">{plan.lines.map((l) => <li key={l.bucket}><b className="text-ink-2">{l.label}:</b> {l.reason}</li>)}</ul>
        </div>
      )}
      <FormMessage state={state} />
      <div className="flex justify-end"><SubmitButton pending={pending}>Save</SubmitButton></div>
    </form>
  );
}

export function AllocationCalculator({ settings, gate, cashBefore, activeProp, nominal, initial, debt = null }: { settings: Settings; gate: ScalingGate; cashBefore: number; activeProp: number; nominal: number; initial: number; debt?: DebtRef }) {
  const [amt, setAmt] = useState(initial ? initial.toFixed(0) : "500");
  const plan = recommendAllocation(Math.max(0, Number(amt) || 0), cashBefore, settings, gate, activeProp, nominal, debt ? { outstanding: debt.outstanding, dueDate: debt.dueDate } : undefined);
  const total = Math.max(1, plan.amount);
  const colors: Record<string, string> = { debt: "#e34948", reserve: "#868c99", challenge: "#2a78d6", personal: "#1baf7a", other: "#eda100" };
  return (
    <div>
      <Field label="Payout amount to allocate ($)">
        <input type="number" className="field num text-[15px]" value={amt} onChange={(e) => setAmt(e.target.value)} min={0} step="10" />
      </Field>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-ink/[0.05]">
        {plan.lines.filter((l) => l.amount > 0).map((l) => (
          <div key={l.bucket} style={{ width: `${(l.amount / total) * 100}%`, background: colors[l.bucket] }} className="h-full border-r-2 border-white/[0.1] last:border-0 transition-[width] duration-500" title={`${l.label}: ${usd(l.amount)}`} />
        ))}
      </div>
      <ul className="mt-4 space-y-3">
        {plan.lines.map((l) => (
          <li key={l.bucket} className="flex gap-3">
            <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: colors[l.bucket] }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium">{l.label}</span>
                <span className={cx("num text-[14px] font-semibold", l.amount === 0 && "text-ink-4")}>{usd(l.amount)}</span>
              </div>
              <div className="text-[12px] leading-[17px] text-ink-3">{l.reason}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-xl bg-ink/[0.03] p-3">
        <div className="mb-1.5 text-[12px] font-semibold">Scaling gate {gate.passed ? "passed" : "not passed"}</div>
        {gate.checks.map((c) => (
          <div key={c.label} className="flex items-center gap-2 py-0.5 text-[12px]"><StatusIcon level={c.ok ? "good" : "pending"} /><span className="flex-1 text-ink-2">{c.label}</span><span className="num text-ink-3">{c.detail}</span></div>
        ))}
      </div>
    </div>
  );
}
