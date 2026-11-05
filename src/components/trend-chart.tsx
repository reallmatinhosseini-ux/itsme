"use client";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const usd = (n: number) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const k = (n: number) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(1)}k` : usd(n));

function TipCard({ active, payload, label, name, color }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass glass-strong rounded-[11px] px-3 py-2 text-[12.5px] shadow-[var(--shadow-float)]">
      <div className="mb-0.5 text-[11px] font-medium text-ink-3">{label}</div>
      <div className="flex items-center gap-1.5 font-semibold text-ink">
        <span className="size-2 rounded-full" style={{ background: color }} />
        <span className="num">{usd(Number(payload[0].value))}</span>
        <span className="font-normal text-ink-3">{name}</span>
      </div>
    </div>
  );
}

export function TrendChart({
  data, color = "var(--color-accent)", goal, goalLabel, height = 210, name = "Value",
}: {
  data: { name: string; v: number }[];
  color?: string;
  goal?: number;
  goalLabel?: string;
  height?: number;
  name?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const vals = data.map((d) => d.v).concat(goal ?? []);
  const max = Math.max(...vals, 0) * 1.12 || 1;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 14, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.26} />
              <stop offset="100%" stopColor={color} stopOpacity={0.015} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="0" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} dy={6} minTickGap={18} />
          <YAxis tickFormatter={(v) => k(Number(v))} tickLine={false} axisLine={false} width={48} domain={[0, max]} />
          <Tooltip cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1, strokeDasharray: "4 4" }} content={(props) => <TipCard {...props} name={name} color={color} />} />
          {goal != null && (
            <ReferenceLine y={goal} stroke="var(--color-ink-3)" strokeDasharray="5 5" strokeWidth={1.5}
              label={{ value: goalLabel ?? usd(goal), position: "insideTopRight", fill: "var(--color-ink-3)", fontSize: 11, dy: -4 }} />
          )}
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2.5} fill={`url(#${gid})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-canvas)" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
