"use client";

import { saveDailyLog, type ActionState } from "@/app/actions";
import type { DailyLog } from "@/db/schema";
import { Field } from "@/components/ui";
import { FormMessage, SubmitButton, useActionForm } from "@/components/ui-client";

export const PRE_CHECKS = [
  { key: "sleep", label: "Rested and focused (no trading tired, ill or distracted)" },
  { key: "news", label: "Reviewed today's high-impact economic events" },
  { key: "levels", label: "Marked key levels on every instrument I may trade" },
  { key: "limits", label: "I know today's max loss and will stop there" },
  { key: "noRevenge", label: "Yesterday is closed — no recovering losses today" },
];

export function PlanForm({ date, log, sessions, defaultMaxRisk }: { date: string; log?: DailyLog; sessions: string[]; defaultMaxRisk: number }) {
  const { state, onSubmit, pending } = useActionForm(saveDailyLog);
  const pre = log ? (JSON.parse(log.preChecklist) as Record<string, boolean>) : {};
  const chosen: string[] = log ? JSON.parse(log.sessions) : [];
  const e = state?.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-4" key={`${date}-${log?.planCompletedAt ?? "new"}`}>
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="part" value="plan" />
      <input type="hidden" name="preKeys" value={PRE_CHECKS.map((c) => c.key).join(",")} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Market bias" className="sm:col-span-2" error={e.plan}><input name="bias" className="field" defaultValue={log?.bias ?? ""} placeholder="e.g. USD strength into CPI; EURUSD below 1.0850 bearish" /></Field>
        <Field label="Max permitted loss today ($)" hint={`Your daily stop: ${defaultMaxRisk}% per account`}><input name="maxRisk" type="number" step="0.01" className="field num" defaultValue={log?.maxRisk ?? ""} /></Field>
      </div>
      <Field label="Trading plan"><textarea name="plan" className="field" rows={3} defaultValue={log?.plan ?? ""} placeholder="Which setups, on which instruments, under what conditions. What would make you not trade today?" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Key levels"><textarea name="keyLevels" className="field" rows={3} defaultValue={log?.keyLevels ?? ""} placeholder={"EURUSD 1.0880 / 1.0820\nXAUUSD 2,410"} /></Field>
        <Field label="Important economic events" hint="From your economic calendar — times in your timezone."><textarea name="events" className="field" rows={3} defaultValue={log?.events ?? ""} placeholder={"14:30 US CPI (high)\n20:00 FOMC minutes"} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Daily objective (process, not P/L)" className="sm:col-span-2"><input name="objective" className="field" defaultValue={log?.objective ?? ""} placeholder="e.g. Only A+ setups; full checklist on every trade" /></Field>
        <Field label="Readiness (1–10)"><input name="readiness" type="number" min={1} max={10} className="field num" defaultValue={log?.readiness ?? ""} /></Field>
      </div>
      <div>
        <div className="mb-1.5 text-[12.5px] font-medium text-ink-2">Sessions I will trade</div>
        <div className="flex flex-wrap gap-3">
          {sessions.map((s) => <label key={s} className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="check" name="sessions" value={s} defaultChecked={chosen.includes(s)} />{s}</label>)}
        </div>
      </div>
      <div className="rounded-2xl bg-ink/[0.025] p-4">
        <div className="eyebrow mb-2">Readiness checklist</div>
        <div className="space-y-2">
          {PRE_CHECKS.map((c) => <label key={c.key} className="flex items-start gap-2.5 text-[13px] text-ink-2"><input type="checkbox" className="check mt-px" name={`pre_${c.key}`} defaultChecked={!!pre[c.key]} />{c.label}</label>)}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3"><FormMessage state={state} /><SubmitButton pending={pending} className="ml-auto">{log?.planCompletedAt ? "Update plan" : "Lock in plan"}</SubmitButton></div>
    </form>
  );
}

export function ReviewForm({ date, log }: { date: string; log?: DailyLog }) {
  const { state, onSubmit, pending } = useActionForm(saveDailyLog);
  const e = state?.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-4" key={`${date}-${log?.reviewCompletedAt ?? "new"}`}>
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="part" value="review" />
      <Field label="Daily review"><textarea name="review" className="field" rows={3} defaultValue={log?.review ?? ""} placeholder="What happened vs the plan?" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mistake analysis"><textarea name="mistakes" className="field" rows={3} defaultValue={log?.mistakes ?? ""} placeholder="What went wrong, and which rule would have prevented it?" /></Field>
        <Field label="Emotional review"><textarea name="emotionalReview" className="field" rows={3} defaultValue={log?.emotionalReview ?? ""} placeholder="How did you feel before, during and after? Any urge to break rules?" /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Tomorrow's priorities" className="sm:col-span-2"><textarea name="tomorrow" className="field" rows={2} defaultValue={log?.tomorrow ?? ""} /></Field>
        <div className="space-y-4">
          <Field label="Self-rated discipline (1–10)" error={e.selfScore}><input name="selfScore" type="number" min={1} max={10} className="field num" defaultValue={log?.selfScore ?? ""} /></Field>
          <Field label="Screenshot"><input name="screenshotFile" type="file" accept="image/*" className="field pt-1.5 text-[12.5px]" /></Field>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3"><FormMessage state={state} /><SubmitButton pending={pending} className="ml-auto">{log?.reviewCompletedAt ? "Update review" : "Complete review"}</SubmitButton></div>
    </form>
  );
}
