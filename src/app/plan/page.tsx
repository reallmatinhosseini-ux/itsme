import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Flag, ArrowRight, Target, Clock } from "lucide-react";
import { loadMission } from "@/lib/data";
import { daysBetween } from "@/lib/engine/util";
import { Badge, Card, cx, PageHeader } from "@/components/ui";
import { PLAN, liveTarget } from "@/lib/growth-plan";
import { fmtDate, prob, usd } from "@/lib/format";

const d = (s: string | null | undefined) =>
  s ? fmtDate(s, { month: "short", day: "numeric", year: s.slice(0, 4) !== "2026" ? "numeric" : undefined }) : "—";

export default async function Plan() {
  const m = await loadMission();
  if (!m.settings.setupCompleted) redirect("/setup");
  const { roadmap: r, settings: s, wealth, clock, strategy } = m;
  const S = strategy.plan;
  const net = wealth.realizedNetWealth;
  const debt = wealth.debts.filter((x) => x.outstanding > 0)[0];

  // Main-path stages in order, each shown as a plain, numbered step.
  const steps = r.stages.filter((x) => !x.parallel);

  // The trader's own stated targets, tracked against real account + payout state where the app can see it.
  const acc = (size: number) => m.states.find((x) => x.isProp && x.account.size === size);
  const six = acc(6000), fifty = acc(50_000);
  const received = m.payouts.filter((p) => p.status === "received");
  const paidFrom = (size: number) => received.filter((p) => m.states.find((x) => x.account.id === p.accountId)?.account.size === size).length;
  const dl = S.deadlines;
  const target = liveTarget();
  const dd = (k: string, fallback: string) => (dl[k] ? d(dl[k]) : fallback);
  const myTargets: { t: string; when: string; detail: string; done: boolean }[] = [
    { t: "Pass $6K Step 1", when: dd("p1_0", "Nov 9"), detail: "+8% ($480), no rule breaks", done: !!six?.account.phase1PassedAt },
    { t: "Pass Step 2 — get funded", when: dd("p2_0", "Nov 13"), detail: "+5% ($300)", done: !!six?.account.phase2PassedAt },
    { t: `First ${usd(PLAN.weeklyPayout)} payout → live account`, when: dd("payout1_0", "Nov 18"), detail: "100% into your live account", done: paidFrom(6000) >= 1 },
    { t: `${PLAN.payoutCount} weekly ${usd(PLAN.weeklyPayout)} payouts`, when: "weeks 1–5", detail: `grow the live account ${PLAN.weeklyGrowthPct}%/week → ~${usd(target)}`, done: false },
    { t: `Dec 29 — clear ${usd(PLAN.debtPayoff)} debt, buy $50K`, when: "Dec 29", detail: "paid from the grown live account", done: (debt?.outstanding ?? 0) <= 0 },
    { t: "$50K: pass Phase 1", when: "2 weeks", detail: "+8% ($4,000)", done: !!fifty?.account.phase1PassedAt },
    { t: "$50K: pass Phase 2 — funded", when: "2 more weeks", detail: "+5% ($2,500)", done: !!fifty?.account.phase2PassedAt },
    { t: "Move $1,000/week into the live account", when: "1 week after funding", detail: `keep compounding ${PLAN.weeklyGrowthPct}%/week`, done: paidFrom(50_000) >= 1 },
  ];
  const hitTargets = myTargets.filter((x) => x.done).length;

  const tone = (status: string) =>
    status === "done" ? { ring: "bg-good text-fill-fg", pill: "good" as const, lab: "Done" }
      : status === "current" ? { ring: "bg-fill text-fill-fg", pill: "accent" as const, lab: "Now" }
      : status === "late" ? { ring: "bg-warn text-ink", pill: "warn" as const, lab: "Overdue" }
      : { ring: "bg-fill text-ink-3 shadow-[0_0_0_1px_var(--color-line-strong)]", pill: "dark" as const, lab: "Next" };

  return (
    <>
      <PageHeader title="The Plan" description="Your whole mission on one page — what to do, by when, and what to aim for. Plain and honest." />

      {/* The trader's own targets */}
      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <div className="eyebrow">Your targets</div>
          <span className="num text-[12px] text-ink-3">{hitTargets} / {myTargets.length} hit</span>
        </div>
        <p className="mt-1 mb-3 text-[12.5px] text-ink-3">The timeline you set. Items the app can see tick off automatically as you log passes and payouts.</p>
        <ol className="space-y-2">
          {myTargets.map((x, i) => (
            <li key={i} className="flex items-start gap-3 rounded-[12px] bg-ink/[0.03] px-3.5 py-2.5">
              <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold num", x.done ? "bg-good text-fill-fg" : "bg-ink/10 text-ink-3")}>
                {x.done ? <Check className="size-3" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={cx("text-[13.5px] font-semibold", x.done && "text-ink-2 line-through")}>{x.t}</span>
                  <span className="num text-[12px] font-medium text-accent-ink">{x.when}</span>
                </div>
                <div className="text-[12px] text-ink-3">{x.detail}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-3 rounded-[12px] bg-warn-soft/50 px-3.5 py-3 text-[12.5px] leading-5 text-warn-ink">
          <b>Built-in breathing room.</b> One week every month is a <b>cushion week</b> — losses are expected and the plan still holds. The {PLAN.weeklyGrowthPct}% weekly growth is the target on your winning weeks, not a promise every week. Never raise risk to &quot;catch up&quot; after a down week; that loses the account and the money.
        </div>
      </Card>

      {/* Snapshot */}
      <Card className="mb-4">
        <p className="text-[15px] leading-6 text-ink-2">
          Start from <b className="text-ink">$0</b>, trade FundedNext accounts, and build toward{" "}
          <b className="text-ink">{usd(s.targetAmount)}</b> by <b className="text-ink">{d(s.missionEnd)}</b> — clearing your{" "}
          <b className="text-ink">{usd(debt?.amount ?? 0)}</b> debt along the way.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-[14px] bg-ink/[0.03] p-3.5">
            <div className="eyebrow mb-1">Net worth now</div>
            <div className={cx("num text-[22px] font-semibold tracking-[-0.02em]", net < 0 && "text-crit-ink")}>{usd(net)}</div>
          </div>
          <div className="rounded-[14px] bg-ink/[0.03] p-3.5">
            <div className="eyebrow mb-1">Goal</div>
            <div className="num text-[22px] font-semibold tracking-[-0.02em]">{usd(s.targetAmount)}</div>
          </div>
          <div className="rounded-[14px] bg-ink/[0.03] p-3.5">
            <div className="eyebrow mb-1">Days left</div>
            <div className="num text-[22px] font-semibold tracking-[-0.02em]">{clock.remainingDays}</div>
          </div>
        </div>
      </Card>

      {/* The hard deadline */}
      {debt && (
        <Card className="mb-4 border-warn/40 bg-warn-soft/40">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-warn text-fill-fg"><Flag className="size-4" /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[16px] font-semibold">{usd(debt.amount)} debt — due {d(debt.dueDate)}</h2>
                <Badge tone="warn">Hard date</Badge>
              </div>
              <p className="mt-1.5 text-[13.5px] leading-5 text-ink-2">
                This is cleared in <b className="text-ink">one payment on {d(PLAN.deadline)}</b>, from the grown live account — not chipped away weekly.
                The {PLAN.payoutCount} weekly {usd(PLAN.weeklyPayout)} payouts compound to about <b className="text-ink">{usd(target)}</b> by the deadline,
                which covers the {usd(PLAN.debtPayoff)} debt payment with room for the $50K challenge. Hit the weekly growth and the date holds.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* The steps */}
      <Card className="mb-4">
        <div className="eyebrow mb-4">Step by step</div>
        <ol className="relative">
          {steps.map((st, i) => {
            const t = tone(st.status);
            const target = st.needs[0];
            return (
              <li key={st.id} className="relative pl-14">
                {i < steps.length - 1 && <span className={cx("absolute top-11 bottom-0 left-[21px] w-[2px]", st.status === "done" ? "bg-good/40" : "bg-fill")} />}
                <span className={cx("absolute left-0 top-1 grid size-11 place-items-center rounded-full text-[15px] font-semibold num", t.ring)}>
                  {st.status === "done" ? <Check className="size-5" /> : i + 1}
                </span>
                <div className="pb-7">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <h3 className="text-[16px] font-semibold tracking-[-0.01em]">{st.title}</h3>
                    <Badge tone={t.pill}>{t.lab}</Badge>
                    {!st.doneAt && <span className="num inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-ink"><Clock className="size-3" />by {d(st.end)}</span>}
                  </div>
                  <p className="mt-1 text-[13.5px] leading-5 text-ink-2">{st.why}</p>
                  {target && (
                    <div className="mt-2 inline-flex items-start gap-1.5 rounded-[10px] bg-accent-soft px-2.5 py-1.5 text-[12.5px] font-medium text-accent-ink">
                      <Target className="mt-px size-3.5 shrink-0" />{target}
                    </div>
                  )}
                  {st.tasks.length > 0 && (
                    <ul className="mt-2.5 space-y-1">
                      {st.tasks.map((task) => (
                        <li key={task.label} className="flex items-start gap-2 text-[12.5px] text-ink-2">
                          <span className={cx("mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-[4px]", task.done ? "bg-good text-fill-fg" : "bg-ink/10")}>
                            {task.done && <Check className="size-2.5" />}
                          </span>
                          {task.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {/* Honest outcome */}
      <Card className="mb-4">
        <div className="eyebrow mb-3">What this honestly gets you</div>
        <p className="text-[14px] leading-6 text-ink-2">
          If you trade it well, the <b className="text-ink">most likely</b> finish on {d(s.missionEnd)} is about{" "}
          <b className="text-ink num">{usd(S.finalNetP50)}</b> net worth, with the debt cleared by{" "}
          <b className="text-ink">{d(S.debtFree?.p50)}</b> and roughly <b className="text-ink num">{usd(S.personalP50)}</b> in your own trading account — starting from nothing.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { q: "Reach $10,000", v: prob(S.pTarget(10_000)) },
            { q: "Reach $25,000", v: prob(S.pTarget(25_000)) },
            { q: `Reach ${usd(s.targetAmount)}`, v: prob(S.pTarget(s.targetAmount)) },
            { q: "Typical net worth", v: usd(S.finalNetP50) },
          ].map((x) => (
            <div key={x.q} className="rounded-[14px] bg-ink/[0.03] p-3.5">
              <div className="text-[11.5px] text-ink-3">{x.q}</div>
              <div className="num mt-1 text-[19px] font-semibold tracking-[-0.02em]">{x.v}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] leading-[18px] text-ink-3">
          The full {usd(s.targetAmount)} in six months from $0 is the stretch — the upside, not the expectation. The numbers above come from {s.simulation.paths.toLocaleString()} simulated runs at about {s.plan.avgRiskPct}% risk per trade. Most people who buy a prop challenge never get paid; staying disciplined is the whole edge.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-[11px] bg-fill px-3.5 py-2 text-[13px] font-semibold text-fill-fg">Full roadmap & money <ArrowRight className="size-3.5" /></Link>
          <Link href="/debt" className="inline-flex items-center gap-1.5 rounded-[11px] border border-line px-3.5 py-2 text-[13px] font-semibold text-ink">Debt tracker</Link>
        </div>
      </Card>
    </>
  );
}
