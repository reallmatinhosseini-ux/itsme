"use client";

import { useState, useTransition } from "react";
import { changePasscode, resetAllData, signOut, updateSettings, type ActionState } from "@/app/actions";
import type { Settings, Scenario, Template } from "@/lib/settings";
import { SESSIONS } from "@/lib/settings";
import { Field, buttonClass, cx } from "@/components/ui";
import { FormMessage, SubmitButton, useActionForm } from "@/components/ui-client";
import { Loader2 } from "lucide-react";

function useSave() {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const save = (patch: Partial<Settings>) => start(async () => setState(await updateSettings(patch)));
  return { state, pending, save };
}

function SaveBar({ pending, state, onSave, label = "Save" }: { pending: boolean; state: ActionState; onSave: () => void; label?: string }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
      <div className="mr-auto"><FormMessage state={state} /></div>
      <button type="button" onClick={onSave} disabled={pending} className={buttonClass("primary")}>
        {pending && <Loader2 className="size-3.5 animate-spin" />} {label}
      </button>
    </div>
  );
}

const n = (v: string) => (v === "" ? NaN : Number(v));

function NumIn({ label, value, onChange, step = "0.01", hint, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: string; hint?: string; suffix?: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input type="number" step={step} className={cx("field num", suffix && "pr-8")} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(n(e.target.value))} />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-ink-3">{suffix}</span>}
      </div>
    </Field>
  );
}

export function MissionForm({ s }: { s: Settings }) {
  const [v, setV] = useState({ missionName: s.missionName, targetAmount: s.targetAmount, missionStart: s.missionStart, missionEnd: s.missionEnd, startingCash: s.startingCash, startingCashConfirmed: s.startingCashConfirmed });
  const { state, pending, save } = useSave();
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Mission name"><input className="field" value={v.missionName} onChange={(e) => setV({ ...v, missionName: e.target.value })} /></Field>
        <NumIn label="Target (realized net wealth)" value={v.targetAmount} onChange={(x) => setV({ ...v, targetAmount: x })} step="1000" suffix="$" />
        <NumIn label="Starting cash" value={v.startingCash} onChange={(x) => setV({ ...v, startingCash: x })} step="1" suffix="$" hint="Withdrawable cash you begin with (before buying the first challenge)." />
        <Field label="Mission start"><input type="date" className="field" value={v.missionStart} onChange={(e) => setV({ ...v, missionStart: e.target.value })} /></Field>
        <Field label="Mission end"><input type="date" className="field" value={v.missionEnd} onChange={(e) => setV({ ...v, missionEnd: e.target.value })} /></Field>
        <label className="flex items-end gap-2 pb-2 text-[13px] text-ink-2"><input type="checkbox" className="check" checked={v.startingCashConfirmed} onChange={(e) => setV({ ...v, startingCashConfirmed: e.target.checked })} /> Starting cash is accurate</label>
      </div>
      <SaveBar pending={pending} state={state} onSave={() => save(v)} />
    </>
  );
}

export function RiskForm({ s }: { s: Settings }) {
  const [r, setR] = useState(s.risk);
  const { state, pending, save } = useSave();
  const set = (k: keyof Settings["risk"]) => (x: number) => setR({ ...r, [k]: x });
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-4">
        <NumIn label="Max risk per trade" value={r.maxRiskPerTradePct} onChange={set("maxRiskPerTradePct")} suffix="%" />
        <NumIn label="Daily stop" value={r.maxDailyLossPct} onChange={set("maxDailyLossPct")} suffix="%" hint="Your own, tighter than the firm's 5%." />
        <NumIn label="Weekly stop" value={r.maxWeeklyLossPct} onChange={set("maxWeeklyLossPct")} suffix="%" />
        <NumIn label="Personal max drawdown" value={r.personalMaxDrawdownPct} onChange={set("personalMaxDrawdownPct")} suffix="%" />
        <NumIn label="Max trade ideas / day" value={r.maxTradesPerDay} onChange={set("maxTradesPerDay")} step="1" />
        <NumIn label="Pause after N losses" value={r.maxConsecutiveLosses} onChange={set("maxConsecutiveLosses")} step="1" />
        <NumIn label="Warn at % of limit used" value={r.drawdownWarnPct} onChange={set("drawdownWarnPct")} step="5" suffix="%" />
        <NumIn label="Max combined open risk" value={r.maxCombinedOpenRiskPct} onChange={set("maxCombinedOpenRiskPct")} suffix="%" />
        <NumIn label="Risk-escalation flag" value={r.riskEscalationFactor} onChange={set("riskEscalationFactor")} suffix="×" hint="Flag trades after a loss sized above this × median." />
      </div>
      <div className="mt-4">
        <div className="mb-1.5 text-[12.5px] font-medium text-ink-2">Planned sessions</div>
        <div className="flex flex-wrap gap-3">
          {SESSIONS.map((ss) => (
            <label key={ss} className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="check" checked={r.allowedSessions.includes(ss)} onChange={(e) => setR({ ...r, allowedSessions: e.target.checked ? [...r.allowedSessions, ss] : r.allowedSessions.filter((x) => x !== ss) })} />{ss}</label>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-[13px]"><input type="checkbox" className="check" checked={r.requireChecklist} onChange={(e) => setR({ ...r, requireChecklist: e.target.checked })} /> Flag trades without a complete pre-trade checklist</label>
      </div>
      <SaveBar pending={pending} state={state} onSave={() => save({ risk: r })} />
    </>
  );
}

export function PolicyForm({ s }: { s: Settings }) {
  const [p, setP] = useState(s.policy);
  const { state, pending, save } = useSave();
  const set = (k: keyof Settings["policy"]) => (x: number) => setP({ ...p, [k]: x });
  const sum = p.reservePct + p.challengePct + p.personalPct + p.otherPct;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-4">
        <NumIn label="Payout trigger (growth)" value={p.payoutTriggerPct} onChange={set("payoutTriggerPct")} suffix="%" />
        <NumIn label="Max concurrent prop accounts" value={p.maxConcurrentProp} onChange={set("maxConcurrentProp")} step="1" />
        <NumIn label="Fee budget (of free cash)" value={p.feeBudgetPct} onChange={set("feeBudgetPct")} suffix="%" />
        <NumIn label="Reserve floor" value={p.reserveFloor} onChange={set("reserveFloor")} step="50" suffix="$" />
        <NumIn label="Max total allocation" value={p.maxFundedAllocation} onChange={set("maxFundedAllocation")} step="10000" suffix="$" hint="Assumed firm cap — verify." />
        <NumIn label="Min trades before scaling" value={p.minTradesBeforeScaling} onChange={set("minTradesBeforeScaling")} step="1" />
        <NumIn label="Min execution score" value={p.minExecutionScore} onChange={set("minExecutionScore")} step="5" />
      </div>
      <div className="mt-5 eyebrow">Allocation split of each payout (must total 100%)</div>
      <div className="mt-2 grid gap-4 sm:grid-cols-4">
        <NumIn label="Reserve" value={p.reservePct} onChange={set("reservePct")} step="5" suffix="%" />
        <NumIn label="Next challenge" value={p.challengePct} onChange={set("challengePct")} step="5" suffix="%" />
        <NumIn label="Personal account" value={p.personalPct} onChange={set("personalPct")} step="5" suffix="%" />
        <NumIn label="Other" value={p.otherPct} onChange={set("otherPct")} step="5" suffix="%" />
      </div>
      <div className={cx("mt-2 text-[12px] num", sum === 100 ? "text-ink-3" : "text-crit-ink")}>Total {sum}%</div>
      <SaveBar pending={pending} state={state} onSave={() => save({ policy: p })} />
    </>
  );
}

const SC_FIELDS: { k: keyof Scenario; label: string; step: string; suffix?: string; pct?: boolean }[] = [
  { k: "winRate", label: "Win rate", step: "1", suffix: "%", pct: true },
  { k: "avgWinR", label: "Avg win", step: "0.05", suffix: "R" },
  { k: "avgLossR", label: "Avg loss", step: "0.05", suffix: "R" },
  { k: "costR", label: "Costs / trade", step: "0.01", suffix: "R" },
  { k: "tradesPerDay", label: "Trades / day", step: "0.1" },
  { k: "riskPct", label: "Prop risk / trade", step: "0.05", suffix: "%" },
  { k: "personalReturnRiskPct", label: "Personal risk / trade", step: "0.05", suffix: "%" },
  { k: "activationDelayDays", label: "Funded activation delay", step: "1", suffix: "d" },
  { k: "payoutDelayDays", label: "Payout delay", step: "1", suffix: "d" },
];

export function ScenarioEditor({ s }: { s: Settings }) {
  const [sc, setSc] = useState(s.scenarios);
  const { state, pending, save } = useSave();
  const keys = ["conservative", "base", "optimistic"] as const;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Assumption</th>{keys.map((k) => <th key={k}>{sc[k].label}</th>)}</tr></thead>
          <tbody>
            {SC_FIELDS.map((f) => (
              <tr key={f.k}>
                <td className="whitespace-nowrap text-ink-2">{f.label}</td>
                {keys.map((k) => {
                  const raw = sc[k][f.k] as number;
                  const shown = f.pct ? +(raw * 100).toFixed(2) : raw;
                  return (
                    <td key={k} className="min-w-[110px]">
                      <div className="relative">
                        <input type="number" step={f.step} className="field num h-8 pr-7" value={shown} onChange={(e) => setSc({ ...sc, [k]: { ...sc[k], [f.k]: f.pct ? n(e.target.value) / 100 : n(e.target.value) } })} />
                        {f.suffix && <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-ink-3">{f.suffix}</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td className="font-medium">Expectancy</td>
              {keys.map((k) => <td key={k} className="num font-semibold">{(sc[k].winRate * sc[k].avgWinR - (1 - sc[k].winRate) * sc[k].avgLossR - sc[k].costR).toFixed(2)}R</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <SaveBar pending={pending} state={state} onSave={() => save({ scenarios: sc })} label="Save & re-run model" />
    </>
  );
}

export function SimulationForm({ s }: { s: Settings }) {
  const [v, setV] = useState(s.simulation);
  const { state, pending, save } = useSave();
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-4">
        <NumIn label="Monte Carlo paths" value={v.paths} onChange={(x) => setV({ ...v, paths: x })} step="100" />
        <NumIn label="Min trades for live MC" value={v.minTradesForMonteCarlo} onChange={(x) => setV({ ...v, minTradesForMonteCarlo: x })} step="1" />
        <NumIn label="Cross-account correlation" value={v.crossAccountCorrelation} onChange={(x) => setV({ ...v, crossAccountCorrelation: x })} step="0.05" hint="0 = independent, 1 = identical outcomes" />
        <NumIn label="Random seed" value={v.seed} onChange={(x) => setV({ ...v, seed: x })} step="1" />
      </div>
      <SaveBar pending={pending} state={state} onSave={() => save({ simulation: v })} />
    </>
  );
}

export function TemplatesEditor({ s }: { s: Settings }) {
  const [rows, setRows] = useState<Template[]>(s.templates);
  const { state, pending, save } = useSave();
  const upd = (i: number, patch: Partial<Template>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const cols: { k: keyof Template; label: string; w?: string }[] = [
    { k: "size", label: "Size" }, { k: "price", label: "Price" }, { k: "profitTargetP1", label: "P1 %" }, { k: "profitTargetP2", label: "P2 %" },
    { k: "dailyLossPct", label: "Daily %" }, { k: "maxLossPct", label: "Max %" }, { k: "minTradingDays", label: "Min days" }, { k: "splitPct", label: "Split %" },
  ];
  return (
    <>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Firm / program</th>{cols.map((c) => <th key={c.k}>{c.label}</th>)}<th>Verified</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="min-w-[200px]">
                  <input className="field h-8" value={r.firm} onChange={(e) => upd(i, { firm: e.target.value })} />
                  <input className="field mt-1 h-8 text-[12px]" value={r.program} onChange={(e) => upd(i, { program: e.target.value })} />
                </td>
                {cols.map((c) => (
                  <td key={c.k} className="min-w-[84px]"><input type="number" step="0.01" className="field num h-8" value={r[c.k] as number} onChange={(e) => upd(i, { [c.k]: n(e.target.value) } as Partial<Template>)} /></td>
                ))}
                <td className="min-w-[130px]"><input type="date" className="field h-8" value={r.verifiedAt ?? ""} onChange={(e) => upd(i, { verifiedAt: e.target.value || null })} /></td>
                <td><button type="button" className={buttonClass("ghost", "sm")} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className={cx(buttonClass("secondary", "sm"), "mt-3")} onClick={() => setRows([...rows, { ...rows[rows.length - 1], id: `custom-${Date.now()}`, firm: "New firm", program: "Two-step", verifiedAt: null, source: "" }])}>Add template</button>
      <SaveBar pending={pending} state={state} onSave={() => save({ templates: rows })} />
    </>
  );
}

export function ListsForm({ s }: { s: Settings }) {
  const [v, setV] = useState({ strategies: s.strategies.join("\n"), mistakeTags: s.mistakeTags.join("\n"), emotions: s.emotions.join("\n") });
  const { state, pending, save } = useSave();
  const split = (x: string) => x.split("\n").map((y) => y.trim()).filter(Boolean);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Strategies (one per line)"><textarea className="field" rows={7} value={v.strategies} onChange={(e) => setV({ ...v, strategies: e.target.value })} /></Field>
        <Field label="Mistake tags"><textarea className="field" rows={7} value={v.mistakeTags} onChange={(e) => setV({ ...v, mistakeTags: e.target.value })} /></Field>
        <Field label="Emotional states" hint="Anxious, Frustrated, FOMO, Revenge, Euphoric and Tired are treated as high-risk."><textarea className="field" rows={7} value={v.emotions} onChange={(e) => setV({ ...v, emotions: e.target.value })} /></Field>
      </div>
      <SaveBar pending={pending} state={state} onSave={() => save({ strategies: split(v.strategies), mistakeTags: split(v.mistakeTags), emotions: split(v.emotions) })} />
    </>
  );
}

export function DangerZone() {
  const [txt, setTxt] = useState("");
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label='Type "RESET" to delete every account, trade, payout and log'><input className="field w-56" value={txt} onChange={(e) => setTxt(e.target.value)} /></Field>
      <button type="button" disabled={txt !== "RESET" || pending} className={buttonClass("danger")} onClick={() => start(async () => setState(await resetAllData(txt)))}>Erase all data</button>
      <FormMessage state={state} />
    </div>
  );
}

export function PasscodeForm({ has }: { has: boolean }) {
  const { state, onSubmit, pending } = useActionForm(changePasscode);
  const e = state?.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {has && <Field label="Current passcode" error={e.current}><input name="current" type="password" autoComplete="current-password" className="field" /></Field>}
        <Field label={has ? "New passcode" : "Passcode (6+ characters)"} error={e.next}><input name="next" type="password" autoComplete="new-password" className="field" /></Field>
        <Field label="Repeat" error={e.confirm}><input name="confirm" type="password" autoComplete="new-password" className="field" /></Field>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="mr-auto"><FormMessage state={state} /></div>
        <SubmitButton pending={pending}>{has ? "Change passcode" : "Turn on phone access"}</SubmitButton>
      </div>
    </form>
  );
}

export function SignOutButton() {
  const [pending, start] = useTransition();
  return (
    <button type="button" className={buttonClass("ghost", "sm")} disabled={pending} onClick={() => start(async () => { await signOut(); window.location.href = "/login"; })}>
      Sign out of this device
    </button>
  );
}

export function DebtsForm({ s }: { s: Settings }) {
  const [rows, setRows] = useState(s.debts.map((d) => ({ ...d, amount: String(d.amount) })));
  const { state, pending, save } = useSave();
  return (
    <>
      <div className="space-y-2">
        {rows.map((d, i) => (
          <div key={d.id} className="grid grid-cols-[1fr_auto] gap-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <input className="field" value={d.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Name" />
              <input className="field num" type="number" value={d.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} aria-label="Original amount" />
              <input className="field" type="date" value={d.dueDate} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} aria-label="Due date" />
            </div>
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        {!rows.length && <p className="text-[13px] text-ink-3">No debts.</p>}
        <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setRows([...rows, { id: `debt-${Date.now()}`, name: "Debt", amount: "", dueDate: "" }])}>Add debt</button>
      </div>
      <p className="mt-2 text-[12px] text-ink-3">Enter the original amount. Payments are recorded on the Money screen and reduce what&apos;s left automatically.</p>
      <SaveBar pending={pending} state={state} onSave={() => save({ debts: rows.map((d) => ({ ...d, amount: Number(d.amount) })) })} />
    </>
  );
}

export function StrategyForm({ s }: { s: Settings }) {
  const [p, setP] = useState(s.plan);
  const { state, pending, save } = useSave();
  const set = (k: keyof Settings["plan"]) => (x: number) => setP({ ...p, [k]: x });
  const tpls = s.templates;
  return (
    <>
      <div className="mb-2 text-[12.5px] font-medium text-ink-2">Rotation (in buying order)</div>
      <div className="space-y-2">
        {p.steps.map((id, i) => (
          <div key={i} className="flex gap-2">
            <span className="grid w-7 shrink-0 place-items-center text-[12px] text-ink-3 num">{i + 1}</span>
            <select className="field" value={id} onChange={(e) => setP({ ...p, steps: p.steps.map((x, j) => (j === i ? e.target.value : x)) })}>
              {tpls.map((t) => <option key={t.id} value={t.id}>{t.firm} ${t.size.toLocaleString()} · ${t.price}{t.priceVerified ? "" : " (verify)"}</option>)}
            </select>
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setP({ ...p, steps: p.steps.filter((_, j) => j !== i) })} disabled={p.steps.length <= 1}>Remove</button>
          </div>
        ))}
        <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setP({ ...p, steps: [...p.steps, tpls[0].id] })}>Add account</button>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-4">
        <NumIn label="Living per payout" value={p.livingPerPayout} onChange={set("livingPerPayout")} step="25" suffix="$" hint="flat amount off the top of every payout" />
        <NumIn label="Debt share" value={p.debtSharePct} onChange={set("debtSharePct")} step="5" suffix="%" hint="of each payout's remainder, from payout 1" />
        <div className="sm:col-span-4">
          <div className="mb-1.5 text-[12.5px] font-medium text-ink-2">Your own-account share, rising per account (%)</div>
          <div className="flex flex-wrap gap-2">
            {p.personalShareByStep.map((v, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[11px] text-ink-3">#{i + 1}</span>
                <input type="number" step="5" className="field num h-8 w-16" value={v} onChange={(e) => setP({ ...p, personalShareByStep: p.personalShareByStep.map((x, j) => (j === i ? Number(e.target.value) : x)) })} />
              </div>
            ))}
          </div>
          <div className="mt-1 text-[12px] text-ink-3">Share of each payout to your live account, used once the debt is clear. Should rise toward the last account.</div>
        </div>
        <NumIn label="Retry budget" value={p.retryBudget} onChange={set("retryBudget")} step="10" suffix="$" hint="reserve kept for re-buying a failed challenge" />
        <NumIn label="Phase 1 speed target" value={p.phase1Days} onChange={set("phase1Days")} step="1" suffix="d" />
        <NumIn label="Phase 2 speed target" value={p.phase2Days} onChange={set("phase2Days")} step="1" suffix="d" />
        <div className="sm:col-span-4">
          <div className="mb-1.5 text-[12.5px] font-medium text-ink-2">Payouts before moving on, per account</div>
          <div className="flex flex-wrap gap-2">
            {p.payoutsByStep.map((v, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[11px] text-ink-3">#{i + 1}</span>
                <input type="number" step="1" min="1" className="field num h-8 w-16" value={v} onChange={(e) => setP({ ...p, payoutsByStep: p.payoutsByStep.map((x, j) => (j === i ? Number(e.target.value) : x)) })} />
              </div>
            ))}
          </div>
          <div className="mt-1 text-[12px] text-ink-3">The first account takes one fast payout, then you rotate on; later accounts take one or two before moving.</div>
        </div>
        <NumIn label="Your average risk (planning)" value={p.avgRiskPct} onChange={set("avgRiskPct")} step="0.25" suffix="%" hint="you still choose each trade" />
        <NumIn label="Personal account risk" value={p.personalRiskPct} onChange={set("personalRiskPct")} step="0.25" suffix="%" />
        <NumIn label="Plan win rate" value={Math.round(p.winRate * 100)} onChange={(x) => setP({ ...p, winRate: x / 100 })} step="1" suffix="%" />
        <NumIn label="Plan average win" value={p.avgWinR} onChange={set("avgWinR")} step="0.1" suffix="R" />
        <NumIn label="Trades per day" value={p.tradesPerDay} onChange={set("tradesPerDay")} step="0.1" />
      </div>
      <div className={cx("mt-2 text-[12px]", p.debtSharePct + p.personalSharePct > 100 ? "text-crit-ink" : "text-ink-3")}>Debt + personal = {p.debtSharePct + p.personalSharePct}% · reinvestment gets the rest ({Math.max(0, 100 - p.debtSharePct - p.personalSharePct)}%).</div>
      <SaveBar pending={pending} state={state} onSave={() => save({ plan: p })} label="Save & re-plan" />
    </>
  );
}
