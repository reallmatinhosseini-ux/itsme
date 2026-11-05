import type { DailyLog, Trade } from "@/db/schema";
import { HOT_EMOTIONS, type Settings } from "../settings";
import type { AccountState } from "./accounts";
import type { ClosedTrade } from "./stats";
import { addDays, dayKey, median, meanCI, sum, weekKey } from "./util";

export type Level = "critical" | "warning" | "info";
export interface RiskAlert {
  level: Level;
  code: string;
  title: string;
  detail: string;
}

/** Group trades on different accounts that are really the same idea (same instrument & side within 5 minutes). */
export function ideaKey(t: Trade): string {
  const ts = new Date(t.openedAt).getTime();
  return `${t.instrument}|${t.direction}|${Math.floor(ts / 300_000)}`;
}

export function tradeRiskPct(t: Trade, sizeOf: (id: number) => number): number {
  const base = sizeOf(t.accountId);
  return base > 0 ? (t.riskAmount / base) * 100 : 0;
}

export interface Exposure {
  openRisk: number;
  openPositions: number;
  ideas: number;
  byAccount: { name: string; risk: number; pct: number; limitPct: number }[];
  byCurrency: { ccy: string; net: number; gross: number }[];
  correlatedGroups: { ccy: string; trades: string[]; risk: number }[];
  todayRealized: number;
  todayWorstCase: number;
}

const INDEX_CCY: Record<string, string> = { US30: "USD-EQ", NAS100: "USD-EQ", US100: "USD-EQ", SPX500: "USD-EQ", US500: "USD-EQ", GER40: "EUR-EQ", DE40: "EUR-EQ", UK100: "GBP-EQ", JP225: "JPY-EQ" };

/** Decompose an instrument into the currency/asset legs it is long or short. */
export function legs(instrument: string, direction: "buy" | "sell"): { ccy: string; sign: number }[] {
  const s = instrument.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const dir = direction === "buy" ? 1 : -1;
  if (INDEX_CCY[s]) return [{ ccy: INDEX_CCY[s], sign: dir }];
  if (/^[A-Z]{6}$/.test(s)) return [{ ccy: s.slice(0, 3), sign: dir }, { ccy: s.slice(3), sign: -dir }];
  if (/^(XAU|XAG|BTC|ETH)[A-Z]{3}$/.test(s)) return [{ ccy: s.slice(0, 3), sign: dir }, { ccy: s.slice(3), sign: -dir }];
  return [{ ccy: s, sign: dir }];
}

export function exposure(states: AccountState[], today: string): Exposure {
  const open = states.flatMap((s) => s.openTrades.map((t) => ({ t, s })));
  const byCcy = new Map<string, { net: number; gross: number; trades: Set<string>; risk: number }>();
  for (const { t, s } of open) {
    for (const leg of legs(t.instrument, t.direction)) {
      const row = byCcy.get(leg.ccy) ?? { net: 0, gross: 0, trades: new Set(), risk: 0 };
      row.net += leg.sign * t.riskAmount;
      row.gross += t.riskAmount;
      row.trades.add(`${t.instrument} ${t.direction} · ${s.account.name}`);
      row.risk += t.riskAmount;
      byCcy.set(leg.ccy, row);
    }
  }
  const todayRealized = sum(states.map((s) => s.todayPnl));
  const openRisk = sum(open.map((o) => o.t.riskAmount));
  return {
    openRisk,
    openPositions: open.length,
    ideas: new Set(open.map((o) => ideaKey(o.t))).size,
    byAccount: states
      .filter((s) => s.openTrades.length)
      .map((s) => ({ name: s.account.name, risk: s.openRisk, pct: s.openRiskPct, limitPct: s.isProp ? s.account.maxOpenRiskPct : 0 })),
    byCurrency: [...byCcy.entries()].map(([ccy, v]) => ({ ccy, net: v.net, gross: v.gross })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
    correlatedGroups: [...byCcy.entries()]
      .filter(([, v]) => v.trades.size >= 2 && Math.abs(v.net) >= v.gross * 0.75)
      .map(([ccy, v]) => ({ ccy, trades: [...v.trades], risk: v.risk })),
    todayRealized,
    todayWorstCase: todayRealized - openRisk,
  };
}

interface RiskInput {
  settings: Settings;
  states: AccountState[];
  trades: Trade[];
  closed: ClosedTrade[];
  logs: DailyLog[];
  today: string;
  modelExpectancyR: number;
}

export function riskAlerts({ settings, states, trades, closed, logs, today, modelExpectancyR }: RiskInput): RiskAlert[] {
  const out: RiskAlert[] = [];
  const R = settings.risk;
  const live = states.filter((s) => !s.account.archived && s.account.stage !== "failed");
  const sizeOf = (id: number) => {
    const s = states.find((x) => x.account.id === id);
    return s ? (s.isProp ? s.account.size : Math.max(1, s.peakBalance)) : 0;
  };

  for (const s of live) {
    for (const b of s.breaches) out.push({ level: "critical", code: "breach", title: `${s.account.name}: rule breach`, detail: b });
    if (s.isProp && s.drawdownUsedPct >= R.drawdownWarnPct)
      out.push({
        level: s.drawdownUsedPct >= 85 ? "critical" : "warning",
        code: "max-dd",
        title: `${s.account.name}: ${s.drawdownUsedPct.toFixed(0)}% of max loss used`,
        detail: `Balance $${s.balance.toFixed(0)} vs hard floor $${s.maxLossFloor.toFixed(0)}. Cut risk per trade until you recover; do not size up to "win it back".`,
      });
    if (s.dailyLossUsedPct >= R.drawdownWarnPct)
      out.push({
        level: s.dailyLossUsedPct >= 85 ? "critical" : "warning",
        code: "daily-dd",
        title: `${s.account.name}: ${s.dailyLossUsedPct.toFixed(0)}% of daily loss limit used`,
        detail: `Today's realised P/L $${s.todayPnl.toFixed(0)} against a $${s.dailyLossLimit.toFixed(0)} limit. Open risk $${s.openRisk.toFixed(0)} could take you further.`,
      });
    const base = s.isProp ? s.account.size : Math.max(1, s.peakBalance);
    if (s.todayPnl <= -(base * R.maxDailyLossPct) / 100)
      out.push({ level: "critical", code: "personal-stop", title: `Daily stop reached on ${s.account.name}`, detail: `You are down ${((-s.todayPnl / base) * 100).toFixed(2)}% today — your own limit is ${R.maxDailyLossPct}%. Stop trading for the day.` });
  }

  // Weekly loss across each account.
  const wk = weekKey(today);
  for (const s of live) {
    const base = s.isProp ? s.account.size : Math.max(1, s.peakBalance);
    const weekPnl = sum(closed.filter((t) => t.accountId === s.account.id && weekKey(t.day) === wk).map((t) => t.pnl));
    if (weekPnl <= -(base * R.maxWeeklyLossPct) / 100)
      out.push({ level: "warning", code: "weekly", title: `Weekly loss limit reached on ${s.account.name}`, detail: `Down $${(-weekPnl).toFixed(0)} this week (limit ${R.maxWeeklyLossPct}%). Stand down until next week and review.` });
  }

  // Overtrading: unique ideas opened today.
  const todays = trades.filter((t) => dayKey(t.openedAt) === today);
  const ideasToday = new Set(todays.map(ideaKey)).size;
  if (ideasToday > R.maxTradesPerDay)
    out.push({ level: "warning", code: "overtrading", title: `${ideasToday} trade ideas today`, detail: `Your limit is ${R.maxTradesPerDay}. Additional trades beyond plan historically carry lower quality — check the analytics for your own evidence.` });
  else if (ideasToday === R.maxTradesPerDay)
    out.push({ level: "info", code: "trade-cap", title: "Trade limit reached for today", detail: `${ideasToday}/${R.maxTradesPerDay} ideas taken. Done for the day.` });

  // Consecutive losses.
  let streak = 0;
  for (let i = closed.length - 1; i >= 0 && closed[i].pnl < 0; i--) streak++;
  if (streak >= R.maxConsecutiveLosses)
    out.push({ level: "warning", code: "streak", title: `${streak} losses in a row`, detail: `Your rule is to pause after ${R.maxConsecutiveLosses}. Take a break, re-read your plan, and reduce size on the next trade — never increase it.` });

  // Risk escalation after losses.
  const recent = closed.slice(-40);
  let escalations = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1].pnl >= 0) continue;
    const prior = recent.slice(0, i).map((t) => tradeRiskPct(t, sizeOf));
    const med = median(prior);
    if (med > 0 && tradeRiskPct(recent[i], sizeOf) > med * R.riskEscalationFactor) escalations++;
  }
  if (escalations > 0)
    out.push({ level: escalations >= 3 ? "warning" : "info", code: "escalation", title: `Risk increased after a loss ${escalations}× recently`, detail: `In your last ${recent.length} trades, ${escalations} trade(s) following a loss risked more than ${R.riskEscalationFactor}× your median risk. This is the classic precursor to a blown account.` });

  // Oversized trades.
  const lastWeek = addDays(today, -7);
  const recentAll = trades.filter((t) => dayKey(t.openedAt) > lastWeek);
  const oversized = recentAll.filter((t) => tradeRiskPct(t, sizeOf) > R.maxRiskPerTradePct * 1.05);
  if (oversized.length)
    out.push({ level: "warning", code: "oversize", title: `${oversized.length} trade(s) above ${R.maxRiskPerTradePct}% risk this week`, detail: oversized.slice(0, 3).map((t) => `${t.instrument} ${tradeRiskPct(t, sizeOf).toFixed(2)}%`).join(", ") });

  // Emotional / revenge patterns.
  const hot = recentAll.filter((t) => t.emotion && HOT_EMOTIONS.has(t.emotion));
  if (hot.length)
    out.push({ level: hot.length >= 3 ? "warning" : "info", code: "emotion", title: `${hot.length} trade(s) logged in a high-risk emotional state this week`, detail: `Self-reported: ${[...new Set(hot.map((t) => t.emotion))].join(", ")}. Compare their results in AI Insights before deciding anything.` });
  const sorted = [...trades].filter((t) => t.closedAt).sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  let revenge = 0;
  for (const t of trades.filter((x) => dayKey(x.openedAt) > lastWeek)) {
    const prevLoss = sorted.find((p) => p.id !== t.id && (p.pnl ?? 0) < 0 && p.closedAt! <= t.openedAt && new Date(t.openedAt).getTime() - new Date(p.closedAt!).getTime() < 15 * 60_000);
    if (prevLoss) revenge++;
  }
  if (revenge)
    out.push({ level: "warning", code: "revenge", title: `${revenge} trade(s) opened within 15 min of a loss`, detail: "Fast re-entries after a loss are a revenge-trading signature. Enforce a cooling-off period." });

  // Session discipline.
  const offSession = recentAll.filter((t) => t.session && !R.allowedSessions.includes(t.session));
  if (offSession.length)
    out.push({ level: "info", code: "session", title: `${offSession.length} trade(s) outside planned sessions this week`, detail: `Planned: ${R.allowedSessions.join(", ")}.` });

  // Checklist discipline.
  const unchecked = recentAll.filter((t) => !checklistComplete(t));
  if (R.requireChecklist && unchecked.length)
    out.push({ level: "info", code: "checklist", title: `${unchecked.length} trade(s) without a completed pre-trade checklist`, detail: "Process data is what lets the system tell luck from skill." });

  // Plan for today.
  const log = logs.find((l) => l.date === today);
  if (todays.length && !log?.planCompletedAt)
    out.push({ level: "info", code: "no-plan", title: "Trading today without a completed daily plan", detail: "Fill in the Daily Planner before the next trade." });

  // Firm-specific conduct rules.
  for (const s of live.filter((x) => x.isProp)) {
    const own = closed.filter((t) => t.accountId === s.account.id && t.closedAt);
    const quick = own.filter((t) => new Date(t.closedAt!).getTime() - new Date(t.openedAt).getTime() <= 30_000 && t.pnl > 0);
    const profit = sum(own.filter((t) => t.pnl > 0).map((t) => t.pnl));
    if (quick.length && profit > 0 && sum(quick.map((t) => t.pnl)) / profit >= 0.25)
      out.push({ level: "warning", code: "quick-strike", title: `${s.account.name}: Quick Strike share near limit`, detail: `Profit from trades held ≤30s is ${((sum(quick.map((t) => t.pnl)) / profit) * 100).toFixed(0)}% (FundedNext limit 30%).` });
  }
  const propIds = new Set(live.filter((s) => s.isProp && s.account.stage === "funded").map((s) => s.account.id));
  const mirrored = new Map<string, Set<number>>();
  for (const t of recentAll) {
    if (!propIds.has(t.accountId)) continue;
    const k = ideaKey(t);
    mirrored.set(k, (mirrored.get(k) ?? new Set()).add(t.accountId));
  }
  const mirrorCount = [...mirrored.values()].filter((v) => v.size > 1).length;
  if (mirrorCount)
    out.push({ level: "warning", code: "copy", title: "Identical trades on multiple funded accounts", detail: `${mirrorCount} idea(s) were placed on more than one funded account. FundedNext prohibits copy trading involving FundedNext accounts — verify this is permitted before continuing, and remember these are one bet, not two.` });

  // Model deviation.
  if (closed.length >= 20) {
    const [lo, hi] = meanCI(closed.map((t) => t.r));
    if (hi < modelExpectancyR)
      out.push({ level: "warning", code: "model", title: "Performance is below the base-case model", detail: `Your expectancy 95% CI is ${lo.toFixed(2)}R to ${hi.toFixed(2)}R, entirely below the base assumption of ${modelExpectancyR.toFixed(2)}R. Projections using the base case are too optimistic.` });
    else if (lo > modelExpectancyR)
      out.push({ level: "info", code: "model", title: "Performance is above the base-case model", detail: `Expectancy CI ${lo.toFixed(2)}R–${hi.toFixed(2)}R sits above ${modelExpectancyR.toFixed(2)}R. Don't raise risk because of it — let the extra edge compound.` });
  }

  const order: Record<Level, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

export function checklistComplete(t: Trade): boolean {
  try {
    const c = JSON.parse(t.checklist) as Record<string, boolean>;
    const vals = Object.values(c);
    return vals.length > 0 && vals.every(Boolean);
  } catch {
    return false;
  }
}

/** Process-quality score for one day (0-100). Profitability is deliberately not a component. */
export function dailyScore(day: string, trades: Trade[], log: DailyLog | undefined, settings: Settings, sizeOf: (id: number) => number) {
  const ts = trades.filter((t) => dayKey(t.openedAt) === day);
  const parts: { label: string; weight: number; earned: number; note: string }[] = [];
  const firstTrade = ts.map((t) => t.openedAt).sort()[0];
  const planned = !!log?.planCompletedAt && (!firstTrade || log.planCompletedAt <= firstTrade);
  parts.push({ label: "Plan before trading", weight: 15, earned: planned ? 15 : 0, note: planned ? "Plan completed" : "No plan logged" });
  if (ts.length) {
    const checked = ts.filter(checklistComplete).length;
    parts.push({ label: "Pre-trade checklist", weight: 20, earned: (20 * checked) / ts.length, note: `${checked}/${ts.length} trades` });
    const ideas = new Set(ts.map(ideaKey)).size;
    parts.push({ label: "Trade count", weight: 10, earned: ideas <= settings.risk.maxTradesPerDay ? 10 : 0, note: `${ideas}/${settings.risk.maxTradesPerDay} ideas` });
    const inRisk = ts.filter((t) => tradeRiskPct(t, sizeOf) <= settings.risk.maxRiskPerTradePct * 1.05).length;
    parts.push({ label: "Risk within limit", weight: 15, earned: (15 * inRisk) / ts.length, note: `${inRisk}/${ts.length} trades` });
    const inSession = ts.filter((t) => !t.session || settings.risk.allowedSessions.includes(t.session)).length;
    parts.push({ label: "Planned sessions", weight: 10, earned: (10 * inSession) / ts.length, note: `${inSession}/${ts.length} trades` });
    const followed = ts.filter((t) => t.followedPlan !== false).length;
    parts.push({ label: "Followed plan", weight: 10, earned: (10 * followed) / ts.length, note: `${followed}/${ts.length} trades` });
    const mistakeCount = sum(ts.map((t) => (JSON.parse(t.mistakes) as string[]).length));
    const hot = ts.filter((t) => t.emotion && HOT_EMOTIONS.has(t.emotion)).length;
    parts.push({ label: "Clean execution", weight: 10, earned: Math.max(0, 10 - mistakeCount * 3 - hot * 2), note: `${mistakeCount} mistake tag(s), ${hot} hot-state trade(s)` });
  }
  const reviewed = !!log?.reviewCompletedAt;
  parts.push({ label: "Post-session review", weight: 10, earned: reviewed ? 10 : 0, note: reviewed ? "Reviewed" : "Not reviewed" });
  const total = sum(parts.map((p) => p.weight));
  const earned = sum(parts.map((p) => p.earned));
  return { day, score: total ? Math.round((earned / total) * 100) : 0, parts, trades: ts.length };
}
