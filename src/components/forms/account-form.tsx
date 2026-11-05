"use client";

import { useState, useEffect } from "react";
import { saveAccount, type ActionState } from "@/app/actions";
import type { Account } from "@/db/schema";
import type { Template } from "@/lib/settings";
import { Field, cx } from "@/components/ui";
import { FormMessage, Sheet, SubmitButton, useActionForm } from "@/components/ui-client";

type Kind = "prop" | "personal";

export function AccountSheet({ templates, account, kind = "prop", trigger, variant = "primary", today }: { templates: Template[]; account?: Account; kind?: Kind; trigger: React.ReactNode; variant?: "primary" | "secondary" | "ghost"; today: string }) {
  return (
    <Sheet trigger={trigger} variant={variant} size={account ? "sm" : "md"} title={account ? `Edit ${account.name}` : kind === "prop" ? "Add a prop challenge" : "Add a personal live account"} description={kind === "prop" && !account ? "Rules are copied from the template so later firm changes never rewrite your history." : undefined}>
      {(close) => <AccountForm templates={templates} account={account} kind={account?.kind ?? kind} onDone={close} today={today} />}
    </Sheet>
  );
}

function AccountForm({ templates, account, kind, onDone, today }: { templates: Template[]; account?: Account; kind: Kind; onDone: () => void; today: string }) {
  const { state, onSubmit, pending } = useActionForm(saveAccount);
  const [tplId, setTplId] = useState(account ? "" : templates[0]?.id ?? "");
  const tpl = templates.find((t) => t.id === tplId);
  const a = account;
  const v = (k: keyof Account & keyof Template, fallback: number | string | boolean) => (a ? (a[k] as never) : tpl ? (tpl[k] as never) : fallback);
  const e = state?.fieldErrors ?? {};
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const key = a ? `a${a.id}` : tplId; // remount uncontrolled inputs when template changes

  return (
    <form onSubmit={onSubmit} className="space-y-5" key={key}>
      {a && <input type="hidden" name="id" value={a.id} />}
      <input type="hidden" name="kind" value={kind} />
      {kind === "prop" && !a && (
        <Field label="Template" hint={tpl?.verifiedAt ? <>Verified {tpl.verifiedAt} from the <a className="underline" href={tpl.source} target="_blank" rel="noreferrer">official help centre</a>. Prices change with promotions — enter what you actually paid.</> : "Unverified template"}>
          <select className="field" value={tplId} onChange={(ev) => setTplId(ev.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.firm} · {t.program} · ${t.size.toLocaleString()} (${t.price})
              </option>
            ))}
            <option value="">Custom rules…</option>
          </select>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account name" error={e.name}>
          <input name="name" className="field" aria-invalid={!!e.name} defaultValue={a?.name ?? (kind === "prop" ? `${tpl ? (tpl.size / 1000).toFixed(0) + "K " : ""}${tpl?.firm ?? "Prop"} challenge` : "Personal live")} />
        </Field>
        <Field label={kind === "prop" ? "Firm" : "Broker"} error={e.firm}>
          <input name="firm" className="field" aria-invalid={!!e.firm} defaultValue={a?.firm ?? tpl?.firm ?? ""} />
        </Field>
        <Field label={kind === "prop" ? "Account size ($)" : "Initial deposit ($)"} error={e.size} hint={kind === "personal" && !a ? "Recorded as a transfer from your cash." : undefined}>
          <input name="size" type="number" step="0.01" className="field num" aria-invalid={!!e.size} defaultValue={a?.size ?? tpl?.size ?? ""} disabled={kind === "personal" && !!a} />
        </Field>
        {kind === "prop" ? (
          <Field label="Price paid ($)" error={e.purchasePrice} hint={!a ? "Logged as a fee in your cash ledger." : undefined}>
            <input name="purchasePrice" type="number" step="0.01" className="field num" defaultValue={a?.purchasePrice ?? tpl?.price ?? 0} />
          </Field>
        ) : (
          <input type="hidden" name="purchasePrice" value="0" />
        )}
        <Field label="Start date" error={e.startDate}>
          <input name="startDate" type="date" className="field" defaultValue={a?.startDate ?? today} />
        </Field>
        {kind === "prop" && (
          <Field label="Target deadline (optional)" hint="FundedNext Stellar has no time limit — this is your own plan.">
            <input name="deadline" type="date" className="field" defaultValue={a?.deadline ?? ""} />
          </Field>
        )}
        {kind === "prop" && !a && (
          <Field label="Current stage">
            <select name="stage" className="field" defaultValue="phase1">
              <option value="phase1">Phase 1</option>
              <option value="phase2">Phase 2</option>
              <option value="funded">Funded</option>
            </select>
          </Field>
        )}
        {(a || kind === "personal") && <input type="hidden" name="stage" value={kind === "personal" ? "live" : a!.stage === "failed" || a!.stage === "live" ? "phase1" : a!.stage} />}
        {kind === "prop" && (
          <Field label="KYC status">
            <select name="kycStatus" className="field" defaultValue={a?.kycStatus ?? "not_started"}>
              <option value="not_started">Not started</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
            </select>
          </Field>
        )}
        {kind === "personal" && <input type="hidden" name="kycStatus" value="n/a" />}
      </div>

      {kind === "prop" ? (
        <fieldset className="rounded-2xl bg-ink/[0.025] p-4">
          <legend className="eyebrow px-1">Rules</legend>
          <div className="grid gap-3 sm:grid-cols-4">
            <Num name="profitTargetP1" label="P1 target %" d={v("profitTargetP1", 8)} />
            <Num name="profitTargetP2" label="P2 target %" d={v("profitTargetP2", 5)} />
            <Num name="dailyLossPct" label="Daily loss %" d={v("dailyLossPct", 5)} />
            <Num name="maxLossPct" label="Max loss %" d={v("maxLossPct", 10)} />
            <Field label="Max loss type">
              <select name="maxLossType" className="field" defaultValue={v("maxLossType", "static") as string}>
                <option value="static">Static</option>
                <option value="trailing">Trailing</option>
              </select>
            </Field>
            <Num name="minTradingDays" label="Min days / phase" d={v("minTradingDays", 5)} step="1" />
            <Num name="splitPct" label="Profit split %" d={v("splitPct", 90)} />
            <Num name="payoutMinGrowthPct" label="Payout min growth %" d={v("payoutMinGrowthPct", 2)} />
            <Num name="bestDayCapPct" label="Best-day cap %" d={v("bestDayCapPct", 40)} />
            <Num name="maxOpenRiskPct" label="Funded max open risk %" d={v("maxOpenRiskPct", 3)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            <label className="flex items-center gap-2"><input type="checkbox" className="check" name="feeRefundOnFirstPayout" defaultChecked={v("feeRefundOnFirstPayout", true) as boolean} /> Fee refunded with first payout</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="check" name="rulesVerified" defaultChecked={!!a?.rulesVerifiedAt} /> I verified these rules against my purchase</label>
          </div>
        </fieldset>
      ) : (
        <>
          {["profitTargetP1", "profitTargetP2", "dailyLossPct", "maxLossPct", "splitPct", "payoutMinGrowthPct", "bestDayCapPct", "maxOpenRiskPct"].map((k) => <input key={k} type="hidden" name={k} value={k === "dailyLossPct" ? 2 : k === "maxLossPct" ? 10 : 0} />)}
          <input type="hidden" name="maxLossType" value="trailing" />
          <input type="hidden" name="minTradingDays" value="0" />
          <input type="hidden" name="rulesVerified" value="true" />
          {a && <input type="hidden" name="size" value={a.size} />}
        </>
      )}

      <Field label="Notes">
        <textarea name="notes" className="field" rows={2} defaultValue={a?.notes ?? ""} placeholder="Platform, login, payout option chosen at checkout…" />
      </Field>
      <input type="hidden" name="model" value={a?.model ?? (kind === "prop" ? "2-Step" : "Live")} />
      <input type="hidden" name="payoutModel" value={a?.payoutModel ?? (kind === "prop" ? "On-Demand" : "—")} />

      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <SubmitButton pending={pending}>{a ? "Save changes" : "Create account"}</SubmitButton>
      </div>
    </form>
  );
}

function Num({ name, label, d, step = "0.01" }: { name: string; label: string; d: number | string | boolean; step?: string }) {
  return (
    <Field label={label}>
      <input name={name} type="number" step={step} className={cx("field num")} defaultValue={d as number} />
    </Field>
  );
}
