"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, X } from "lucide-react";
import { completeSetup, type ActionState } from "@/app/actions";
import type { Template } from "@/lib/settings";
import { Field, buttonClass, cx } from "@/components/ui";
import { FormMessage } from "@/components/ui-client";

type Debt = { name: string; amount: string; dueDate: string };

export function SetupWizard({ templates, today, hasPasscode }: { templates: Template[]; today: string; hasPasscode: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [cash, setCash] = useState("");
  const [debts, setDebts] = useState<Debt[]>([{ name: "Debt", amount: "5000", dueDate: "2026-12-29" }]);
  const [bought, setBought] = useState<boolean | null>(null);
  const [tplId, setTplId] = useState(templates.find((t) => t.size === 6000)?.id ?? templates[0]?.id ?? "");
  const tpl = templates.find((t) => t.id === tplId);
  const [price, setPrice] = useState(String(tpl?.price ?? ""));
  const [start, setStart] = useState(today);
  const [stage, setStage] = useState<"phase1" | "phase2" | "funded">("phase1");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [state, setState] = useState<ActionState>(null);
  const [pending, start$] = useTransition();

  const steps = ["Money", "Debts", "Challenge", "Phone"];
  const cashOk = cash !== "" && Number(cash) >= 0;
  const debtsOk = debts.every((d) => d.name.trim() && Number(d.amount) > 0 && d.dueDate);
  const challengeOk = bought === false || (bought === true && !!tpl && price !== "" && Number(price) >= 0);
  const passOk = pass === "" ? true : pass.length >= 6 && pass === pass2;
  const canNext = [cashOk, debtsOk, challengeOk, passOk][step];

  const finish = () =>
    start$(async () => {
      const res = await completeSetup({
        startingCash: Number(cash),
        debts: debts.map((d) => ({ name: d.name.trim(), amount: Number(d.amount), dueDate: d.dueDate })),
        challenge: bought ? { templateId: tplId, price: Number(price), startDate: start, stage } : null,
        passcode: pass || undefined,
      });
      setState(res);
      if (res?.ok) router.push("/");
    });

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="mb-6 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 flex-col gap-1.5">
            <div className={cx("h-1 rounded-full transition-colors", i <= step ? "bg-fill" : "bg-ink/10")} />
            <span className={cx("text-[11.5px]", i === step ? "font-medium text-ink" : "text-ink-3")}>{s}</span>
          </div>
        ))}
      </div>

      <div className="glass p-6" style={{ boxShadow: "var(--shadow-float)" }}>
        {step === 0 && (
          <Step title="How much cash do you have today?" sub="Money you could withdraw right now. Don't include prop-firm balances or money already spent on challenges.">
            <Field label="Cash on hand ($)">
              <input autoFocus type="number" inputMode="decimal" min={0} step="0.01" className="field num text-[18px]" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" />
            </Field>
          </Step>
        )}

        {step === 1 && (
          <Step title="What do you owe?" sub="Debt is subtracted from your net worth and paid before any new challenge. Edit or remove this if it isn't right.">
            <div className="space-y-3">
              {debts.map((d, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-2xl bg-ink/[0.03] p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input className="field" value={d.name} onChange={(e) => setDebts(debts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" aria-label="Debt name" />
                    <input className="field num" type="number" inputMode="decimal" value={d.amount} onChange={(e) => setDebts(debts.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} placeholder="Amount" aria-label="Amount" />
                    <input className="field" type="date" value={d.dueDate} onChange={(e) => setDebts(debts.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} aria-label="Due date" />
                  </div>
                  <button type="button" className="grid size-9 place-items-center self-start rounded-lg text-ink-3 hover:bg-ink/5" onClick={() => setDebts(debts.filter((_, j) => j !== i))} aria-label="Remove debt"><X className="size-4" /></button>
                </div>
              ))}
              <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setDebts([...debts, { name: "", amount: "", dueDate: "" }])}><Plus className="size-3.5" /> Add another</button>
              {!debts.length && <p className="text-[13px] text-ink-3">No debts. That's fine.</p>}
            </div>
          </Step>
        )}

        {step === 2 && (
          <Step title="Have you bought your first challenge?" sub="The plan starts with the FundedNext $6K two-step.">
            <div className="grid grid-cols-2 gap-2">
              {[{ v: true, l: "Yes, I have it" }, { v: false, l: "Not yet" }].map((o) => (
                <button key={o.l} type="button" onClick={() => setBought(o.v)} className={cx("h-12 rounded-[12px] text-[14px] font-medium transition-all", bought === o.v ? "bg-fill text-fill-fg" : "bg-fill text-ink shadow-[0_0_0_1px_var(--color-line-strong)]")}>{o.l}</button>
              ))}
            </div>
            {bought && (
              <div className="mt-4 space-y-3">
                <Field label="Challenge">
                  <select className="field" value={tplId} onChange={(e) => { setTplId(e.target.value); setPrice(String(templates.find((t) => t.id === e.target.value)?.price ?? "")); }}>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.firm} ${t.size.toLocaleString()}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Price you paid ($)"><input className="field num" type="number" inputMode="decimal" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
                  <Field label="Started"><input className="field" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
                </div>
                <Field label="Where are you now?">
                  <select className="field" value={stage} onChange={(e) => setStage(e.target.value as typeof stage)}>
                    <option value="phase1">Phase 1</option><option value="phase2">Phase 2</option><option value="funded">Funded</option>
                  </select>
                </Field>
              </div>
            )}
            {bought === false && <p className="mt-4 text-[13px] leading-5 text-ink-2">No problem. Add it from <b>Progress</b> when you buy it. The plan already assumes you'll start there.</p>}
          </Step>
        )}

        {step === 3 && (
          <Step title="Use it on your phone" sub={hasPasscode ? "A passcode is already set. Leave this empty to keep it." : "Set a passcode so you can open the app from your phone. Without one it only works on this computer."}>
            <div className="space-y-3">
              <Field label="Passcode (6+ characters)"><input className="field" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} /></Field>
              <Field label="Repeat passcode" error={pass2 && pass !== pass2 ? "Doesn't match" : undefined}><input className="field" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} /></Field>
              <p className="text-[12.5px] text-ink-3">You can skip this and set it later in Settings.</p>
            </div>
          </Step>
        )}

        <div className="mt-6"><FormMessage state={state} /></div>
        <div className="mt-4 flex items-center justify-between">
          {step > 0 ? <button type="button" className={buttonClass("ghost")} onClick={() => setStep(step - 1)}><ArrowLeft className="size-4" /> Back</button> : <span />}
          {step < 3 ? (
            <button type="button" disabled={!canNext} className={buttonClass("primary")} onClick={() => setStep(step + 1)}>Continue <ArrowRight className="size-4" /></button>
          ) : (
            <button type="button" disabled={!canNext || pending} className={buttonClass("primary")} onClick={finish}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[20px] font-semibold leading-7 tracking-[-0.02em]">{title}</h2>
      <p className="mt-1 mb-5 text-[13.5px] leading-5 text-ink-2">{sub}</p>
      {children}
    </div>
  );
}
