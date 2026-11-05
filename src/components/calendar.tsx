import Link from "next/link";
import { addDays, parseDay, dayKey, weekKey } from "@/lib/engine/util";
import { signedUsd, rr, fmtDate } from "@/lib/format";
import { cx } from "./ui";

/** Month-grid P/L calendar. Diverging colour by R so account size doesn't distort intensity. */
export function PnlCalendar({ days, month, scores }: { days: { key: string; pnl: number; r: number; n: number }[]; month: string; scores?: Map<string, number> }) {
  const map = new Map(days.map((d) => [d.key, d]));
  const first = parseDay(`${month}-01`);
  const start = weekKey(dayKey(first));
  const cells: string[] = [];
  for (let d = start; cells.length < 42; d = addDays(d, 1)) cells.push(d);
  const weeks = Array.from({ length: 6 }, (_, i) => cells.slice(i * 7, i * 7 + 7)).filter((w) => w.some((d) => d.startsWith(month)));
  const maxR = Math.max(1, ...days.filter((d) => d.key.startsWith(month)).map((d) => Math.abs(d.r)));

  return (
    <div className="w-full">
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,0.9fr)] gap-1.5 text-[11px] text-ink-3">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Week"].map((d) => (
          <div key={d} className="px-1 pb-1 font-medium">{d}</div>
        ))}
        {weeks.map((w) => {
          const inWeek = w.map((d) => map.get(d)).filter(Boolean) as { pnl: number; r: number; n: number }[];
          const wk = inWeek.reduce((s, d) => ({ pnl: s.pnl + d.pnl, r: s.r + d.r }), { pnl: 0, r: 0 });
          return [
            ...w.map((d) => {
              const v = map.get(d);
              const inMonth = d.startsWith(month);
              const alpha = v ? 0.12 + 0.55 * Math.min(1, Math.abs(v.r) / maxR) : 0;
              const bg = v ? (v.pnl >= 0 ? `rgba(27,175,122,${alpha})` : `rgba(227,73,72,${alpha})`) : undefined;
              const score = scores?.get(d);
              return (
                <div
                  key={d}
                  title={v ? `${fmtDate(d)} · ${signedUsd(v.pnl)} · ${rr(v.r)} · ${v.n} trade(s)` : fmtDate(d)}
                  className={cx(
                    "group relative flex aspect-[1.25] min-h-[52px] flex-col justify-between rounded-[10px] p-1.5 transition-transform hover:scale-[1.03] hover:shadow-[0_6px_16px_-8px_rgb(16_24_40/0.3)]",
                    inMonth ? "bg-ink/[0.06] shadow-[0_0_0_1px_var(--color-line)]" : "opacity-35",
                  )}
                  style={bg ? { background: bg } : undefined}
                >
                  <span className="flex items-center justify-between text-[10.5px] text-ink-2 num">
                    {parseDay(d).getDate()}
                    {score != null && <span className="rounded bg-fill px-1 text-[9.5px] font-semibold text-ink-2">{score}</span>}
                  </span>
                  {v && (
                    <span className="truncate text-[11px] font-semibold text-ink num">
                      <span className="hidden sm:inline">{signedUsd(v.pnl)}</span>
                      <span className="sm:hidden">{rr(v.r, 1)}</span>
                    </span>
                  )}
                </div>
              );
            }),
            <div key={`w-${w[0]}`} className="flex flex-col justify-center rounded-[10px] bg-ink/[0.03] p-1.5 text-[11px] num">
              {inWeek.length ? (
                <>
                  <span className={cx("font-semibold", wk.pnl >= 0 ? "text-good-ink" : "text-crit-ink")}>{signedUsd(wk.pnl)}</span>
                  <span className="text-ink-3">{rr(wk.r, 1)}</span>
                </>
              ) : (
                <span className="text-ink-4">—</span>
              )}
            </div>,
          ];
        })}
      </div>
    </div>
  );
}
