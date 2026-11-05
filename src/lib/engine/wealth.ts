import type { LedgerEntry, Payout } from "@/db/schema";
import type { Settings } from "../settings";
import type { AccountState } from "./accounts";
import { addDays, daysBetween, dayKey, sum } from "./util";

/**
 * The six money layers, from least to most real. Only the last one counts toward the mission.
 *   1. Nominal prop balances — the firm's capital, never yours.
 *   2. Trading profits on funded accounts — paper until paid.
 *   3. Requested/approved payouts — promised, not received.
 *   4. Received payouts — real cash.
 *   5. Personal liquid capital — cash + personal account equity.
 *   6. Realized net wealth — liquid capital after every fee and expense.
 */
export interface Wealth {
  nominalFunded: number;
  nominalEvaluation: number;
  fundedPaperProfit: number;
  fundedPaperShare: number;
  requested: number;
  approved: number;
  receivedGross: number;
  receivedNet: number;
  feesPaid: number;
  refunds: number;
  expenses: number;
  income: number;
  cash: number;
  personalEquity: number;
  liquidCapital: number;
  realizedNetWealth: number;
  missionPnl: number;
  startingCash: number;
  /** Net wealth on day one: starting cash minus every debt. */
  startingNet: number;
  debtOutstanding: number;
  debts: DebtStatus[];
}

export interface DebtStatus {
  id: string;
  name: string;
  amount: number;
  paid: number;
  outstanding: number;
  dueDate: string;
}

export function computeWealth(settings: Settings, states: AccountState[], payouts: Payout[], ledger: LedgerEntry[]): Wealth {
  const live = states.filter((s) => !s.account.archived && s.account.stage !== "failed");
  const props = live.filter((s) => s.isProp);
  const funded = props.filter((s) => s.account.stage === "funded");
  const fundedPaperProfit = sum(funded.map((s) => Math.max(0, s.payout?.cycleProfit ?? 0)));
  const fundedPaperShare = sum(funded.map((s) => s.payout?.traderShare ?? 0));

  const L = (t: LedgerEntry["type"]) => sum(ledger.filter((l) => l.type === t).map((l) => l.amount));
  const received = payouts.filter((p) => p.status === "received");
  const receivedGross = sum(received.map((p) => (p.receivedAmount ?? 0) + p.feeRefund));
  const receivedNet = receivedGross - sum(received.map((p) => p.fees));
  const refunds = L("refund") + sum(received.map((p) => p.feeRefund));

  const cash =
    settings.startingCash + receivedNet + L("refund") + L("income") - L("fee") - L("expense") - L("transfer_to_personal") + L("transfer_from_personal") - L("debt_payment");
  const personalEquity = sum(states.filter((s) => !s.isProp && !s.account.archived).map((s) => s.balance));
  const liquidCapital = cash + personalEquity;
  const debts: DebtStatus[] = settings.debts.map((d) => {
    const paid = sum(ledger.filter((l) => l.type === "debt_payment" && l.debtId === d.id).map((l) => l.amount));
    return { ...d, paid, outstanding: Math.max(0, d.amount - paid) };
  });
  const debtOutstanding = sum(debts.map((d) => d.outstanding));
  const startingNet = settings.startingCash - sum(settings.debts.map((d) => d.amount));

  return {
    nominalFunded: sum(funded.map((s) => s.account.size)),
    nominalEvaluation: sum(props.filter((s) => s.account.stage !== "funded").map((s) => s.account.size)),
    fundedPaperProfit,
    fundedPaperShare,
    requested: sum(payouts.filter((p) => p.status === "requested").map((p) => p.requestedAmount)),
    approved: sum(payouts.filter((p) => p.status === "approved").map((p) => p.approvedAmount ?? p.requestedAmount)),
    receivedGross,
    receivedNet,
    feesPaid: L("fee"),
    refunds,
    expenses: L("expense"),
    income: L("income"),
    cash,
    personalEquity,
    liquidCapital,
    realizedNetWealth: liquidCapital - debtOutstanding,
    missionPnl: liquidCapital - debtOutstanding - startingNet,
    startingCash: settings.startingCash,
    startingNet,
    debtOutstanding,
    debts,
  };
}

/** Daily realized-net-wealth series from mission start to today. */
export function wealthTimeline(
  settings: Settings,
  states: AccountState[],
  payouts: Payout[],
  ledger: LedgerEntry[],
  today: string,
): { day: string; wealth: number; payouts: number; fees: number }[] {
  const delta = new Map<string, number>();
  const pay = new Map<string, number>();
  const fee = new Map<string, number>();
  const add = (m: Map<string, number>, d: string, v: number) => m.set(d, (m.get(d) ?? 0) + v);

  for (const l of ledger) {
    const sign = l.type === "fee" || l.type === "expense" ? -1 : l.type === "refund" || l.type === "income" ? 1 : 0;
    if (sign) add(delta, dayKey(l.date), sign * l.amount);
    if (l.type === "fee") add(fee, dayKey(l.date), l.amount);
  }
  for (const p of payouts) {
    if (p.status !== "received" || !p.receivedAt) continue;
    const net = (p.receivedAmount ?? 0) + p.feeRefund - p.fees;
    add(delta, dayKey(p.receivedAt), net);
    add(pay, dayKey(p.receivedAt), net);
  }
  // Personal accounts: trading results (transfers are internal and cancel out).
  for (const s of states.filter((x) => !x.isProp)) {
    let prev = s.startBalance;
    for (const pt of s.curve.slice(1)) {
      add(delta, pt.day, pt.balance - prev);
      prev = pt.balance;
    }
  }

  const first = [settings.missionStart, ...delta.keys()].sort()[0];
  const end = today > first ? today : first;
  const n = Math.min(daysBetween(first, end), 800);
  // Debt payments move cash and debt together, so they never change net wealth.
  let w = settings.startingCash - sum(settings.debts.map((d) => d.amount)), cp = 0, cf = 0;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const d = addDays(first, i);
    w += delta.get(d) ?? 0;
    cp += pay.get(d) ?? 0;
    cf += fee.get(d) ?? 0;
    out.push({ day: d, wealth: +w.toFixed(2), payouts: +cp.toFixed(2), fees: +cf.toFixed(2) });
  }
  return out;
}

export interface MissionClock {
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  timePct: number;
  goalPct: number;
  requiredPerMonth: number;
  requiredPerWeek: number;
  actualPerWeek: number;
  /** Where linear pacing says wealth should be today. */
  pacedTarget: number;
  aheadBy: number;
}

export function missionClock(settings: Settings, wealth: Wealth, today: string): MissionClock {
  const totalDays = Math.max(1, daysBetween(settings.missionStart, settings.missionEnd));
  const elapsedDays = Math.min(totalDays, Math.max(0, daysBetween(settings.missionStart, today)));
  const remainingDays = totalDays - elapsedDays;
  const gap = Math.max(0, settings.targetAmount - wealth.realizedNetWealth);
  const startW = wealth.startingNet;
  const pacedTarget = startW + ((settings.targetAmount - startW) * elapsedDays) / totalDays;
  return {
    totalDays,
    elapsedDays,
    remainingDays,
    timePct: (elapsedDays / totalDays) * 100,
    goalPct: Math.max(0, Math.min(100, ((wealth.realizedNetWealth - startW) / (settings.targetAmount - startW)) * 100)),
    requiredPerMonth: remainingDays > 0 ? gap / (remainingDays / 30.44) : gap,
    requiredPerWeek: remainingDays > 0 ? gap / (remainingDays / 7) : gap,
    actualPerWeek: elapsedDays >= 7 ? wealth.missionPnl / (elapsedDays / 7) : 0,
    pacedTarget,
    aheadBy: wealth.realizedNetWealth - pacedTarget,
  };
}
