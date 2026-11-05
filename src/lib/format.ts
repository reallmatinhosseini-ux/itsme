const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdFmt2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const usd = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : usdFmt.format(Math.round(n) === 0 ? 0 : n));
export const usd2 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : usdFmt2.format(n));
export const signedUsd = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + usdFmt.format(Math.abs(n));
export const signedUsd2 = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + usdFmt2.format(Math.abs(n));

export function compactUsd(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 10_000) return `${s}$${Math.round(a / 1000)}K`;
  if (a >= 1000) return `${s}$${(a / 1000).toFixed(1)}K`;
  return `${s}$${Math.round(a)}`;
}

export const pct = (n: number | null | undefined, d = 1) => (n == null || !Number.isFinite(n) ? "—" : `${n.toFixed(d)}%`);
export const signedPct = (n: number, d = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}%`;
export const rr = (n: number | null | undefined, d = 2) => (n == null || !Number.isFinite(n) ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}R`);
export const prob = (p: number) => (p < 0.01 ? "<1%" : p > 0.99 ? ">99%" : `${Math.round(p * 100)}%`);

export function fmtDate(key: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  if (!key) return "—";
  const d = new Date(key.length <= 10 ? key + "T00:00" : key);
  return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString("en-US", opts);
}

export function fmtDateTime(key: string | null | undefined) {
  if (!key) return "—";
  const d = new Date(key);
  return Number.isNaN(d.getTime()) ? key : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export const stageLabel: Record<string, string> = {
  phase1: "Phase 1",
  phase2: "Phase 2",
  funded: "Funded",
  failed: "Failed",
  live: "Live",
};

export const toneOf = (n: number) => (n > 0 ? "text-good-ink" : n < 0 ? "text-crit-ink" : "text-ink-2");
