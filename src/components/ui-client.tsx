"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { buttonClass, cx, type ButtonVariant } from "./ui";
import type { ActionState } from "@/app/actions";

export function Sheet({ trigger, title, description, children, variant = "primary", size = "md", open: controlled, onOpenChange }: {
  trigger?: ReactNode;
  title: string;
  description?: ReactNode;
  children: (close: () => void) => ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setInner(o));
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <>
      {trigger && (
        <button type="button" className={buttonClass(variant, size)} onClick={() => setOpen(true)}>
          {trigger}
        </button>
      )}
      <dialog ref={ref} className="sheet" onClose={() => setOpen(false)} onClick={(e) => e.target === ref.current && setOpen(false)}>
        {open && (
          <div className="glass glass-strong flex max-h-[calc(100dvh-48px)] flex-col overflow-hidden" style={{ boxShadow: "var(--shadow-float)" }}>
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 pt-5 pb-4">
              <div>
                <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
                {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5">{children(() => setOpen(false))}</div>
          </div>
        )}
      </dialog>
    </>
  );
}

/**
 * Server-action form state without React 19's automatic form reset, so a validation
 * error never wipes what the user typed.
 */
export function useActionForm(fn: (prev: ActionState, fd: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(fn, null);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return { state, onSubmit, pending };
}

export function SubmitButton({ children, variant = "primary", className, pending: forced }: { children: ReactNode; variant?: ButtonVariant; className?: string; pending?: boolean }) {
  const status = useFormStatus();
  const pending = forced ?? status.pending;
  return (
    <button type="submit" disabled={pending} className={cx(buttonClass(variant), className)}>
      {pending && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <div className={cx("flex items-center gap-2 rounded-[10px] px-3 py-2 text-[13px]", state.ok ? "bg-good-soft text-good-ink" : "bg-crit-soft text-crit-ink")} role="status">
      {state.ok ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
      {state.ok ? state.message : state.error}
    </div>
  );
}

/** Button that runs a server action after an inline confirmation step. */
export function ConfirmButton({ action, children, confirm = "Are you sure?", variant = "ghost", size = "sm" }: { action: () => Promise<unknown>; children: ReactNode; confirm?: string; variant?: ButtonVariant; size?: "sm" | "md" }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  if (asking)
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-[12px] text-ink-2">{confirm}</span>
        <button type="button" className={buttonClass("danger", "sm")} disabled={pending} onClick={() => start(async () => { await action(); setAsking(false); })}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Confirm"}
        </button>
        <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setAsking(false)}>
          Cancel
        </button>
      </span>
    );
  return (
    <button type="button" className={buttonClass(variant, size)} onClick={() => setAsking(true)}>
      {children}
    </button>
  );
}

export function ActionButton({ action, children, variant = "secondary", size = "sm" }: { action: () => Promise<unknown>; children: ReactNode; variant?: ButtonVariant; size?: "sm" | "md" }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className={buttonClass(variant, size)} disabled={pending} onClick={() => start(async () => void (await action()))}>
      {pending && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}
