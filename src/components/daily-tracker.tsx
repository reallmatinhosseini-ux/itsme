"use client";

import { useMemo, useState, useTransition } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, Flame, Minus, Plus, Target, TrendingUp, X } from "lucide-react";
import { Card, cx } from "./ui";
import { clearDay, logDay } from "@/app/tracker/actions";

const usd = (n: number) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");

export type Day = { date: string; pnl: number; noTrade: boolean; note: string | null; logged: boolean };

const wd = (iso: string) => new Date(iso + "T00:00").toLocaleDateString("en-US", { weekday: "short" });
const dayNum = (iso: string) => new Date(iso + "T00:00").getDate();
const full = (iso: string) => new Date(iso + "T00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

export function DailyTracker({ today, days, week, dailyTarget, dailyMin }: { today: string; days: Day[]; week: Day[]; dailyTarget: number; dailyMin: number }) {
  const todayDay = days.find((d) => d.date === today) ?? { date: today, pnl: 0, noTrade: false, note: null, logged: false };
  const weekTarget = dailyTarget * 5;

  const stats = useMemo(() => {
    const logged = week.filter((d) => d.logged);
    const traded = logged.filter((d) => !d.noTrade);
    const weekPnl = traded.reduce((s, d) => s + d.pnl, 0);
    const green = traded.filter((d) => d.pnl >= dailyMin).length;
    const best = traded.reduce((m, d) => Math.max(m, d.pnl), 0);
    // Discipline streak: most-recent logged days with no loss (profit or an honest no-trade day).
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const d = days[i];
      if (!d.logged) { if (d.date > today) continue; else break; }
      if (d.noTrade || d.pnl >= 0) streak++; else break;
    }
    return { weekPnl, green, best, logged: logged.length, streak };
  }, [week, days, dailyMin, today]);

  const recent = useMemo(() => days.filter((d) => d.logged).slice().reverse().slice(0, 8), [days]);

  // Momentum: cumulative P&L across the recent logged run (an equity curve that climbs as you win).
  const curve = useMemo(() => {
    const pts: { name: string; cum: number }[] = [{ name: "Start", cum: 0 }];
    let cum = 0;
    for (const d of days.filter((x) => x.logged && x.date <= today).slice(-14)) {
      if (!d.noTrade) cum += d.pnl;
      pts.push({ name: new Date(d.date + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }), cum: Math.round(cum) });
    }
    return pts;
  }, [days, today]);
  const cumTotal = curve[curve.length - 1]?.cum ?? 0;
  const weekPct = Math.max(0, Math.min(100, (stats.weekPnl / weekTarget) * 100));

  const motivate =
    stats.streak >= 5 ? { t: `${stats.streak}-day disciplined streak — elite consistency. Protect it.`, tone: "good" as const }
      : stats.streak >= 2 ? { t: `${stats.streak} disciplined days in a row. Keep stacking clean days.`, tone: "good" as const }
        : stats.weekPnl >= weekTarget ? { t: "Weekly goal already hit. Bank it — don't give it back.", tone: "good" as const }
          : stats.logged === 0 ? { t: "Log your first day. One clean decision at a time gets you to Dec 29.", tone: "accent" as const }
            : { t: "Consistency is the edge. A no-trade day beats a forced one.", tone: "accent" as const };

  return (
    <div className="space-y-4">
      {/* Goal banner */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-16 -right-10 size-[220px] rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-[11px] bg-accent-soft text-accent-ink"><Target className="size-[18px]" /></span>
            <div>
              <div className="text-[14px] font-semibold">Daily goal {usd(dailyTarget)} · weekly {usd(weekTarget)}</div>
              <div className="text-[12px] text-ink-3">Minimum worth taking {usd(dailyMin)}. Never force a trade to hit it.</div>
            </div>
          </div>
          <div className="min-w-[180px] flex-1 sm:max-w-[260px]">
            <div className="mb-1 flex justify-between text-[12px]"><span className="text-ink-3">This week</span><span className={cx("num font-semibold", stats.weekPnl >= 0 ? "text-good-ink" : "text-crit-ink")}>{signed(stats.weekPnl)} / {usd(weekTarget)}</span></div>
            <div className="h-2.5 overflow-hidden rounded-full bg-ink/[0.06]"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${weekPct}%` }} /></div>
          </div>
        </div>
      </Card>

      {/* Today */}
      <TodayCard day={todayDay} dailyTarget={dailyTarget} dailyMin={dailyMin} />

      {/* Motivation */}
      <div className={cx("flex items-center gap-2.5 rounded-[14px] px-4 py-3 text-[13px] font-medium", motivate.tone === "good" ? "bg-good-soft text-good-ink" : "bg-accent-soft text-accent-ink")}>
        {motivate.tone === "good" ? <Flame className="size-4 shrink-0" /> : <TrendingUp className="size-4 shrink-0" />}
        {motivate.t}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Streak" value={`${stats.streak} day${stats.streak === 1 ? "" : "s"}`} sub="disciplined" tone={stats.streak > 0 ? "good" : undefined} />
        <Stat label="Green days" value={`${stats.green} / 5`} sub={`≥ ${usd(dailyMin)}`} />
        <Stat label="Best day" value={usd(stats.best)} sub="this week" />
        <Stat label="Days logged" value={String(stats.logged)} sub="this week" />
      </div>

      {/* Momentum chart */}
      <Card>
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2"><TrendingUp className="size-4 text-accent-ink" /><h2 className="text-[15px] font-semibold">Momentum</h2></div>
          <span className={cx("num text-[14px] font-semibold", cumTotal >= 0 ? "text-good-ink" : "text-crit-ink")}>{signed(cumTotal)}</span>
        </div>
        <p className="mb-3 text-[12px] text-ink-3">Your running total across recent days — watch it climb as you stack green days.</p>
        {curve.length > 1 ? (
          <div className="h-[200px] w-full">
            <ResponsiveContainer>
              <AreaChart data={curve} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="momFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} dy={6} minTickGap={16} />
                <YAxis tickFormatter={(v) => signed(Number(v))} tickLine={false} axisLine={false} width={52} />
                <Tooltip cursor={{ stroke: "var(--color-line-strong)" }} formatter={(v: number | string) => [signed(Number(v)), "Total"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--color-line-strong)", boxShadow: "var(--shadow-float)", fontSize: 12.5 }} />
                <ReferenceLine y={0} stroke="var(--color-ink-4)" />
                <Area type="monotone" dataKey="cum" stroke="var(--color-accent)" strokeWidth={2.5} fill="url(#momFill)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="rounded-[12px] border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">Log a few days and your momentum curve appears here.</div>
        )}
      </Card>

      {/* Week strip */}
      <Card>
        <div className="mb-3 flex items-center gap-2"><TrendingUp className="size-4 text-accent-ink" /><h2 className="text-[15px] font-semibold">This week</h2></div>
        <div className="grid grid-cols-7 gap-2">
          {week.map((d) => {
            const isToday = d.date === today;
            const good = d.logged && !d.noTrade && d.pnl >= dailyMin;
            const loss = d.logged && !d.noTrade && d.pnl < 0;
            return (
              <div key={d.date} className={cx("rounded-[12px] border p-2 text-center", isToday ? "border-accent/50 bg-accent-soft" : "border-line bg-ink/[0.05]", d.date > today && "opacity-45")}>
                <div className="text-[10.5px] uppercase tracking-[0.04em] text-ink-3">{wd(d.date)}</div>
                <div className="num text-[15px] font-semibold">{dayNum(d.date)}</div>
                <div className="mt-1 flex h-4 items-center justify-center">
                  {d.logged
                    ? d.noTrade
                      ? <span className="grid size-4 place-items-center rounded-full bg-ink/10 text-ink-3"><Minus className="size-2.5" /></span>
                      : <span className={cx("num text-[10.5px] font-semibold", good ? "text-good-ink" : loss ? "text-crit-ink" : "text-ink-2")}>{signed(d.pnl)}</span>
                    : d.date <= today ? <span className="text-[10px] text-ink-4">—</span> : null}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[12px] leading-[18px] text-ink-3">A no-trade day (<Minus className="inline size-3" />) when there&apos;s no valid setup is a <b className="text-ink">good</b> decision, not a miss. Daily target {usd(dailyTarget)}, minimum worth taking {usd(dailyMin)}. Never force a trade to hit a number.</p>
      </Card>

      {/* Recent log */}
      <Card>
        <div className="mb-3 flex items-center gap-2"><Check className="size-4 text-accent-ink" /><h2 className="text-[15px] font-semibold">Recent days</h2></div>
        {recent.length ? (
          <div className="space-y-1.5">
            {recent.map((d) => (
              <RecentRow key={d.date} day={d} dailyMin={dailyMin} />
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-ink-3">Nothing logged yet. Record today&apos;s result above and your week fills in.</p>
        )}
      </Card>
    </div>
  );
}

function TodayCard({ day, dailyTarget, dailyMin }: { day: Day; dailyTarget: number; dailyMin: number }) {
  const [editing, setEditing] = useState(!day.logged);
  const [pnl, setPnl] = useState(day.logged ? String(day.pnl) : "");
  const [noTrade, setNoTrade] = useState(day.noTrade);
  const [note, setNote] = useState(day.note ?? "");
  const [pending, start] = useTransition();

  const save = () => start(async () => { await logDay(day.date, noTrade ? 0 : Number(pnl || 0), noTrade, note); setEditing(false); });

  const good = day.logged && !day.noTrade && day.pnl >= dailyMin;
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-16 -right-10 size-[220px] rounded-full bg-accent/10 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="eyebrow">Today · {full(day.date)}</div>
          {day.logged && !editing && <button onClick={() => setEditing(true)} className="text-[12px] font-semibold text-accent-ink">Edit</button>}
        </div>

        {!editing && day.logged ? (
          <div className="mt-2 flex items-end gap-3">
            {day.noTrade ? (
              <div className="text-[30px] font-semibold tracking-[-0.03em] text-ink-2">No-trade day</div>
            ) : (
              <div className={cx("num text-[36px] font-semibold tracking-[-0.04em]", day.pnl > 0 ? "text-good-ink" : day.pnl < 0 ? "text-crit-ink" : "")}>{signed(day.pnl)}</div>
            )}
            <div className="pb-1.5 text-[12.5px] text-ink-3">{day.noTrade ? "No valid setup — disciplined call" : good ? "At or above target" : day.pnl >= 0 ? "Green, under target" : "Red day — reset and protect capital"}</div>
          </div>
        ) : (
          <div className="mt-3">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-2">
              <input type="checkbox" className="check" checked={noTrade} onChange={(e) => setNoTrade(e.target.checked)} />
              No valid setup today — no-trade day
            </label>
            {!noTrade && (
              <div className="mt-3">
                <label className="eyebrow mb-1 block">Today&apos;s result (live account P&amp;L)</label>
                <div className="flex items-center gap-2">
                  <span className="text-[18px] font-semibold text-ink-3">$</span>
                  <input type="number" inputMode="decimal" value={pnl} onChange={(e) => setPnl(e.target.value)} placeholder="0" className="field num max-w-[180px]" step="1" autoFocus />
                </div>
                <div className="mt-2 text-[12px] text-ink-3">Target {usd(dailyTarget)} · minimum worth taking {usd(dailyMin)}.</div>
              </div>
            )}
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="field mt-3" />
            <button onClick={save} disabled={pending} className="mt-3 inline-flex items-center gap-1.5 rounded-[11px] bg-fill px-4 py-2 text-[13px] font-semibold text-fill-fg disabled:opacity-60">
              <Plus className="size-3.5" /> {pending ? "Saving…" : day.logged ? "Update today" : "Log today"}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

function RecentRow({ day, dailyMin }: { day: Day; dailyMin: number }) {
  const [pending, start] = useTransition();
  const good = !day.noTrade && day.pnl >= dailyMin;
  return (
    <div className="flex items-center gap-3 rounded-[11px] bg-ink/[0.05] px-3.5 py-2.5 shadow-[0_0_0_1px_var(--color-line)]">
      <span className={cx("grid size-7 shrink-0 place-items-center rounded-full", day.noTrade ? "bg-ink/[0.06] text-ink-3" : good ? "bg-good-soft text-good-ink" : day.pnl < 0 ? "bg-crit-soft text-crit-ink" : "bg-ink/[0.06] text-ink-2")}>
        {day.noTrade ? <Minus className="size-3.5" /> : good ? <Check className="size-3.5" /> : day.pnl < 0 ? <X className="size-3.5" /> : <Minus className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{full(day.date)}</div>
        {day.note && <div className="truncate text-[11.5px] text-ink-3">{day.note}</div>}
      </div>
      <span className={cx("num text-[14px] font-semibold", day.noTrade ? "text-ink-3" : day.pnl > 0 ? "text-good-ink" : day.pnl < 0 ? "text-crit-ink" : "text-ink-2")}>{day.noTrade ? "No trade" : signed(day.pnl)}</span>
      <button onClick={() => start(() => clearDay(day.date))} disabled={pending} className="text-ink-4 hover:text-crit-ink" aria-label="Remove"><X className="size-3.5" /></button>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "good" | "crit" }) {
  return (
    <div className="rounded-[14px] bg-ink/[0.05] p-3.5 shadow-[0_0_0_1px_var(--color-line)]">
      <div className="eyebrow mb-1">{label}</div>
      <div className={cx("num text-[20px] font-semibold tracking-[-0.03em]", tone === "good" && "text-good-ink", tone === "crit" && "text-crit-ink")}>{value}</div>
      <div className="text-[11px] text-ink-3">{sub}</div>
    </div>
  );
}
