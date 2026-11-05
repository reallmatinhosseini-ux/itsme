"use client";

import { useEffect } from "react";
import { addLedger, deleteLedger, type ActionState } from "@/app/actions";
import { Field } from "@/components/ui";
import { ConfirmButton, FormMessage, Sheet, SubmitButton, useActionForm } from "@/components/ui-client";

type DebtOpt = { id: string; name: string; outstanding: number };

export function LedgerSheet({ personal, today, trigger = "Record cash movement", debts = [], defaultType = "expense", variant = "secondary", title = "Record a cash movement" }: { personal: { id: number; name: string }[]; today: string; trigger?: React.ReactNode; debts?: DebtOpt[]; defaultType?: string; variant?: "primary" | "secondary"; title?: string }) {
  return (
    <Sheet trigger={trigger} variant={variant} title={title} description="Fees, expenses, income, debt payments and transfers to or from a personal trading account.">
      {(close) => <LedgerForm personal={personal} today={today} onDone={close} debts={debts} defaultType={defaultType} />}
    </Sheet>
  );
}

function LedgerForm({ personal, today, onDone, debts, defaultType }: { personal: { id: number; name: string }[]; today: string; onDone: () => void; debts: DebtOpt[]; defaultType: string }) {
  const { state, onSubmit, pending } = useActionForm(addLedger);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const e = state?.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" error={e.date}><input type="date" name="date" defaultValue={today} className="field" /></Field>
        <Field label="Type">
          <select name="type" className="field" defaultValue={defaultType}>
            {debts.length > 0 && <option value="debt_payment">Debt payment</option>}
            <option value="fee">Challenge / reset fee</option>
            <option value="expense">Expense (data, VPS, tools, personal use)</option>
            <option value="income">Other income</option>
            <option value="refund">Refund</option>
            <option value="transfer_to_personal">Transfer → personal account</option>
            <option value="transfer_from_personal">Transfer ← personal account</option>
          </select>
        </Field>
        <Field label="Amount ($)" error={e.amount}><input type="number" step="0.01" min="0" name="amount" className="field num" aria-invalid={!!e.amount} /></Field>
      </div>
      {debts.length > 0 && (
        <Field label="Debt (for debt payments)">
          <select name="debtId" className="field" defaultValue={debts[0].id}>
            {debts.map((d) => <option key={d.id} value={d.id}>{d.name} · ${Math.round(d.outstanding).toLocaleString()} left</option>)}
          </select>
        </Field>
      )}
      <Field label="Personal account (for transfers)">
        <select name="accountId" className="field" defaultValue="">
          <option value="">—</option>
          {personal.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Note"><input name="note" className="field" /></Field>
      <FormMessage state={state} />
      <div className="flex justify-end"><SubmitButton pending={pending}>Record</SubmitButton></div>
    </form>
  );
}

export function DeleteLedger({ id }: { id: number }) {
  return <ConfirmButton action={() => deleteLedger(id)} confirm="Delete?">Delete</ConfirmButton>;
}
