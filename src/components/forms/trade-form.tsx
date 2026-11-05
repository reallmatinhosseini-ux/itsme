"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveTrade, type ActionState } from "@/app/actions";
import type { Trade } from "@/db/schema";
import { Field, StatusIcon, cx } from "@/components/ui";
import { FormMessage, SubmitButton, useActionForm } from "@/components/ui-client";

export const CHECKLIST: { key: string; label: string }[] = [
  { key: "plan", label: "This trade is in today's written plan" },
  { key: "setup", label: "Setup matches one of my defined strategies" },
  { key: "stop", label: "Stop is at a logical level and placed before entry" },
  { key: "risk", label: "Risk is within my per-trade limit" },
  { key: "news", label: "Checked high-impact news for the next 30 minutes" },
  { key: "emotion", label: "Calm — not chasing, not recovering a loss" },
  { key: "limits", label: "Within today's trade-count and loss limits" },
];

export interface TradeFormContext {
  accounts: { id: number; name: string; size: number; isProp: boolean; todayPnl: number; dailyLossLimit: number; ideasToday: number; stage: string }[];
  maxRiskPct: number;
  maxTrades: number;
  sessions: string[];
  allowedSessions: string[];
  strategies: string[];
  setups: string[];
  instruments: string[];
  mistakeTags: string[];
  emotions: string[];
  now: string;
}

export function TradeForm({ ctx, trade }: { ctx: TradeFormContext; trade?: Trade }) {
  const router = useRouter();
  const { state, onSubmit, pending } = useActionForm(saveTrade);
  const t = trade;
  const [accountId, setAccountId] = useState<number>(t?.accountId ?? ctx.accounts[0]?.id ?? 0);
  const [status, setStatus] = useState<"open" | "closed">(t?.status ?? "closed");
  const [direction, setDirection] = useState<"buy" | "sell">(t?.direction ?? "buy");
  const [entry, setEntry] = useState(t?.entry?.toString() ?? "");
  const [stop, setStop] = useState(t?.stop?.toString() ?? "");
  const [tp, setTp] = useState(t?.takeProfit?.toString() ?? "");
  const [risk, setRisk] = useState(t?.riskAmount?.toString() ?? "");
  const [pnl, setPnl] = useState(t?.pnl?.toString() ?? "");
  const [session, setSession] = useState(t?.session ?? "");
  const checks0 = useMemo(() => {
    try { return JSON.parse(t?.checklist ?? "{}") as Record<string, boolean>; } catch { return {}; }
  }, [t]);
  const [checks, setChecks] = useState<Record<string, boolean>>(checks0);
  const mistakes0: string[] = t ? JSON.parse(t.mistakes) : [];
  const e = state?.fieldErrors ?? {};

  useEffect(() => {
    if (state?.ok) router.push("/journal");
  }, [state, router]);

  const acct = ctx.accounts.find((a) => a.id === accountId);
  const riskN = Number(risk);
  const riskPct = acct && riskN > 0 ? (riskN / acct.size) * 100 : null;
  const plannedR = Number(entry) && Number(stop) && Number(tp) ? Math.abs((Number(tp) - Number(entry)) / (Number(entry) - Number(stop))) : null;
  const realizedR = riskN > 0 && pnl !== "" ? Number(pnl) / riskN : null;
  const lossRoom = acct ? acct.dailyLossLimit + Math.min(0, acct.todayPnl) : null;

  const auto = [
    { label: "Risk per trade", ok: riskPct == null ? null : riskPct <= ctx.maxRiskPct * 1.05, detail: riskPct == null ? "Enter risk" : `${riskPct.toFixed(2)}% of ${acct!.isProp ? "account size" : "equity"} (limit ${ctx.maxRiskPct}%)` },
    { label: "Daily loss room", ok: lossRoom == null ? null : riskN <= lossRoom, detail: lossRoom == null ? "—" : `$${lossRoom.toFixed(0)} left before the ${acct!.isProp ? "firm" : "personal"} daily limit` },
    { label: "Trade count", ok: acct ? acct.ideasToday < ctx.maxTrades || !!t : null, detail: acct ? `${acct.ideasToday}/${ctx.maxTrades} ideas today on this account` : "—" },
    { label: "Session", ok: session ? ctx.allowedSessions.includes(session) : null, detail: session ? (ctx.allowedSessions.includes(session) ? "Planned session" : "Outside planned sessions") : "Choose a session" },
  ];
  const allChecked = CHECKLIST.every((c) => checks[c.key]);

  return (
    <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-12">
      {t && <input type="hidden" name="id" value={t.id} />}
      <input type="hidden" name="checklistKeys" value={CHECKLIST.map((c) => c.key).join(",")} />
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="status" value={status} />

      <div className="space-y-4 lg:col-span-8">
        <Section title="Trade">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Account" error={e.accountId} className="col-span-2">
              <select name="accountId" className="field" value={accountId} onChange={(ev) => setAccountId(Number(ev.target.value))}>
                {ctx.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.stage}</option>)}
              </select>
            </Field>
            <Field label="Instrument" error={e.instrument}>
              <input name="instrument" list="instruments" className="field uppercase" defaultValue={t?.instrument ?? ""} placeholder="EURUSD" aria-invalid={!!e.instrument} autoCapitalize="characters" />
              <datalist id="instruments">{ctx.instruments.map((i) => <option key={i} value={i} />)}</datalist>
            </Field>
            <Field label="Direction">
              <Toggle value={direction} onChange={(v) => setDirection(v as "buy" | "sell")} options={[{ v: "buy", l: "Buy" }, { v: "sell", l: "Sell" }]} />
            </Field>
            <Field label="Entry" error={e.entry}><input name="entry" type="number" inputMode="decimal" step="any" className="field num" value={entry} onChange={(ev) => setEntry(ev.target.value)} aria-invalid={!!e.entry} /></Field>
            <Field label="Stop loss" error={e.stop}><input name="stop" type="number" inputMode="decimal" step="any" className="field num" value={stop} onChange={(ev) => setStop(ev.target.value)} aria-invalid={!!e.stop} /></Field>
            <Field label="Size (lots)" error={e.size}><input name="size" type="number" inputMode="decimal" step="any" className="field num" defaultValue={t?.size ?? ""} aria-invalid={!!e.size} /></Field>
            <Field label="Risk ($)" error={e.riskAmount} hint={acct ? `Your call · ceiling $${((acct.size * ctx.maxRiskPct) / 100).toFixed(0)}` : undefined}><input name="riskAmount" type="number" inputMode="decimal" step="0.01" className="field num" value={risk} onChange={(ev) => setRisk(ev.target.value)} aria-invalid={!!e.riskAmount} /></Field>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 text-[12.5px] font-medium text-ink-2">Setup quality <span className="font-normal text-ink-3">— the reason for your size</span></div>
            <div className="flex flex-wrap gap-1.5">
              {[["A+", "Best possible"], ["A", "Strong"], ["B", "Decent"], ["C", "Marginal"]].map(([g, d]) => (
                <label key={g} className="cursor-pointer">
                  <input type="radio" name="grade" value={g} defaultChecked={t?.grade === g} className="peer sr-only" />
                  <span className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-fill px-3 text-[13px] text-ink-2 shadow-[0_0_0_1px_var(--color-line-strong)] peer-checked:bg-fill peer-checked:text-fill-fg"><b>{g}</b><span className="text-[11.5px] opacity-70">{d}</span></span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-5"><Toggle value={status} onChange={(v) => setStatus(v as "open" | "closed")} options={[{ v: "closed", l: "Closed" }, { v: "open", l: "Still open" }]} /></div>
          {status === "closed" && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Field label="Result ($, after costs)" error={e.pnl}><input name="pnl" type="number" inputMode="decimal" step="0.01" className="field num" value={pnl} onChange={(ev) => setPnl(ev.target.value)} aria-invalid={!!e.pnl} placeholder="-30 or 45" /></Field>
              <Field label="R"><div className={cx("field num flex items-center font-semibold", realizedR == null ? "text-ink-4" : realizedR >= 0 ? "text-good-ink" : "text-crit-ink")}>{realizedR == null ? "auto" : `${realizedR >= 0 ? "+" : ""}${realizedR.toFixed(2)}R`}</div></Field>
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="How did you feel?">
              <select name="emotion" className="field" defaultValue={t?.emotion ?? ""}>
                <option value="">—</option>
                {ctx.emotions.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Followed your plan?">
              <select name="followedPlan" className="field" defaultValue={t?.followedPlan == null ? "" : t.followedPlan ? "yes" : "no"}>
                <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            </Field>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 text-[12.5px] font-medium text-ink-2">Any mistakes?</div>
            <div className="flex flex-wrap gap-1.5">
              {ctx.mistakeTags.map((m) => (
                <label key={m} className="cursor-pointer">
                  <input type="checkbox" name="mistakes" value={m} defaultChecked={mistakes0.includes(m)} className="peer sr-only" />
                  <span className="inline-flex h-8 items-center rounded-full bg-fill px-3 text-[12.5px] text-ink-2 shadow-[0_0_0_1px_var(--color-line-strong)] transition-colors peer-checked:bg-crit-soft peer-checked:text-crit-ink peer-checked:shadow-[0_0_0_1px_rgb(208_59_59/0.3)]">{m}</span>
                </label>
              ))}
            </div>
          </div>
        </Section>

        <details className="glass group" open={!!t || !!e.openedAt || !!e.closedAt}>
          <summary className="flex cursor-pointer list-none items-center justify-between p-5">
            <span>
              <span className="block text-[14px] font-semibold">More details</span>
              <span className="block text-[12.5px] text-ink-3">Optional: times, setup, target, notes, screenshots</span>
            </span>
            <span className="text-[12.5px] text-ink-3 group-open:hidden">Show</span>
            <span className="hidden text-[12.5px] text-ink-3 group-open:inline">Hide</span>
          </summary>
          <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-2">
            <Field label="Opened" error={e.openedAt}><input name="openedAt" type="datetime-local" className="field" defaultValue={t?.openedAt ?? ctx.now} /></Field>
            {status === "closed" ? <Field label="Closed" error={e.closedAt}><input name="closedAt" type="datetime-local" className="field" defaultValue={t?.closedAt ?? ctx.now} aria-invalid={!!e.closedAt} /></Field> : <div className="hidden sm:block" />}
            <Field label="Session">
              <select name="session" className="field" value={session} onChange={(ev) => setSession(ev.target.value)}>
                <option value="">—</option>
                {ctx.sessions.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Market condition">
              <select name="marketCondition" className="field" defaultValue={t?.marketCondition ?? ""}>
                <option value="">—</option>
                {["Trending", "Ranging", "Volatile / news", "Low volatility", "Choppy"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Strategy">
              <input name="strategy" list="strategies" className="field" defaultValue={t?.strategy ?? ""} />
              <datalist id="strategies">{ctx.strategies.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Setup">
              <input name="setup" list="setups" className="field" defaultValue={t?.setup ?? ""} />
              <datalist id="setups">{ctx.setups.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Take profit" hint={plannedR != null ? `Planned 1 : ${plannedR.toFixed(2)}` : undefined}><input name="takeProfit" type="number" inputMode="decimal" step="any" className="field num" value={tp} onChange={(ev) => setTp(ev.target.value)} /></Field>
            {status === "closed" ? <Field label="Exit price"><input name="exitPrice" type="number" inputMode="decimal" step="any" className="field num" defaultValue={t?.exitPrice ?? ""} /></Field> : <div className="hidden sm:block" />}
            <Field label="Execution quality (1–5)">
              <select name="executionQuality" className="field" defaultValue={t?.executionQuality ?? ""}>
                <option value="">—</option>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} — {["", "Poor", "Below plan", "Acceptable", "Good", "Textbook"][n]}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 self-end pb-2.5 text-[13px] text-ink-2"><input type="checkbox" className="check" name="newsWindow" defaultChecked={t?.newsWindow ?? false} /> Within 5 min of big news</label>
            <Field label="Why this trade?" className="sm:col-span-2"><textarea name="thesis" className="field" rows={2} defaultValue={t?.thesis ?? ""} placeholder="Why here, and what would prove it wrong?" /></Field>
            <Field label="Lesson" className="sm:col-span-2"><textarea name="lessons" className="field" rows={2} defaultValue={t?.lessons ?? ""} /></Field>
            <Field label="Entry screenshot" hint={t?.entryShot ? "Uploading replaces the current one." : undefined}><input name="entryShotFile" type="file" accept="image/*" className="field pt-2 text-[12.5px]" /></Field>
            <Field label="Exit screenshot"><input name="exitShotFile" type="file" accept="image/*" className="field pt-2 text-[12.5px]" /></Field>
          </div>
        </details>
      </div>

      <div className="lg:col-span-4">
        <div className="sticky top-6 space-y-4">
          <Section title="Pre-trade checklist">
            <div className="space-y-2">
              {auto.map((a) => (
                <div key={a.label} className="flex items-start gap-2 text-[12.5px]">
                  <StatusIcon level={a.ok == null ? "pending" : a.ok ? "good" : "warning"} className="mt-px" />
                  <div><div className="font-medium text-ink">{a.label}</div><div className="text-ink-3">{a.detail}</div></div>
                </div>
              ))}
            </div>
            <div className="my-4 h-px bg-line" />
            <div className="space-y-2.5">
              {CHECKLIST.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-[18px] text-ink-2">
                  <input type="checkbox" className="check mt-px" name={`chk_${c.key}`} checked={!!checks[c.key]} onChange={(ev) => setChecks({ ...checks, [c.key]: ev.target.checked })} />
                  {c.label}
                </label>
              ))}
            </div>
            <div className={cx("mt-4 rounded-xl px-3 py-2 text-[12.5px]", allChecked ? "bg-good-soft text-good-ink" : "bg-warn-soft text-warn-ink")}>
              {allChecked ? "Checklist complete." : "Unchecked items are saved honestly — they lower the day's execution score and feed the insights engine."}
            </div>
          </Section>
          <FormMessage state={state} />
          <SubmitButton pending={pending} className="w-full">{t ? "Save trade" : "Log trade"}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass p-5">
      <h2 className="mb-4 text-[14px] font-semibold tracking-[-0.01em]">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <div className="inline-flex w-full rounded-[10px] bg-ink/[0.05] p-[3px]">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} className={cx("h-[30px] flex-1 rounded-[8px] px-3 text-[13px] font-medium transition-all", value === o.v ? "bg-fill text-ink shadow-[0_1px_2px_rgb(16_24_40/0.08),0_0_0_1px_rgb(15_23_42/0.04)]" : "text-ink-2 hover:text-ink")}>
          {o.l}
        </button>
      ))}
    </div>
  );
}
