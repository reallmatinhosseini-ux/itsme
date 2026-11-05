import "server-only";
import type { Mission } from "./data";
import { nowLocal } from "./data";
import { SESSIONS } from "./settings";
import { ideaKey } from "./engine/risk";
import { dayKey } from "./engine/util";
import type { TradeFormContext } from "@/components/forms/trade-form";

const DEFAULT_INSTRUMENTS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "EURJPY", "GBPJPY", "XAUUSD", "US30", "NAS100", "SPX500", "GER40"];

export function tradeContext(m: Mission, includeAccountId?: number): TradeFormContext {
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])];
  return {
    accounts: m.states
      .filter((s) => (!s.account.archived && s.account.stage !== "failed") || s.account.id === includeAccountId)
      .map((s) => ({
        id: s.account.id,
        name: s.account.name,
        size: s.isProp ? s.account.size : Math.max(1, s.peakBalance),
        isProp: s.isProp,
        todayPnl: s.todayPnl,
        dailyLossLimit: s.dailyLossLimit,
        ideasToday: new Set(m.trades.filter((t) => t.accountId === s.account.id && dayKey(t.openedAt) === m.today).map(ideaKey)).size,
        stage: s.account.stage,
      })),
    maxRiskPct: m.settings.risk.maxRiskPerTradePct,
    maxTrades: m.settings.risk.maxTradesPerDay,
    sessions: [...SESSIONS],
    allowedSessions: m.settings.risk.allowedSessions,
    strategies: uniq([...m.settings.strategies, ...m.trades.map((t) => t.strategy)]),
    setups: uniq(m.trades.map((t) => t.setup)),
    instruments: uniq([...m.trades.map((t) => t.instrument), ...DEFAULT_INSTRUMENTS]),
    mistakeTags: m.settings.mistakeTags,
    emotions: m.settings.emotions,
    now: nowLocal(),
  };
}
