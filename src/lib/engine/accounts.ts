import type { Account, BalanceEvent, LedgerEntry, Payout, Trade } from "@/db/schema";
import type { Settings } from "../settings";
import { dayKey, sum } from "./util";

export interface PayoutCheck {
  eligible: boolean;
  checks: { label: string; ok: boolean; detail: string }[];
  cycleProfit: number;
  traderShare: number;
  feeRefundDue: number;
}

export interface AccountState {
  account: Account;
  isProp: boolean;
  startBalance: number;
  balance: number;
  profit: number;
  profitPct: number;
  targetPct: number | null;
  targetProgress: number | null;
  tradingDays: number;
  minDaysMet: boolean;
  todayPnl: number;
  dailyLossLimit: number;
  dailyLossUsedPct: number;
  maxLossFloor: number;
  /** Share of the max-loss allowance consumed (0-100). */
  drawdownUsedPct: number;
  peakBalance: number;
  openRisk: number;
  openRiskPct: number;
  openTrades: Trade[];
  bestDay: number;
  bestDaySharePct: number | null;
  payout: PayoutCheck | null;
  breaches: string[];
  transition: "ready_phase2" | "ready_funded" | null;
  curve: { day: string; balance: number }[];
  stageTrades: number;
  allTrades: number;
}

const stageOf = (a: Account) => a.stage;

export function accountState(
  account: Account,
  trades: Trade[],
  events: BalanceEvent[],
  payouts: Payout[],
  ledger: LedgerEntry[],
  settings: Settings,
  today: string,
): AccountState {
  const isProp = account.kind === "prop";
  const stage = stageOf(account);
  const own = trades.filter((t) => t.accountId === account.id);
  const stageTrades = isProp ? own.filter((t) => t.phase === stage || (stage === "failed" && t.phase === lastPhase(account))) : own;
  const stageEvents = events.filter((e) => e.accountId === account.id && (!isProp || e.phase === stage));

  const transfers = ledger.filter((l) => l.accountId === account.id && (l.type === "transfer_to_personal" || l.type === "transfer_from_personal"));
  const netTransfers = sum(transfers.map((l) => (l.type === "transfer_to_personal" ? l.amount : -l.amount)));
  const startBalance = isProp ? account.size : netTransfers;

  // Daily P/L map (realised trades + balance events) for the current stage.
  const daily = new Map<string, number>();
  const add = (d: string, v: number) => daily.set(d, (daily.get(d) ?? 0) + v);
  const closed = stageTrades.filter((t) => t.status === "closed" && t.pnl != null);
  for (const t of closed) add(dayKey(t.closedAt ?? t.openedAt), t.pnl as number);
  const nonPayoutEvents = stageEvents.filter((e) => e.type !== "payout_withdrawal");
  for (const e of nonPayoutEvents) add(e.date, e.amount);
  const payoutEvents = stageEvents.filter((e) => e.type === "payout_withdrawal");

  // Balance curve (payout withdrawals reset balance but are not trading losses).
  const changes = new Map(daily);
  for (const e of payoutEvents) changes.set(e.date, (changes.get(e.date) ?? 0) + e.amount);
  const startDay = isProp ? account.stageStartedAt : account.startDate;
  const days = [...changes.keys()].sort();
  let bal = startBalance;
  let peak = startBalance;
  let low = startBalance;
  const curve = [{ day: startDay, balance: startBalance }];
  for (const d of days) {
    bal += changes.get(d)!;
    peak = Math.max(peak, bal);
    low = Math.min(low, bal);
    curve.push({ day: d, balance: +bal.toFixed(2) });
  }
  const balance = bal;

  const tradingDays = new Set(stageTrades.map((t) => dayKey(t.openedAt))).size;
  const todayPnl = daily.get(today) ?? 0;
  const profit = balance - startBalance;
  const base = isProp ? account.size : Math.max(startBalance, 1);
  const profitPct = (profit / base) * 100;

  const dailyLossPct = isProp ? account.dailyLossPct : settings.risk.maxDailyLossPct;
  const dailyLossLimit = (base * dailyLossPct) / 100;
  const dailyLossUsedPct = todayPnl < 0 ? (-todayPnl / dailyLossLimit) * 100 : 0;

  let maxLossFloor: number;
  if (isProp) {
    maxLossFloor =
      account.maxLossType === "trailing"
        ? Math.min(account.size, peak) - (account.size * account.maxLossPct) / 100
        : account.size * (1 - account.maxLossPct / 100);
  } else {
    maxLossFloor = peak * (1 - settings.risk.personalMaxDrawdownPct / 100);
  }
  const allowance = Math.max(1, (isProp ? account.size : peak) - maxLossFloor);
  const drawdownUsedPct = Math.max(0, ((isProp && account.maxLossType === "static" ? account.size : peak) - balance) / allowance) * 100;

  const openTrades = own.filter((t) => t.status === "open");
  const openRisk = sum(openTrades.map((t) => t.riskAmount));

  const targetPct = isProp && stage === "phase1" ? account.profitTargetP1 : isProp && stage === "phase2" ? account.profitTargetP2 : null;
  const targetProgress = targetPct ? Math.max(0, profitPct / targetPct) : null;

  // Best-day rule is assessed over the current payout cycle (since last withdrawal).
  const lastPayoutDay = payoutEvents.map((e) => e.date).sort().pop();
  const cycleDays = [...daily.entries()].filter(([d]) => !lastPayoutDay || d > lastPayoutDay);
  const cycleProfit = sum(cycleDays.map(([, v]) => v));
  const bestDay = cycleDays.length ? Math.max(...cycleDays.map(([, v]) => v)) : 0;
  const bestDaySharePct = cycleProfit > 0 ? (Math.max(0, bestDay) / cycleProfit) * 100 : null;

  const breaches: string[] = [];
  for (const [d, v] of daily) if (v <= -dailyLossLimit && isProp) breaches.push(`Daily loss limit breached on ${d}`);
  if (isProp && low <= maxLossFloor) breaches.push("Maximum loss limit breached");
  if (isProp && account.maxOpenRiskPct > 0 && stage === "funded" && openRisk > (account.size * account.maxOpenRiskPct) / 100)
    breaches.push(`Open risk exceeds the ${account.maxOpenRiskPct}% funded risk limit`);

  let transition: AccountState["transition"] = null;
  if (isProp && targetPct && profitPct >= targetPct && tradingDays >= account.minTradingDays && !breaches.length)
    transition = stage === "phase1" ? "ready_phase2" : "ready_funded";

  let payout: PayoutCheck | null = null;
  if (isProp && stage === "funded") {
    const growthPct = (cycleProfit / account.size) * 100;
    const pending = payouts.some((p) => p.accountId === account.id && (p.status === "requested" || p.status === "approved"));
    const firstPayout = !payouts.some((p) => p.accountId === account.id && p.status !== "rejected");
    const checks = [
      { label: `Growth ≥ ${account.payoutMinGrowthPct}%`, ok: growthPct >= account.payoutMinGrowthPct, detail: `${growthPct.toFixed(2)}% this cycle` },
      {
        label: `Best day ≤ ${account.bestDayCapPct}% of profit`,
        ok: bestDaySharePct != null && bestDaySharePct <= account.bestDayCapPct,
        detail: bestDaySharePct == null ? "No cycle profit yet" : `Best day is ${bestDaySharePct.toFixed(0)}% of profit`,
      },
      { label: "No open positions", ok: openTrades.length === 0, detail: `${openTrades.length} open` },
      { label: "KYC approved", ok: account.kycStatus === "approved", detail: account.kycStatus.replace("_", " ") },
      { label: "No pending payout", ok: !pending, detail: pending ? "A request is in progress" : "Clear" },
      { label: "No rule breaches", ok: breaches.length === 0, detail: breaches[0] ?? "Clean" },
    ];
    payout = {
      eligible: checks.every((c) => c.ok),
      checks,
      cycleProfit,
      traderShare: Math.max(0, cycleProfit) * (account.splitPct / 100),
      feeRefundDue: firstPayout && account.feeRefundOnFirstPayout ? account.purchasePrice : 0,
    };
  }

  return {
    account,
    isProp,
    startBalance,
    balance,
    profit,
    profitPct,
    targetPct,
    targetProgress,
    tradingDays,
    minDaysMet: !isProp || tradingDays >= account.minTradingDays,
    todayPnl,
    dailyLossLimit,
    dailyLossUsedPct,
    maxLossFloor,
    drawdownUsedPct,
    peakBalance: peak,
    openRisk,
    openRiskPct: (openRisk / base) * 100,
    openTrades,
    bestDay,
    bestDaySharePct,
    payout,
    breaches,
    transition,
    curve,
    stageTrades: stageTrades.length,
    allTrades: own.length,
  };
}

function lastPhase(a: Account): string {
  return a.phase2PassedAt ? "funded" : a.phase1PassedAt ? "phase2" : "phase1";
}
