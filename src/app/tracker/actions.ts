"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export async function logDay(date: string, pnl: number, noTrade: boolean, note: string | null) {
  const clean = Number.isFinite(pnl) ? pnl : 0;
  db.insert(schema.dailyTrack)
    .values({ date, pnl: clean, noTrade: noTrade ? 1 : 0, note: note || null })
    .onConflictDoUpdate({ target: schema.dailyTrack.date, set: { pnl: clean, noTrade: noTrade ? 1 : 0, note: note || null } })
    .run();
  revalidatePath("/tracker");
  revalidatePath("/");
}

export async function clearDay(date: string) {
  db.delete(schema.dailyTrack).where(eq(schema.dailyTrack.date, date)).run();
  revalidatePath("/tracker");
}
