"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Check, ChevronRight, Trophy } from "lucide-react";
import { Card, cx } from "./ui";
import { setStage } from "@/app/actions";

const usd = (n: number) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

export function ChallengeControl({
  id, name, stage, profit, targetPct, size, tradingDays, minDays,
}: {
  id: number;
  name: string;
  stage: "phase1" | "phase2" | "funded" | "failed";
  profit: number;
  targetPct: number;
  size: number;
  tradingDays: number;
  minDays: number;
}) {
  const [pending, start] = useTransition();
  const target$ = (size * targetPct) / 100;
  const pct = Math.max(0, Math.min(100, (profit / target$) * 100));
  const remaining = Math.max(0, target$ - profit);
  const daysPct = Math.max(0, Math.min(100, (tradingDays / Math.max(1, minDays)) * 100));

  const stepLabel = stage === "phase1" ? "Step 1" : stage === "phase2" ? "Step 2" : stage === "funded" ? "Funded" : "Failed";
  const next =
    stage === "phase1" ? { to: "phase2" as const, label: "Mark Step 1 passed" }
      : stage === "phase2" ? { to: "funded" as const, label: "Mark Step 2 passed — funded" }
        : null;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Trophy className="size-4 text-accent-ink" /><h2 className="text-[15px] font-semibold">{name}</h2></div>
        <span className={cx("rounded-full px-2.5 py-1 text-[11.5px] font-semibold", stage === "funded" ? "bg-good-soft text-good-ink" : stage === "failed" ? "bg-crit-soft text-crit-ink" : "bg-accent-soft text-accent-ink")}>{stepLabel}</span>
      </div>

      {stage !== "funded" && stage !== "failed" ? (
        <>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <div className="eyebrow mb-1">Profit toward {targetPct}% target</div>
              <div className="num text-[30px] font-semibold tracking-[-0.03em]">{usd(profit)}<span className="ml-1.5 text-[14px] font-normal text-ink-3">/ {usd(target$)}</span></div>
            </div>
            <div className="text-right">
              <div className="num text-[20px] font-semibold text-accent-ink">{Math.round(pct)}%</div>
              <div className="text-[11.5px] text-ink-3">{usd(remaining)} to go</div>
            </div>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-ink/[0.06]">
            <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-ink transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-4 flex items-center justify-between text-[12.5px]">
            <span className="text-ink-3">Trading days</span>
            <span className="num font-semibold">{tradingDays} / {minDays} min</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/[0.06]"><div className="h-full rounded-full bg-ink/[0.04]" style={{ width: `${daysPct}%` }} /></div>

          {next && (
            <button onClick={() => start(() => setStage(id, next.to))} disabled={pending}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-[12px] bg-fill px-4 py-3 text-[14px] font-semibold text-fill-fg transition active:scale-[0.99] disabled:opacity-60">
              <Check className="size-4" /> {pending ? "Saving…" : next.label}
            </button>
          )}
          <p className="mt-2 text-center text-[11.5px] text-ink-4">Tap only after the firm confirms your pass.</p>
        </>
      ) : stage === "funded" ? (
        <div className="mt-4">
          <div className="flex items-center gap-2 rounded-[12px] bg-good-soft px-4 py-3 text-[13px] font-semibold text-good-ink"><Check className="size-4" /> Funded — you&apos;re cleared to build toward your first payout.</div>
          <Link href="/payouts" className="mt-3 flex w-full items-center justify-between rounded-[12px] bg-fill px-4 py-3 text-[14px] font-semibold text-fill-fg">Request a payout <ChevronRight className="size-4" /></Link>
        </div>
      ) : (
        <div className="mt-4 rounded-[12px] bg-crit-soft px-4 py-3 text-[13px] font-semibold text-crit-ink">This challenge ended. Re-buy from the Challenge page when ready.</div>
      )}
    </Card>
  );
}
