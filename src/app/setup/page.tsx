import { loadMission } from "@/lib/data";
import { hasPasscode } from "@/lib/auth";
import { SetupWizard } from "@/components/forms/setup-wizard";

export default async function Setup() {
  const m = await loadMission();
  return (
    <div className="flex min-h-[calc(100dvh-120px)] flex-col justify-center py-6">
      <div className="mx-auto mb-6 max-w-lg text-center">
        <div className="eyebrow mb-2">{m.settings.setupCompleted ? "Redo setup" : "Welcome"}</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.025em]">Let&apos;s set up your mission</h1>
        <p className="mt-1.5 text-[14px] text-ink-2">Four quick questions. Everything else is worked out for you.</p>
      </div>
      <SetupWizard templates={m.settings.templates} today={m.today} hasPasscode={await hasPasscode()} />
    </div>
  );
}
