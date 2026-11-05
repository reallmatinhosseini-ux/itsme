"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db, schema, UPLOAD_DIR } from "@/db";
import { getSettings, saveSettings, today, nowLocal } from "@/lib/data";
import { settingsSchema, type Settings } from "@/lib/settings";
import { cookies } from "next/headers";
import { COOKIE, hasPasscode, sessionToken, setPasscode, verifyPasscode } from "@/lib/auth";

export type ActionState = { ok: boolean; error?: string; fieldErrors?: Record<string, string>; message?: string } | null;

const done = (message?: string): ActionState => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

function fail(err: unknown): ActionState {
  if (err instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of err.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
}

const num = z.coerce.number();
const optNum = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().optional());
const optStr = z.preprocess((v) => (v === "" || v == null ? undefined : String(v).trim()), z.string().optional());
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Pick a date");
const fd = (f: FormData) => Object.fromEntries(f.entries());

async function saveUpload(file: FormDataEntryValue | null): Promise<string | undefined> {
  if (!file || typeof file === "string" || file.size === 0) return undefined;
  if (!file.type.startsWith("image/")) throw new Error("Screenshots must be images.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Screenshots must be under 8 MB.");
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "png";
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
  return name;
}

// ---------------------------------------------------------------- accounts

const accountSchema = z.object({
  name: z.string().trim().min(1, "Name the account"),
  firm: z.string().trim().min(1, "Firm is required"),
  kind: z.enum(["prop", "personal"]),
  size: num.positive("Must be positive"),
  purchasePrice: num.nonnegative(),
  model: z.string().default("2-Step"),
  payoutModel: z.string().default("On-Demand"),
  stage: z.enum(["phase1", "phase2", "funded", "live"]),
  profitTargetP1: num,
  profitTargetP2: num,
  dailyLossPct: num.positive(),
  maxLossPct: num.positive(),
  maxLossType: z.enum(["static", "trailing"]),
  minTradingDays: z.coerce.number().int().nonnegative(),
  splitPct: num.min(0).max(100),
  payoutMinGrowthPct: num.nonnegative(),
  bestDayCapPct: num.min(0).max(100),
  maxOpenRiskPct: num.nonnegative(),
  feeRefundOnFirstPayout: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  rulesVerified: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  kycStatus: z.enum(["not_started", "pending", "approved", "n/a"]),
  startDate: day,
  deadline: optStr,
  notes: optStr,
});

export async function saveAccount(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const raw = fd(form);
    const id = raw.id ? Number(raw.id) : null;
    const v = accountSchema.parse(raw);
    const { rulesVerified, ...rest } = v;
    const values = { ...rest, rulesVerifiedAt: rulesVerified ? today() : null, deadline: v.deadline ?? null, notes: v.notes ?? null };
    if (id) {
      const prev = await db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).get();
      if (!prev) throw new Error("Account not found");
      await db.update(schema.accounts)
        .set({ ...values, stage: prev.stage, rulesVerifiedAt: rulesVerified ? prev.rulesVerifiedAt ?? today() : null })
        .where(eq(schema.accounts.id, id))
        .run();
      return done("Account updated");
    }
    const created = await db
      .insert(schema.accounts)
      .values({ ...values, stage: v.kind === "personal" ? "live" : v.stage, stageStartedAt: v.startDate, createdAt: new Date().toISOString() })
      .returning()
      .get();
    if (v.kind === "prop" && v.purchasePrice > 0)
      await db.insert(schema.ledger).values({ date: v.startDate, type: "fee", amount: v.purchasePrice, accountId: created.id, note: `${v.firm} $${v.size.toLocaleString()} challenge fee` }).run();
    if (v.kind === "personal")
      await db.insert(schema.ledger).values({ date: v.startDate, type: "transfer_to_personal", amount: v.size, accountId: created.id, note: "Initial deposit" }).run();
    return done("Account created");
  } catch (e) {
    return fail(e);
  }
}

export async function setStage(id: number, stage: "phase1" | "phase2" | "funded" | "failed", reason?: string) {
  const a = await db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).get();
  if (!a) return;
  const t = today();
  const patch: Partial<typeof schema.accounts.$inferInsert> = { stage, stageStartedAt: t };
  if (stage === "phase2") patch.phase1PassedAt = t;
  if (stage === "funded") patch.phase2PassedAt = t;
  if (stage === "failed") {
    patch.failedAt = t;
    patch.failReason = reason ?? "Rule breach";
    patch.stageStartedAt = a.stageStartedAt;
  }
  await db.update(schema.accounts).set(patch).where(eq(schema.accounts.id, id)).run();
  revalidatePath("/", "layout");
}

export async function setArchived(id: number, archived: boolean) {
  await db.update(schema.accounts).set({ archived }).where(eq(schema.accounts.id, id)).run();
  revalidatePath("/", "layout");
}

export async function deleteAccount(id: number) {
  await db.delete(schema.trades).where(eq(schema.trades.accountId, id)).run();
  await db.delete(schema.balanceEvents).where(eq(schema.balanceEvents.accountId, id)).run();
  await db.delete(schema.payouts).where(eq(schema.payouts.accountId, id)).run();
  await db.delete(schema.ledger).where(eq(schema.ledger.accountId, id)).run();
  await db.delete(schema.accounts).where(eq(schema.accounts.id, id)).run();
  revalidatePath("/", "layout");
}

const eventSchema = z.object({
  accountId: z.coerce.number().int(),
  date: day,
  type: z.enum(["commission", "swap", "correction", "deposit", "withdrawal"]),
  amount: num.refine((x) => x !== 0, "Cannot be zero"),
  note: optStr,
});

export async function addBalanceEvent(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const v = eventSchema.parse(fd(form));
    const a = await db.select().from(schema.accounts).where(eq(schema.accounts.id, v.accountId)).get();
    if (!a) throw new Error("Account not found");
    await db.insert(schema.balanceEvents).values({ ...v, phase: a.stage, note: v.note ?? null }).run();
    return done("Adjustment recorded");
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- trades

const tradeSchema = z
  .object({
    accountId: z.coerce.number().int().positive("Choose an account"),
    status: z.enum(["open", "closed"]),
    openedAt: z.string().min(10, "Required"),
    closedAt: optStr,
    instrument: z.string().trim().min(1, "Required").transform((s) => s.toUpperCase()),
    direction: z.enum(["buy", "sell"]),
    entry: num.positive("Required"),
    stop: optNum,
    takeProfit: optNum,
    exitPrice: optNum,
    size: num.positive("Required"),
    riskAmount: num.positive("Initial risk in $ is required"),
    pnl: optNum,
    session: optStr,
    strategy: optStr,
    setup: optStr,
    grade: optStr,
    marketCondition: optStr,
    thesis: optStr,
    emotion: optStr,
    executionQuality: optNum,
    lessons: optStr,
    followedPlan: z.preprocess((v) => (v === "yes" ? true : v === "no" ? false : undefined), z.boolean().optional()),
    newsWindow: z.preprocess((v) => v === "on", z.boolean()),
  })
  .superRefine((v, ctx) => {
    if (v.status === "closed" && v.pnl == null) ctx.addIssue({ code: "custom", path: ["pnl"], message: "Realised P/L is required for a closed trade" });
    if (v.status === "closed" && !v.closedAt) ctx.addIssue({ code: "custom", path: ["closedAt"], message: "Close time is required" });
    if (v.closedAt && v.closedAt < v.openedAt) ctx.addIssue({ code: "custom", path: ["closedAt"], message: "Close is before open" });
    if (v.stop != null) {
      const wrongSide = v.direction === "buy" ? v.stop >= v.entry : v.stop <= v.entry;
      if (wrongSide) ctx.addIssue({ code: "custom", path: ["stop"], message: "Stop is on the wrong side of entry" });
    }
  });

export async function saveTrade(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const raw = fd(form);
    const id = raw.id ? Number(raw.id) : null;
    const v = tradeSchema.parse(raw);
    const a = await db.select().from(schema.accounts).where(eq(schema.accounts.id, v.accountId)).get();
    if (!a) throw new Error("Account not found");
    if (a.stage === "failed" || a.archived) throw new Error("This account is closed. Choose an active account.");
    const mistakes = form.getAll("mistakes").map(String);
    const checklist: Record<string, boolean> = {};
    for (const [k, val] of form.entries()) if (k.startsWith("chk_")) checklist[k.slice(4)] = val === "on";
    for (const k of String(raw.checklistKeys ?? "").split(",").filter(Boolean)) checklist[k] ??= false;
    const entryShot = await saveUpload(form.get("entryShotFile"));
    const exitShot = await saveUpload(form.get("exitShotFile"));
    const values = {
      ...v,
      closedAt: v.status === "closed" ? v.closedAt ?? null : null,
      pnl: v.status === "closed" ? v.pnl ?? null : null,
      stop: v.stop ?? null,
      takeProfit: v.takeProfit ?? null,
      exitPrice: v.exitPrice ?? null,
      executionQuality: v.executionQuality ?? null,
      followedPlan: v.followedPlan ?? null,
      session: v.session ?? null,
      strategy: v.strategy ?? null,
      setup: v.setup ?? null,
      grade: v.grade ?? null,
      marketCondition: v.marketCondition ?? null,
      thesis: v.thesis ?? null,
      emotion: v.emotion ?? null,
      lessons: v.lessons ?? null,
      mistakes: JSON.stringify(mistakes),
      checklist: JSON.stringify(checklist),
    };
    if (id) {
      const patch: Record<string, unknown> = { ...values };
      if (entryShot) patch.entryShot = entryShot;
      if (exitShot) patch.exitShot = exitShot;
      await db.update(schema.trades).set(patch).where(eq(schema.trades.id, id)).run();
      return done("Trade updated");
    }
    await db.insert(schema.trades)
      .values({ ...values, phase: a.stage, entryShot: entryShot ?? null, exitShot: exitShot ?? null, createdAt: new Date().toISOString() })
      .run();
    return done("Trade logged");
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTrade(id: number) {
  await db.delete(schema.trades).where(eq(schema.trades.id, id)).run();
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- payouts

const payoutSchema = z.object({
  accountId: z.coerce.number().int().positive("Choose a funded account"),
  grossProfit: num.positive("Profit withdrawn must be positive"),
  splitPct: num.min(0).max(100),
  feeRefund: num.nonnegative().default(0),
  requestedAt: day,
  destination: optStr,
  notes: optStr,
});

export async function requestPayout(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const v = payoutSchema.parse(fd(form));
    const a = await db.select().from(schema.accounts).where(eq(schema.accounts.id, v.accountId)).get();
    if (!a || a.stage !== "funded") throw new Error("Payouts can only be requested from a funded account.");
    const p = await db
      .insert(schema.payouts)
      .values({ ...v, status: "requested", requestedAmount: +(v.grossProfit * (v.splitPct / 100)).toFixed(2), destination: v.destination ?? null, notes: v.notes ?? null })
      .returning()
      .get();
    // The firm removes the withdrawn profit from the account balance at request time.
    await db.insert(schema.balanceEvents).values({ accountId: a.id, phase: "funded", date: v.requestedAt, type: "payout_withdrawal", amount: -v.grossProfit, payoutId: p.id, note: "Payout request" }).run();
    return done("Payout requested");
  } catch (e) {
    return fail(e);
  }
}

const progressSchema = z.object({
  id: z.coerce.number().int(),
  status: z.enum(["approved", "received", "rejected"]),
  date: day,
  amount: optNum,
  fees: optNum,
  allocReserve: optNum,
  allocChallenge: optNum,
  allocPersonal: optNum,
  allocOther: optNum,
  allocDebt: optNum,
  debtId: optStr,
  personalAccountId: optNum,
});

export async function progressPayout(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const v = progressSchema.parse(fd(form));
    const p = await db.select().from(schema.payouts).where(eq(schema.payouts.id, v.id)).get();
    if (!p) throw new Error("Payout not found");
    if (v.status === "approved") {
      await db.update(schema.payouts).set({ status: "approved", approvedAt: v.date, approvedAmount: v.amount ?? p.requestedAmount }).where(eq(schema.payouts.id, p.id)).run();
    } else if (v.status === "rejected") {
      await db.update(schema.payouts).set({ status: "rejected" }).where(eq(schema.payouts.id, p.id)).run();
      await db.delete(schema.balanceEvents).where(and(eq(schema.balanceEvents.payoutId, p.id), eq(schema.balanceEvents.type, "payout_withdrawal"))).run();
    } else {
      const received = v.amount ?? p.approvedAmount ?? p.requestedAmount;
      const allocation = { debt: v.allocDebt ?? 0, reserve: v.allocReserve ?? 0, challenge: v.allocChallenge ?? 0, personal: v.allocPersonal ?? 0, other: v.allocOther ?? 0 };
      const net = received + p.feeRefund - (v.fees ?? 0);
      const allocated = allocation.debt + allocation.reserve + allocation.challenge + allocation.personal + allocation.other;
      if (allocated > net + 0.01) throw new Error(`Allocation ($${allocated.toFixed(2)}) exceeds the net amount ($${net.toFixed(2)}).`);
      await db.update(schema.payouts)
        .set({ status: "received", receivedAt: v.date, receivedAmount: received, approvedAmount: p.approvedAmount ?? received, approvedAt: p.approvedAt ?? v.date, fees: v.fees ?? 0, allocation: JSON.stringify(allocation) })
        .where(eq(schema.payouts.id, p.id))
        .run();
      if (allocation.personal > 0 && v.personalAccountId)
        await db.insert(schema.ledger).values({ date: v.date, type: "transfer_to_personal", amount: allocation.personal, accountId: v.personalAccountId, note: `Allocation from payout #${p.id}` }).run();
      if (allocation.debt > 0 && v.debtId)
        await db.insert(schema.ledger).values({ date: v.date, type: "debt_payment", amount: allocation.debt, debtId: v.debtId, note: `Paid from payout #${p.id}` }).run();
      // Reserve, challenge and "other" money stays in cash until actually spent (a fee or expense entry).
    }
    return done("Payout updated");
  } catch (e) {
    return fail(e);
  }
}

export async function deletePayout(id: number) {
  await db.delete(schema.balanceEvents).where(eq(schema.balanceEvents.payoutId, id)).run();
  await db.delete(schema.payouts).where(eq(schema.payouts.id, id)).run();
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- ledger

const ledgerSchema = z.object({
  date: day,
  type: z.enum(["fee", "refund", "expense", "income", "transfer_to_personal", "transfer_from_personal", "debt_payment"]),
  amount: num.positive("Must be positive"),
  accountId: optNum,
  debtId: optStr,
  note: optStr,
});

export async function addLedger(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const v = ledgerSchema.parse(fd(form));
    if (v.type.startsWith("transfer") && !v.accountId) throw new Error("Choose the personal account for a transfer.");
    if (v.type === "debt_payment" && !v.debtId) throw new Error("Choose which debt this pays.");
    await db.insert(schema.ledger).values({ ...v, accountId: v.accountId ?? null, debtId: v.type === "debt_payment" ? v.debtId! : null, note: v.note ?? null }).run();
    return done("Entry recorded");
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLedger(id: number) {
  await db.delete(schema.ledger).where(eq(schema.ledger.id, id)).run();
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- daily log

export async function saveDailyLog(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const raw = fd(form);
    const date = day.parse(raw.date);
    const part = String(raw.part);
    const existing = await db.select().from(schema.dailyLogs).where(eq(schema.dailyLogs.date, date)).get();
    const s = (k: string) => (raw[k] === undefined ? undefined : String(raw[k]).trim() || null);
    let patch: Partial<typeof schema.dailyLogs.$inferInsert>;
    if (part === "plan") {
      const pre: Record<string, boolean> = {};
      for (const [k, val] of form.entries()) if (k.startsWith("pre_")) pre[k.slice(4)] = val === "on";
      for (const k of String(raw.preKeys ?? "").split(",").filter(Boolean)) pre[k] ??= false;
      const maxRisk = optNum.parse(raw.maxRisk);
      if (!s("plan") && !s("bias")) throw new z.ZodError([{ code: "custom", path: ["plan"], message: "Write at least a bias or a plan", input: "" }]);
      patch = {
        bias: s("bias"),
        plan: s("plan"),
        keyLevels: s("keyLevels"),
        events: s("events"),
        objective: s("objective"),
        maxRisk: maxRisk ?? null,
        readiness: optNum.parse(raw.readiness) ?? null,
        sessions: JSON.stringify(form.getAll("sessions").map(String)),
        preChecklist: JSON.stringify(pre),
        planCompletedAt: existing?.planCompletedAt ?? (date === today() ? nowLocal() : `${date}T00:00`),
      };
    } else {
      const shot = await saveUpload(form.get("screenshotFile"));
      const shots = existing ? (JSON.parse(existing.screenshots) as string[]) : [];
      if (shot) shots.push(shot);
      const selfScore = optNum.parse(raw.selfScore);
      if (selfScore != null && (selfScore < 1 || selfScore > 10)) throw new z.ZodError([{ code: "custom", path: ["selfScore"], message: "1–10", input: selfScore }]);
      patch = {
        review: s("review"),
        mistakes: s("mistakes"),
        emotionalReview: s("emotionalReview"),
        tomorrow: s("tomorrow"),
        selfScore: selfScore ?? null,
        screenshots: JSON.stringify(shots),
        reviewCompletedAt: existing?.reviewCompletedAt ?? nowLocal(),
      };
    }
    if (existing) await db.update(schema.dailyLogs).set(patch).where(eq(schema.dailyLogs.date, date)).run();
    else await db.insert(schema.dailyLogs).values({ date, ...patch }).run();
    return done(part === "plan" ? "Plan saved" : "Review saved");
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- settings

export async function updateSettings(patch: Partial<Settings>): Promise<ActionState> {
  try {
    const next = settingsSchema.parse({ ...(await getSettings()), ...patch });
    const alloc = next.policy.reservePct + next.policy.challengePct + next.policy.personalPct + next.policy.otherPct;
    if (Math.abs(alloc - 100) > 0.01) throw new Error(`Allocation percentages must add up to 100 (currently ${alloc}).`);
    if (next.missionEnd <= next.missionStart) throw new Error("Mission end must be after the start.");
    await saveSettings(next);
    return done("Settings saved");
  } catch (e) {
    return fail(e);
  }
}

export async function resetAllData(confirm: string): Promise<ActionState> {
  if (confirm !== "RESET") return { ok: false, error: 'Type RESET to confirm.' };
  for (const t of [schema.trades, schema.balanceEvents, schema.payouts, schema.ledger, schema.dailyLogs, schema.accounts, schema.settings]) await db.delete(t).run();
  return done("All data cleared");
}

// ---------------------------------------------------------------- setup & access

const setupSchema = z.object({
  startingCash: num.nonnegative("Can't be negative"),
  debts: z.array(z.object({ name: z.string().trim().min(1, "Name it"), amount: num.positive("Must be positive"), dueDate: day })),
  challenge: z
    .object({ templateId: z.string(), price: num.nonnegative(), startDate: day, stage: z.enum(["phase1", "phase2", "funded"]) })
    .nullable(),
  passcode: z.string().optional(),
});

export async function completeSetup(input: z.input<typeof setupSchema>): Promise<ActionState> {
  try {
    const v = setupSchema.parse(input);
    if (v.passcode && v.passcode.length < 6) throw new Error("Passcode must be at least 6 characters.");
    const current = await getSettings();
    const t = today();
    const next = settingsSchema.parse({
      ...current,
      startingCash: v.startingCash,
      startingCashConfirmed: true,
      setupCompleted: true,
      missionStart: current.setupCompleted ? current.missionStart : t,
      missionEnd: current.setupCompleted ? current.missionEnd : addMonths(t, 6),
      debts: v.debts.map((d, i) => ({ id: `debt-${Date.now()}-${i}`, ...d })),
    });
    await saveSettings(next);
    if (v.challenge) {
      const tpl = next.templates.find((x) => x.id === v.challenge!.templateId);
      if (!tpl) throw new Error("Unknown challenge template.");
      const a = await db
        .insert(schema.accounts)
        .values({
          name: `${tpl.firm} $${tpl.size / 1000}K`, firm: tpl.firm, kind: "prop", size: tpl.size, purchasePrice: v.challenge.price,
          model: "2-Step", payoutModel: "On-Demand", stage: v.challenge.stage,
          profitTargetP1: tpl.profitTargetP1, profitTargetP2: tpl.profitTargetP2, dailyLossPct: tpl.dailyLossPct, maxLossPct: tpl.maxLossPct,
          maxLossType: tpl.maxLossType, minTradingDays: tpl.minTradingDays, splitPct: tpl.splitPct, payoutMinGrowthPct: tpl.payoutMinGrowthPct,
          bestDayCapPct: tpl.bestDayCapPct, maxOpenRiskPct: tpl.maxOpenRiskPct, feeRefundOnFirstPayout: tpl.feeRefundOnFirstPayout,
          kycStatus: "not_started", rulesVerifiedAt: null, startDate: v.challenge.startDate, stageStartedAt: v.challenge.startDate, createdAt: new Date().toISOString(),
        })
        .returning()
        .get();
      if (v.challenge.price > 0) await db.insert(schema.ledger).values({ date: v.challenge.startDate, type: "fee", amount: v.challenge.price, accountId: a.id, note: `${tpl.firm} $${tpl.size.toLocaleString()} challenge fee` }).run();
    }
    if (v.passcode) await applyPasscode(v.passcode);
    return done("You're set up");
  } catch (e) {
    return fail(e);
  }
}

function addMonths(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1 + n, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

async function applyPasscode(passcode: string) {
  await setPasscode(passcode);
  // Keep this device signed in after setting or changing the passcode.
  (await cookies()).set(COOKIE, (await sessionToken())!, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 60 });
}

export async function changePasscode(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const current = String(form.get("current") ?? "");
    const next = String(form.get("next") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if ((await hasPasscode()) && !(await verifyPasscode(current))) return { ok: false, error: "Current passcode is incorrect.", fieldErrors: { current: "Incorrect" } };
    if (next.length < 6) return { ok: false, error: "Use at least 6 characters.", fieldErrors: { next: "At least 6 characters" } };
    if (next !== confirm) return { ok: false, error: "Passcodes don't match.", fieldErrors: { confirm: "Doesn't match" } };
    await applyPasscode(next);
    return done("Passcode saved. Other devices will need to sign in again.");
  } catch (e) {
    return fail(e);
  }
}

export async function signOut() {
  (await cookies()).delete(COOKIE);
  revalidatePath("/", "layout");
}

export async function saveDebts(debts: Settings["debts"]): Promise<ActionState> {
  return updateSettings({ debts });
}
