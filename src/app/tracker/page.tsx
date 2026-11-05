import { redirect } from "next/navigation";
import { loadMission } from "@/lib/data";
import { db, schema } from "@/db";
import { addDays } from "@/lib/engine/util";
import { PageHeader } from "@/components/ui";
import { DailyTracker, type Day } from "@/components/daily-tracker";

export const dynamic = "force-dynamic";

export default function Tracker() {
  const m = loadMission();
  if (!m.settings.setupCompleted) redirect("/setup");
  const today = m.today;

  const rows = db.select().from(schema.dailyTrack).all();
  const map = new Map(rows.map((r) => [r.date, r]));
  const mk = (date: string): Day => {
    const r = map.get(date);
    return r ? { date, pnl: r.pnl, noTrade: !!r.noTrade, note: r.note, logged: true } : { date, pnl: 0, noTrade: false, note: null, logged: false };
  };

  const days: Day[] = [];
  for (let i = 20; i >= 0; i--) days.push(mk(addDays(today, -i)));

  const dow = new Date(today + "T00:00").getDay(); // 0 Sun … 6 Sat
  const monday = addDays(today, -((dow + 6) % 7));
  const week: Day[] = [];
  for (let i = 0; i < 7; i++) week.push(mk(addDays(monday, i)));

  const P = m.settings.plan;
  return (
    <>
      <PageHeader title="Daily Tracker" description="Log each day's result in one tap — just your daily number, your week, and your discipline. No trade-by-trade journaling." />
      <DailyTracker today={today} days={days} week={week} dailyTarget={P.dailyTargetUsd} dailyMin={P.dailyMinUsd} />
    </>
  );
}
