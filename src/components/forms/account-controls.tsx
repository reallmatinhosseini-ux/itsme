"use client";

import { useEffect } from "react";
import { addBalanceEvent, deleteAccount, setArchived, setStage, type ActionState } from "@/app/actions";
import { ActionButton, ConfirmButton, FormMessage, Sheet, SubmitButton, useActionForm } from "@/components/ui-client";
import { Field } from "@/components/ui";

export function StageControls({ id, stage, archived, ready }: { id: number; stage: string; archived: boolean; ready: "ready_phase2" | "ready_funded" | null }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {stage === "phase1" && (
        <ConfirmButton variant={ready ? "primary" : "secondary"} action={() => setStage(id, "phase2")} confirm="Firm confirmed Phase 1 pass?">
          Passed Phase 1
        </ConfirmButton>
      )}
      {stage === "phase2" && (
        <ConfirmButton variant={ready ? "primary" : "secondary"} action={() => setStage(id, "funded")} confirm="Firm confirmed Phase 2 pass?">
          Passed Phase 2
        </ConfirmButton>
      )}
      {["phase1", "phase2", "funded"].includes(stage) && (
        <ConfirmButton action={() => setStage(id, "failed", "Rule breach")} confirm="Mark as failed?">
          Mark failed
        </ConfirmButton>
      )}
      <ActionButton variant="ghost" action={() => setArchived(id, !archived)}>{archived ? "Unarchive" : "Archive"}</ActionButton>
      <ConfirmButton action={() => deleteAccount(id)} confirm="Delete account and all its trades?">
        Delete
      </ConfirmButton>
    </div>
  );
}

export function AdjustmentSheet({ accountId, today }: { accountId: number; today: string }) {
  return (
    <Sheet trigger="Adjust balance" variant="ghost" size="sm" title="Record a balance adjustment" description="Commissions, swaps or a correction so this balance matches your platform.">
      {(close) => <AdjustmentForm accountId={accountId} today={today} onDone={close} />}
    </Sheet>
  );
}

function AdjustmentForm({ accountId, today, onDone }: { accountId: number; today: string; onDone: () => void }) {
  const { state, onSubmit, pending } = useActionForm(addBalanceEvent);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="accountId" value={accountId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date"><input type="date" name="date" defaultValue={today} className="field" /></Field>
        <Field label="Type">
          <select name="type" className="field" defaultValue="commission">
            <option value="commission">Commission</option>
            <option value="swap">Swap</option>
            <option value="correction">Correction</option>
          </select>
        </Field>
        <Field label="Amount ($, signed)" error={state?.fieldErrors?.amount}><input type="number" step="0.01" name="amount" className="field num" placeholder="-4.50" /></Field>
      </div>
      <Field label="Note"><input name="note" className="field" /></Field>
      <FormMessage state={state} />
      <div className="flex justify-end"><SubmitButton pending={pending}>Record</SubmitButton></div>
    </form>
  );
}
