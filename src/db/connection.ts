import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const DATA_DIR = process.env.MISSION_DATA_DIR ?? path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const DDL = `
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, firm TEXT NOT NULL, kind TEXT NOT NULL,
  size REAL NOT NULL, purchase_price REAL NOT NULL DEFAULT 0, model TEXT NOT NULL DEFAULT '2-Step',
  payout_model TEXT NOT NULL DEFAULT 'On-Demand', stage TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
  profit_target_p1 REAL NOT NULL DEFAULT 8, profit_target_p2 REAL NOT NULL DEFAULT 5,
  daily_loss_pct REAL NOT NULL DEFAULT 5, max_loss_pct REAL NOT NULL DEFAULT 10,
  max_loss_type TEXT NOT NULL DEFAULT 'static', min_trading_days INTEGER NOT NULL DEFAULT 5,
  split_pct REAL NOT NULL DEFAULT 90, payout_min_growth_pct REAL NOT NULL DEFAULT 2,
  best_day_cap_pct REAL NOT NULL DEFAULT 40, max_open_risk_pct REAL NOT NULL DEFAULT 3,
  fee_refund INTEGER NOT NULL DEFAULT 1, kyc_status TEXT NOT NULL DEFAULT 'not_started',
  rules_verified_at TEXT, start_date TEXT NOT NULL, deadline TEXT, stage_started_at TEXT NOT NULL,
  phase1_passed_at TEXT, phase2_passed_at TEXT, failed_at TEXT, fail_reason TEXT, notes TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  phase TEXT NOT NULL, status TEXT NOT NULL, opened_at TEXT NOT NULL, closed_at TEXT,
  instrument TEXT NOT NULL, direction TEXT NOT NULL, entry REAL NOT NULL, stop REAL, take_profit REAL,
  exit_price REAL, size REAL NOT NULL, risk_amount REAL NOT NULL, pnl REAL, session TEXT, strategy TEXT,
  setup TEXT, market_condition TEXT, thesis TEXT, emotion TEXT, execution_quality INTEGER,
  mistakes TEXT NOT NULL DEFAULT '[]', lessons TEXT, entry_shot TEXT, exit_shot TEXT,
  checklist TEXT NOT NULL DEFAULT '{}', followed_plan INTEGER, news_window INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trades_account_idx ON trades(account_id, phase);
CREATE INDEX IF NOT EXISTS trades_closed_idx ON trades(closed_at);
CREATE TABLE IF NOT EXISTS balance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  phase TEXT NOT NULL, date TEXT NOT NULL, type TEXT NOT NULL, amount REAL NOT NULL, note TEXT, payout_id INTEGER
);
CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL, gross_profit REAL NOT NULL, split_pct REAL NOT NULL, requested_amount REAL NOT NULL,
  approved_amount REAL, received_amount REAL, fee_refund REAL NOT NULL DEFAULT 0, fees REAL NOT NULL DEFAULT 0,
  requested_at TEXT NOT NULL, approved_at TEXT, received_at TEXT, destination TEXT,
  allocation TEXT NOT NULL DEFAULT '{}', notes TEXT
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, type TEXT NOT NULL, amount REAL NOT NULL,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL, debt_id TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS auth (
  id INTEGER PRIMARY KEY, hash TEXT NOT NULL, salt TEXT NOT NULL, secret TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_logs (
  date TEXT PRIMARY KEY, bias TEXT, plan TEXT, key_levels TEXT, events TEXT, max_risk REAL, objective TEXT,
  sessions TEXT NOT NULL DEFAULT '[]', readiness INTEGER, pre_checklist TEXT NOT NULL DEFAULT '{}',
  review TEXT, mistakes TEXT, emotional_review TEXT, tomorrow TEXT, self_score INTEGER,
  screenshots TEXT NOT NULL DEFAULT '[]', plan_completed_at TEXT, review_completed_at TEXT
);
CREATE TABLE IF NOT EXISTS daily_track (
  date TEXT PRIMARY KEY, pnl REAL NOT NULL DEFAULT 0, no_trade INTEGER NOT NULL DEFAULT 0, note TEXT
);
`;

function open() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const sqlite = new Database(path.join(DATA_DIR, "mission.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(DDL);
  // Additive migrations for databases created by earlier versions.
  const ledgerCols = (sqlite.prepare("PRAGMA table_info(ledger)").all() as { name: string }[]).map((c) => c.name);
  if (!ledgerCols.includes("debt_id")) sqlite.exec("ALTER TABLE ledger ADD COLUMN debt_id TEXT");
  const tradeCols = (sqlite.prepare("PRAGMA table_info(trades)").all() as { name: string }[]).map((c) => c.name);
  if (!tradeCols.includes("grade")) sqlite.exec("ALTER TABLE trades ADD COLUMN grade TEXT");
  return drizzle(sqlite, { schema });
}

// Reuse one connection across hot reloads in dev.
const g = globalThis as unknown as { __missionDb?: ReturnType<typeof open> };
export const db = g.__missionDb ?? (g.__missionDb = open());
export { schema };
