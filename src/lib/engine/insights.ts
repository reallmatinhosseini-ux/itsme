import { HOT_EMOTIONS } from "../settings";
import { groupStats, tradeStats, type ClosedTrade, type GroupRow } from "./stats";
import { dayKey, mean, meanCI, sum, welch, weekKey, monthKey, addDays } from "./util";

/**
 * Evidence-graded findings. Every finding states its sample size and whether the
 * difference clears a basic significance bar; nothing here is a psychological diagnosis.
 */
export type Strength = "significant" | "suggestive" | "anecdotal";
export interface Finding {
  kind: "mistake" | "behaviour" | "deterioration" | "overtrading" | "emotion" | "strategy" | "expectancy" | "plan";
  tone: "positive" | "negative" | "neutral";
  title: string;
  detail: string;
  n: number;
  strength: Strength;
}

const grade = (n: number, p: number | null): Strength => (p != null && p < 0.05 && n >= 20 ? "significant" : n >= 10 && (p == null || p < 0.2) ? "suggestive" : "anecdotal");

function compare(label: string, a: ClosedTrade[], b: ClosedTrade[]) {
  const w = welch(a.map((t) => t.r), b.map((t) => t.r));
  return { label, aR: mean(a.map((t) => t.r)), bR: mean(b.map((t) => t.r)), p: w?.p ?? null, n: a.length + b.length };
}

const mistakesOf = (t: ClosedTrade): string[] => {
  try {
    return JSON.parse(t.mistakes);
  } catch {
    return [];
  }
};

export function findings(closed: ClosedTrade[], maxTradesPerDay: number): Finding[] {
  const out: Finding[] = [];
  if (closed.length < 5) return out;

  // Recurring mistakes and their cost in R.
  const tagMap = new Map<string, ClosedTrade[]>();
  for (const t of closed) for (const m of mistakesOf(t)) tagMap.set(m, [...(tagMap.get(m) ?? []), t]);
  const clean = closed.filter((t) => mistakesOf(t).length === 0);
  for (const [tag, ts] of [...tagMap.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4)) {
    const c = compare(tag, ts, clean);
    out.push({
      kind: "mistake",
      tone: "negative",
      title: `"${tag}" — ${ts.length} occurrence${ts.length > 1 ? "s" : ""}, ${sum(ts.map((t) => t.r)).toFixed(1)}R total`,
      detail: `Tagged trades average ${c.aR.toFixed(2)}R vs ${c.bR.toFixed(2)}R on clean trades${c.p != null ? ` (p≈${c.p.toFixed(2)})` : ""}.`,
      n: c.n,
      strength: grade(c.n, c.p),
    });
  }

  // Emotional state.
  const hot = closed.filter((t) => t.emotion && HOT_EMOTIONS.has(t.emotion));
  const calm = closed.filter((t) => t.emotion && !HOT_EMOTIONS.has(t.emotion));
  if (hot.length >= 3 && calm.length >= 3) {
    const c = compare("emotion", hot, calm);
    out.push({
      kind: "emotion",
      tone: c.aR < c.bR ? "negative" : "neutral",
      title: `Trades in self-reported high-risk states: ${c.aR.toFixed(2)}R vs ${c.bR.toFixed(2)}R`,
      detail: `${hot.length} trades logged as ${[...new Set(hot.map((t) => t.emotion))].join("/")} vs ${calm.length} in calm states. This compares your own labels; it is not a diagnosis.`,
      n: c.n,
      strength: grade(c.n, c.p),
    });
  }

  // Overtrading: trades beyond the daily limit vs within it.
  const byDay = new Map<string, ClosedTrade[]>();
  for (const t of [...closed].sort((a, b) => a.openedAt.localeCompare(b.openedAt))) byDay.set(dayKey(t.openedAt), [...(byDay.get(dayKey(t.openedAt)) ?? []), t]);
  const within: ClosedTrade[] = [], beyond: ClosedTrade[] = [];
  for (const ts of byDay.values()) ts.forEach((t, i) => (i < maxTradesPerDay ? within : beyond).push(t));
  if (beyond.length >= 3) {
    const c = compare("overtrading", beyond, within);
    out.push({
      kind: "overtrading",
      tone: c.aR < c.bR ? "negative" : "neutral",
      title: `Trades beyond #${maxTradesPerDay} of the day: ${c.aR.toFixed(2)}R vs ${c.bR.toFixed(2)}R`,
      detail: `${beyond.length} trades exceeded your daily limit.`,
      n: c.n,
      strength: grade(c.n, c.p),
    });
  }

  // Strategy / setup edge.
  for (const g of groupStats(closed, (t) => t.setup).filter((g) => g.n >= 5)) {
    if (g.avgR < 0 || g.significant)
      out.push({
        kind: "strategy",
        tone: g.avgR >= 0 ? "positive" : "negative",
        title: `Setup "${g.key}": ${g.avgR.toFixed(2)}R over ${g.n} trades`,
        detail: `95% CI ${ciText(g.ci)}; win rate ${(g.winRate * 100).toFixed(0)}%.`,
        n: g.n,
        strength: g.significant ? "significant" : g.n >= 10 ? "suggestive" : "anecdotal",
      });
  }

  // Expectancy drift: last 20 vs previous 20.
  if (closed.length >= 30) {
    const last = closed.slice(-20);
    const prev = closed.slice(-40, -20);
    const c = compare("drift", last, prev);
    const delta = c.aR - c.bR;
    if (Math.abs(delta) >= 0.15)
      out.push({
        kind: delta < 0 ? "deterioration" : "expectancy",
        tone: delta < 0 ? "negative" : "positive",
        title: `Expectancy ${delta < 0 ? "fell" : "rose"} from ${c.bR.toFixed(2)}R to ${c.aR.toFixed(2)}R (last 20 trades)`,
        detail: c.p != null && c.p < 0.05 ? "The change is statistically significant." : `Not statistically significant yet (p≈${c.p?.toFixed(2) ?? "n/a"}) — could be normal variance.`,
        n: c.n,
        strength: grade(c.n, c.p),
      });
  }

  // Behaviour drift: risk size and frequency, last 14 days vs prior 14.
  const lastDay = closed[closed.length - 1].day;
  const cut = addDays(lastDay, -14), cut2 = addDays(lastDay, -28);
  const recent = closed.filter((t) => t.day > cut), prior = closed.filter((t) => t.day > cut2 && t.day <= cut);
  if (recent.length >= 5 && prior.length >= 5) {
    const rr = mean(recent.map((t) => t.riskAmount)), pr = mean(prior.map((t) => t.riskAmount));
    if (pr > 0 && Math.abs(rr / pr - 1) >= 0.2)
      out.push({ kind: "behaviour", tone: rr > pr ? "negative" : "neutral", title: `Average risk per trade ${rr > pr ? "up" : "down"} ${Math.abs((rr / pr - 1) * 100).toFixed(0)}% vs the prior two weeks`, detail: `$${pr.toFixed(0)} → $${rr.toFixed(0)}. Make sure this was a planned decision.`, n: recent.length + prior.length, strength: "suggestive" });
    if (Math.abs(recent.length / prior.length - 1) >= 0.4)
      out.push({ kind: "behaviour", tone: "neutral", title: `Trade frequency ${recent.length > prior.length ? "up" : "down"}: ${prior.length} → ${recent.length} trades per two weeks`, detail: "Frequency shifts often precede changes in quality. Check whether the extra trades meet your setup criteria.", n: recent.length + prior.length, strength: "suggestive" });
  }

  // Plan vs execution: realised R vs planned R where a target was set.
  const planned = closed.filter((t) => t.stop != null && t.takeProfit != null && t.entry !== t.stop);
  if (planned.length >= 5) {
    const plannedR = planned.map((t) => Math.abs((t.takeProfit! - t.entry) / (t.entry - t.stop!)));
    const winners = planned.filter((t) => t.r > 0);
    const capture = winners.length ? mean(winners.map((t) => t.r / Math.abs((t.takeProfit! - t.entry) / (t.entry - t.stop!)))) : null;
    out.push({
      kind: "plan",
      tone: capture != null && capture < 0.7 ? "negative" : "neutral",
      title: `Planned ${mean(plannedR).toFixed(2)}R per trade; winners captured ${capture != null ? (capture * 100).toFixed(0) + "%" : "n/a"} of plan`,
      detail: capture != null && capture < 0.7 ? "Winners are being cut well before target. Review early exits against your rules." : "Execution is broadly in line with planned targets.",
      n: planned.length,
      strength: planned.length >= 20 ? "suggestive" : "anecdotal",
    });
    const deviated = closed.filter((t) => t.followedPlan === false);
    const followed = closed.filter((t) => t.followedPlan === true);
    if (deviated.length >= 3 && followed.length >= 3) {
      const c = compare("plan", deviated, followed);
      out.push({ kind: "plan", tone: c.aR < c.bR ? "negative" : "neutral", title: `Off-plan trades: ${c.aR.toFixed(2)}R vs on-plan ${c.bR.toFixed(2)}R`, detail: `${deviated.length} trades were marked as not following the plan.`, n: c.n, strength: grade(c.n, c.p) });
    }
  }

  const rank: Record<Strength, number> = { significant: 0, suggestive: 1, anecdotal: 2 };
  return out.sort((a, b) => rank[a.strength] - rank[b.strength] || b.n - a.n);
}

const ciText = (ci: [number, number]) => (Number.isFinite(ci[0]) ? `${ci[0].toFixed(2)}R to ${ci[1].toFixed(2)}R` : "n/a");

export interface PeriodReport {
  period: "week" | "month";
  key: string;
  label: string;
  n: number;
  netPnl: number;
  totalR: number;
  winRate: number;
  avgScore: number | null;
  wentWell: string[];
  wentWrong: string[];
  significant: string[];
  change: string[];
  keep: string[];
  onTrack: string;
}

export function periodReport(
  period: "week" | "month",
  key: string,
  all: ClosedTrade[],
  scores: { day: string; score: number; trades: number }[],
  onTrack: string,
  maxTradesPerDay: number,
): PeriodReport {
  const fn = period === "week" ? weekKey : monthKey;
  const ts = all.filter((t) => fn(t.day) === key);
  const s = tradeStats(ts);
  const periodScores = scores.filter((x) => fn(x.day) === key && x.trades > 0);
  const avgScore = periodScores.length ? mean(periodScores.map((x) => x.score)) : null;
  const toLine = (g: GroupRow, what: string) => `${what} "${g.key}": ${g.totalR >= 0 ? "+" : ""}${g.totalR.toFixed(1)}R over ${g.n} trade(s)`;

  const setups = groupStats(ts, (t) => t.setup);
  const sessions = groupStats(ts, (t) => t.session);
  const wentWell: string[] = [];
  const wentWrong: string[] = [];
  if (!ts.length) wentWell.push("No closed trades in this period.");
  setups.filter((g) => g.totalR > 0).slice(0, 2).forEach((g) => wentWell.push(toLine(g, "Setup")));
  sessions.filter((g) => g.totalR > 0).slice(0, 1).forEach((g) => wentWell.push(toLine(g, "Session")));
  if (avgScore != null && avgScore >= 80) wentWell.push(`Execution score averaged ${avgScore.toFixed(0)} — process discipline held.`);
  if (s.maxConsecLosses <= 2 && ts.length >= 5) wentWell.push("No loss streak longer than two trades.");

  setups.filter((g) => g.totalR < 0).slice(-2).forEach((g) => wentWrong.push(toLine(g, "Setup")));
  const tagCounts = new Map<string, { n: number; r: number }>();
  for (const t of ts) for (const m of mistakesOf(t)) {
    const c = tagCounts.get(m) ?? { n: 0, r: 0 };
    tagCounts.set(m, { n: c.n + 1, r: c.r + t.r });
  }
  [...tagCounts.entries()].sort((a, b) => a[1].r - b[1].r).slice(0, 3).forEach(([m, c]) => wentWrong.push(`Mistake "${m}" ×${c.n} (${c.r.toFixed(1)}R)`));
  if (avgScore != null && avgScore < 70) wentWrong.push(`Execution score averaged ${avgScore.toFixed(0)} — below the 70 scaling threshold.`);

  // Significance is judged on all data to date — one period alone is almost never enough.
  const f = findings(all.filter((t) => fn(t.day) <= key), maxTradesPerDay);
  const significant = f.filter((x) => x.strength === "significant").map((x) => x.title);
  if (!significant.length) significant.push(`Nothing is statistically significant yet (${all.filter((t) => fn(t.day) <= key).length} trades to date). Treat period results as noise until the sample grows.`);

  const change = f.filter((x) => x.tone === "negative" && x.strength !== "anecdotal").slice(0, 3).map((x) => x.title);
  if (!change.length) change.push("No evidence-backed change is indicated. Avoid changing the strategy based on a single period.");
  const keep = f.filter((x) => x.tone === "positive" && x.strength !== "anecdotal").map((x) => x.title);
  keep.push("Fixed risk per trade and the daily stop — these are what keep the mission alive.");

  return {
    period,
    key,
    label: period === "week" ? `Week of ${key}` : new Date(key + "-01T00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    n: s.n,
    netPnl: s.netPnl,
    totalR: sum(ts.map((t) => t.r)),
    winRate: s.winRate,
    avgScore,
    wentWell: wentWell.length ? wentWell : ["Nothing stood out positively — that's fine for a small sample."],
    wentWrong: wentWrong.length ? wentWrong : ["No recurring problems logged."],
    significant,
    change,
    keep,
    onTrack,
  };
}

export { meanCI };
