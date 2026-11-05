import { Check, Flag } from "lucide-react";
import type { Roadmap, Stage } from "@/lib/engine/roadmap";
import { cx } from "./ui";
import { fmtDate } from "@/lib/format";

/** Horizontal stage stepper, shared by the Roadmap and Today screens. */
export function RoadmapStepper({ roadmap: r, compact = false }: { roadmap: Roadmap; compact?: boolean }) {
  const main = r.stages.filter((x) => !x.parallel);
  return (
    <div className="-mx-2 overflow-x-auto px-2 pb-1">
      <ol className={cx("flex items-start", compact ? "min-w-[620px]" : "min-w-[760px]")}>
        {r.stages.map((st, i) => (
          <li key={st.id} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && <span className={cx("absolute top-[15px] right-1/2 h-[3px] w-full -translate-y-1/2 rounded-full", st.status === "done" || r.stages[i - 1].status === "done" ? "bg-good/70" : "bg-fill")} />}
            <span className={cx("relative z-10 grid size-[30px] place-items-center rounded-full text-[12px] font-semibold", dot(st, r.current))}>
              {st.status === "done" ? <Check className="size-4" /> : main.indexOf(st) + 1}
            </span>
            <span className={cx("mt-2 flex items-center gap-1 px-1 text-[12px] leading-4", st === r.current ? "font-semibold text-ink" : "text-ink-2")}>{st.deadline && <Flag className="size-3 text-warn-ink" />}{st.short}</span>
            <span className="num mt-0.5 text-[11px] text-ink-3">{st.doneAt ? `✓ ${fmtDate(st.doneAt)}` : fmtDate(st.end)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function dot(st: Stage, cur: Stage) {
  if (st.status === "done") return "bg-good text-fill-fg";
  if (st === cur) return "bg-fill text-fill-fg ring-4 ring-accent/25";
  if (st.deadline) return "bg-warn-soft text-warn-ink shadow-[0_0_0_1.5px_var(--color-warn)]";
  if (st.status === "late") return "bg-warn text-ink";
  return "bg-fill text-ink-3 shadow-[0_0_0_1px_var(--color-line-strong)]";
}
