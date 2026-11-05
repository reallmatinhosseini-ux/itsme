import { Lock } from "lucide-react";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; locked?: string }> }) {
  const { error, locked } = await searchParams;
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="glass w-full max-w-sm p-7" style={{ boxShadow: "var(--shadow-float)" }}>
        <div className="mb-5 grid size-11 place-items-center rounded-[12px] bg-fill text-fill-fg"><span className="text-[12px] font-bold num">50K</span></div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Mission Control</h1>
        {locked ? (
          <div className="mt-3 flex gap-2.5 rounded-xl bg-ink/[0.04] p-3.5 text-[13.5px] leading-5 text-ink-2">
            <Lock className="mt-0.5 size-4 shrink-0" />
            <span>Phone access is off. On your computer, open <b className="text-ink">Settings → Phone access</b> and set a passcode, then reload this page.</span>
          </div>
        ) : (
          <form action="/api/login" method="post">
            <p className="mt-1 text-[13.5px] text-ink-3">Enter your passcode.</p>
            <input name="passcode" type="password" inputMode="text" autoFocus autoComplete="current-password" className="field mt-5" aria-invalid={!!error} placeholder="Passcode" />
            {error && <p className="mt-2 text-[12.5px] text-crit-ink">Incorrect passcode.</p>}
            <button className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[12px] bg-fill text-[15px] font-medium text-fill-fg">Unlock</button>
          </form>
        )}
      </div>
    </div>
  );
}
