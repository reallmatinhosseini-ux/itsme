import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, CircleDashed } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-rise">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2 text-accent-ink">{eyebrow}</div>}
        <h1 className="text-[30px] leading-[36px] font-semibold tracking-[-0.03em] text-ink text-balance">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[14px] leading-[22px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className, pad = true, as: As = "section" }: { children: ReactNode; className?: string; pad?: boolean; as?: "section" | "div" | "article" }) {
  return <As className={cx("glass min-w-0", pad && "p-5", className)}>{children}</As>;
}

export function CardTitle({ title, hint, right, className }: { title: ReactNode; hint?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-[12.5px] leading-[18px] text-ink-3">{hint}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, size = "md", className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const sz = { sm: "text-[17px] leading-6", md: "text-[22px] leading-7", lg: "text-[30px] leading-9", xl: "text-[44px] leading-[48px]" }[size];
  return (
    <div className={cx("min-w-0", className)}>
      <div className="eyebrow mb-1.5 truncate">{label}</div>
      <div className={cx("num font-semibold tracking-[-0.03em]", sz, tone ?? "text-ink")}>{value}</div>
      {sub && <div className="mt-1 text-[12.5px] leading-[18px] text-ink-3">{sub}</div>}
    </div>
  );
}

type BadgeTone = "neutral" | "accent" | "good" | "warn" | "crit" | "dark";
export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  const t: Record<BadgeTone, string> = {
    neutral: "bg-ink/[0.05] text-ink-2",
    accent: "bg-accent-soft text-accent-ink",
    good: "bg-good-soft text-good-ink",
    warn: "bg-warn-soft text-warn-ink",
    crit: "bg-crit-soft text-crit-ink",
    dark: "bg-fill text-fill-fg",
  };
  return <span className={cx("inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11.5px] font-medium whitespace-nowrap", t[tone], className)}>{children}</span>;
}

export function StatusIcon({ level, className }: { level: "critical" | "warning" | "info" | "good" | "pending"; className?: string }) {
  const c = cx("size-4 shrink-0", className);
  if (level === "critical") return <OctagonAlert className={cx(c, "text-crit")} aria-label="Critical" />;
  if (level === "warning") return <AlertTriangle className={cx(c, "text-warn")} aria-label="Warning" />;
  if (level === "good") return <CheckCircle2 className={cx(c, "text-good")} aria-label="OK" />;
  if (level === "pending") return <CircleDashed className={cx(c, "text-ink-4")} aria-label="Pending" />;
  return <Info className={cx(c, "text-accent")} aria-label="Info" />;
}

const btn = {
  primary: "bg-fill text-fill-fg hover:bg-fill shadow-[0_1px_2px_rgb(0_0_0/0.12),0_0_0_1px_rgb(0_0_0/0.9)]",
  secondary: "bg-ink/10 text-ink hover:bg-fill shadow-[0_0_0_1px_var(--color-line-strong),0_1px_2px_rgb(16_24_40/0.04)]",
  ghost: "text-ink-2 hover:bg-ink/[0.05] hover:text-ink",
  danger: "bg-ink/10 text-crit-ink hover:bg-crit-soft shadow-[0_0_0_1px_var(--color-line-strong)]",
};
export type ButtonVariant = keyof typeof btn;
export const buttonClass = (variant: ButtonVariant = "secondary", size: "sm" | "md" = "md") =>
  cx(
    "inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-[background,box-shadow,transform,color] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap",
    size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-[13.5px]",
    btn[variant],
  );

export function LinkButton({ href, children, variant = "secondary", size = "md" }: { href: string; children: ReactNode; variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <Link href={href} className={buttonClass(variant, size)}>
      {children}
    </Link>
  );
}

export function Progress({ value, tone = "ink", className, marker }: { value: number; tone?: "ink" | "accent" | "good" | "warn" | "crit"; className?: string; marker?: number }) {
  const v = Math.max(0, Math.min(100, value));
  const bg = { ink: "bg-fill", accent: "bg-fill", good: "bg-good", warn: "bg-warn", crit: "bg-crit" }[tone];
  return (
    <div className={cx("relative h-1.5 w-full overflow-hidden rounded-full bg-ink/85", className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full transition-[width] duration-700 ease-out", bg)} style={{ width: `${v}%` }} />
      {marker != null && <div className="absolute top-[-2px] bottom-[-2px] w-[2px] rounded bg-ink/[0.05]" style={{ left: `calc(${Math.max(0, Math.min(100, marker))}% - 1px)` }} />}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 grid size-11 place-items-center rounded-2xl bg-ink/10 text-ink-3 shadow-[0_0_0_1px_var(--color-line)]">{icon}</div>}
      <div className="text-[14px] font-semibold text-ink">{title}</div>
      {children && <div className="mt-1 max-w-sm text-[13px] leading-5 text-ink-3">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Assumption({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-ink/20 px-1.5 py-px text-[11px] font-medium text-ink-2" title="Assumption — not measured from your data">
      <span className="size-1.5 rounded-full bg-warn" />
      {children}
    </span>
  );
}

export function KV({ k, v, tone }: { k: ReactNode; v: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[13px]">
      <span className="text-ink-2">{k}</span>
      <span className={cx("num text-right font-medium", tone ?? "text-ink")}>{v}</span>
    </div>
  );
}

export function Ring({ value, size = 120, stroke = 10, tone = "var(--color-ink)", track = "rgb(15 23 42 / 0.07)", children }: { value: number; size?: number; stroke?: number; tone?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Field({ label, name, error, hint, children, className }: { label: string; name?: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block min-w-0", className)} htmlFor={name}>
      <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[12px] text-crit-ink">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-ink-3">{hint}</span> : null}
    </label>
  );
}

export function Segmented({ items, active }: { items: { href: string; label: string }[]; active: string }) {
  return (
    <div className="inline-flex rounded-[11px] bg-ink/[0.05] p-[3px]">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          scroll={false}
          className={cx("rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium transition-all", active === i.label ? "bg-fill text-ink shadow-[0_1px_2px_rgb(16_24_40/0.08),0_0_0_1px_rgb(15_23_42/0.04)]" : "text-ink-2 hover:text-ink")}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

export function Strength({ s }: { s: "significant" | "suggestive" | "anecdotal" }) {
  return s === "significant" ? <Badge tone="dark">Significant</Badge> : s === "suggestive" ? <Badge tone="accent">Suggestive</Badge> : <Badge>Anecdotal</Badge>;
}
