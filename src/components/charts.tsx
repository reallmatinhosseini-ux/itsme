"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { compactUsd, fmtDate, rr, signedUsd, usd } from "@/lib/format";

type Fmt = "usd" | "r" | "pct" | "int" | "signedUsd";
const fmt = (f: Fmt, v: number) =>
  f === "usd" ? compactUsd(v) : f === "signedUsd" ? signedUsd(v) : f === "r" ? rr(v, 1) : f === "pct" ? `${v.toFixed(0)}%` : String(Math.round(v));
const fmtFull = (f: Fmt, v: number) => (f === "usd" ? usd(v) : f === "signedUsd" ? signedUsd(v) : f === "r" ? rr(v) : f === "pct" ? `${v.toFixed(1)}%` : String(v));

const C = {
  s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a", s4: "#eda100", s7: "#6250d6", s8: "#e34948",
  ink: "#0b0d12", ink3: "#868c99", line: "rgba(15,23,42,0.07)",
};
export const SERIES = [C.s1, C.s2, C.s3, C.s4, "#e87ba4", "#008300", C.s7, C.s8];
const POS = C.s3;
const NEG = C.s8;

const axis = { tickLine: false, axisLine: false, tickMargin: 8, fontSize: 11 } as const;

function Tip({ active, payload, label, f, xf }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string; payload: Record<string, unknown> }[]; label?: string | number; f: Fmt; xf?: "date" | "none" }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value != null && !String(p.dataKey).startsWith("_"));
  return (
    <div className="glass glass-strong min-w-[150px] px-3 py-2.5 text-[12px]" style={{ boxShadow: "var(--shadow-float)" }}>
      <div className="mb-1.5 font-medium text-ink-2">{xf === "date" && typeof label === "string" ? fmtDate(label, { month: "short", day: "numeric", year: "numeric" }) : label}</div>
      {rows.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="num font-semibold text-ink">{fmtFull(f, Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-[2px] w-3.5 rounded" style={{ background: i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 3px, transparent 3px 6px)` : i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function TimeSeries({
  data, x = "day", series, f = "usd", height = 260, refY, refLabel, area = true, xf = "date",
}: {
  data: Record<string, unknown>[];
  x?: string;
  series: { key: string; label: string; color?: string; dashed?: boolean; area?: boolean }[];
  f?: Fmt;
  height?: number;
  refY?: number;
  refLabel?: string;
  area?: boolean;
  xf?: "date" | "none";
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color ?? SERIES[i]} stopOpacity={0.18} />
                <stop offset="100%" stopColor={s.color ?? SERIES[i]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <XAxis dataKey={x} {...axis} minTickGap={36} tickFormatter={(v) => (xf === "date" ? fmtDate(String(v)) : String(v))} />
          <YAxis {...axis} width={56} tickFormatter={(v) => fmt(f, v)} domain={["auto", "auto"]} />
          <Tooltip content={<Tip f={f} xf={xf} />} cursor={{ stroke: C.ink3, strokeWidth: 1, strokeDasharray: "3 3" }} />
          {refY != null && <ReferenceLine y={refY} stroke={C.ink} strokeOpacity={0.35} strokeDasharray="4 4" label={{ value: refLabel, position: "insideTopRight", fontSize: 11, fill: C.ink3 }} />}
          {series.map((s, i) =>
            area && s.area !== false ? (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? SERIES[i]} strokeWidth={2} fill={`url(#g-${s.key})`} strokeDasharray={s.dashed ? "4 4" : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive animationDuration={700} />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? SERIES[i]} strokeWidth={2} strokeDasharray={s.dashed ? "4 4" : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FanChart({ data, target, height = 300 }: { data: { date: string; p10: number; p25: number; p50: number; p75: number; p90: number }[]; target: number; height?: number }) {
  const rows = data.map((d) => ({ ...d, _outer: [d.p10, d.p90], _inner: [d.p25, d.p75] }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" {...axis} minTickGap={36} tickFormatter={(v) => fmtDate(String(v))} />
          <YAxis {...axis} width={56} tickFormatter={(v) => compactUsd(v)} />
          <Tooltip content={<FanTip />} cursor={{ stroke: C.ink3, strokeDasharray: "3 3" }} />
          <Area dataKey="_outer" stroke="none" fill={C.s1} fillOpacity={0.09} isAnimationActive={false} />
          <Area dataKey="_inner" stroke="none" fill={C.s1} fillOpacity={0.16} isAnimationActive={false} />
          <Line dataKey="p50" name="Median" stroke={C.s1} strokeWidth={2} dot={false} />
          <ReferenceLine y={target} stroke={C.ink} strokeOpacity={0.4} strokeDasharray="4 4" label={{ value: `Target ${compactUsd(target)}`, position: "insideTopLeft", fontSize: 11, fill: C.ink3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function FanTip({ active, payload }: { active?: boolean; payload?: { payload: { date: string; p10: number; p25: number; p50: number; p75: number; p90: number } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass glass-strong px-3 py-2.5 text-[12px]" style={{ boxShadow: "var(--shadow-float)" }}>
      <div className="mb-1.5 font-medium text-ink-2">{fmtDate(d.date, { month: "short", day: "numeric", year: "numeric" })}</div>
      {(["p90", "p75", "p50", "p25", "p10"] as const).map((k) => (
        <div key={k} className="flex justify-between gap-6 py-0.5">
          <span className="text-ink-2">{k === "p50" ? "Median" : `${k.slice(1)}th pct`}</span>
          <span className="num font-semibold">{usd(d[k])}</span>
        </div>
      ))}
    </div>
  );
}

export function Histogram({ data, height = 220 }: { data: { from: number; to: number; count: number; hit: boolean }[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const rows = data.map((d) => ({ label: compactUsd(d.from), share: (d.count / total) * 100, hit: d.hit, range: `${compactUsd(d.from)}–${compactUsd(d.to)}` }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axis} width={36} tickFormatter={(v) => `${Math.round(v)}%`} />
          <Tooltip
            cursor={{ fill: "rgba(15,23,42,0.04)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="glass glass-strong px-3 py-2 text-[12px]" style={{ boxShadow: "var(--shadow-float)" }}>
                  <div className="font-medium text-ink-2">{(payload[0].payload as { range: string }).range}</div>
                  <div className="num font-semibold">{Number(payload[0].value).toFixed(1)}% of outcomes</div>
                </div>
              ) : null
            }
          />
          <Bar dataKey="share" radius={[4, 4, 0, 0]}>
            {rows.map((r, i) => (
              <Cell key={i} fill={r.hit ? C.s1 : "#c3c8d1"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SignedBars({ data, x = "key", y = "value", f = "signedUsd", height = 220, label = "P/L" }: { data: Record<string, unknown>[]; x?: string; y?: string; f?: Fmt; height?: number; label?: string }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey={x} {...axis} minTickGap={12} />
          <YAxis {...axis} width={56} tickFormatter={(v) => fmt(f, v)} />
          <ReferenceLine y={0} stroke={C.ink} strokeOpacity={0.25} />
          <Tooltip content={<Tip f={f} xf="none" />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
          <Bar dataKey={y} name={label} radius={[4, 4, 4, 4]} maxBarSize={36}>
            {data.map((d, i) => (
              <Cell key={i} fill={Number(d[y]) >= 0 ? POS : NEG} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DrawdownChart({ data, x = "i", height = 160, f = "r" }: { data: Record<string, unknown>[]; x?: string; height?: number; f?: Fmt }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="dd" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NEG} stopOpacity={0.02} />
              <stop offset="100%" stopColor={NEG} stopOpacity={0.22} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={x} {...axis} minTickGap={24} />
          <YAxis {...axis} width={56} tickFormatter={(v) => fmt(f, v)} />
          <Tooltip content={<Tip f={f} xf="none" />} cursor={{ stroke: C.ink3, strokeDasharray: "3 3" }} />
          <Area type="stepAfter" dataKey="dd" name="Drawdown" stroke={NEG} strokeWidth={1.5} fill="url(#dd)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBars({ data, height, f = "r" }: { data: { key: string; value: number; n?: number }[]; height?: number; f?: Fmt }) {
  const h = height ?? Math.max(120, data.length * 34 + 20);
  return (
    <div style={{ height: h }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" {...axis} tickFormatter={(v) => fmt(f, v)} />
          <YAxis type="category" dataKey="key" {...axis} width={130} tick={{ fontSize: 12, fill: "#4d5361" }} />
          <ReferenceLine x={0} stroke={C.ink} strokeOpacity={0.25} />
          <Tooltip content={<Tip f={f} xf="none" />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
          <Bar dataKey="value" name="Total" radius={4} maxBarSize={18}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value >= 0 ? POS : NEG} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CountBars({ data, height = 200, color = C.s1, xLabel }: { data: { bucket: string; count: number; from?: number }[]; height?: number; color?: string; xLabel?: string }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="bucket" {...axis} interval="preserveStartEnd" minTickGap={10} />
          <YAxis {...axis} width={28} allowDecimals={false} />
          <Tooltip content={<Tip f="int" xf="none" />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
          <Bar dataKey="count" name={xLabel ?? "Trades"} radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.from != null ? (d.from >= 0 ? POS : NEG) : color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GroupedBars({ data, series, height = 240, f = "usd" }: { data: Record<string, unknown>[]; series: { key: string; label: string }[]; height?: number; f?: Fmt }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="24%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="name" {...axis} />
          <YAxis {...axis} width={56} tickFormatter={(v) => fmt(f, v)} />
          <Tooltip content={<Tip f={f} xf="none" />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={28} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
