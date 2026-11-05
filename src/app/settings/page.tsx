import os from "node:os";
import QRCode from "qrcode";
import { headers } from "next/headers";
import { loadMission } from "@/lib/data";
import { hasPasscode, isLocalHost } from "@/lib/auth";
import { Badge, Card, CardTitle, LinkButton, PageHeader } from "@/components/ui";
import { StrategyForm, DangerZone, DebtsForm, ListsForm, MissionForm, PasscodeForm, PolicyForm, RiskForm, ScenarioEditor, SignOutButton, SimulationForm, TemplatesEditor } from "@/components/forms/settings-forms";

function lanAddress(): string | null {
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list ?? []) if (i.family === "IPv4" && !i.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(i.address)) return i.address;
  return null;
}

export default async function Settings() {
  const m = await loadMission();
  const s = m.settings;
  const has = await hasPasscode();
  const host = (await headers()).get("host");
  const port = host?.split(":")[1] ?? "3100";
  const ip = lanAddress();
  const phoneUrl = ip ? `http://${ip}:${port}` : null;
  const qr = phoneUrl && has ? await QRCode.toString(phoneUrl, { type: "svg", margin: 0, color: { dark: "#0b0d12", light: "#00000000" } }) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Settings" title="Settings" />
      <div className="space-y-4">
        <Card>
          <CardTitle title="Phone access" right={has ? <Badge tone="good">On</Badge> : <Badge>Off</Badge>} />
          {has && phoneUrl && isLocalHost(host) && (
            <div className="mb-5 flex flex-col items-center gap-5 rounded-2xl bg-ink/[0.03] p-5 sm:flex-row sm:items-start">
              {qr && <div className="size-36 shrink-0 rounded-xl bg-fill p-3 shadow-[0_0_0_1px_var(--color-line)]" dangerouslySetInnerHTML={{ __html: qr }} />}
              <div className="text-[13.5px] leading-[21px] text-ink-2">
                <ol className="list-decimal space-y-1 pl-4">
                  <li>Connect your phone to the same Wi-Fi as this computer.</li>
                  <li>Scan the code, or open <b className="text-ink select-all">{phoneUrl}</b>.</li>
                  <li>Enter your passcode.</li>
                  <li>Add it to your Home Screen: iPhone Share → <i>Add to Home Screen</i>; Android menu → <i>Install app</i>.</li>
                </ol>
                <p className="mt-2 text-[12.5px] text-ink-3">Works while this computer is on and the app is running with <code className="rounded bg-ink/5 px-1">npm run phone</code>.</p>
              </div>
            </div>
          )}
          {!has && <p className="mb-4 text-[13.5px] text-ink-2">Set a passcode to open the app on your phone. Until you do, it only works on this computer.</p>}
          <PasscodeForm has={has} />
          {has && <div className="mt-3 border-t border-line pt-3"><SignOutButton /></div>}
        </Card>

        <Card>
          <CardTitle title="Strategy" hint="The rotation, how each payout is split, and the speed you're aiming for. The home screen re-plans when you save." />
          <StrategyForm s={s} />
        </Card>

        <Card>
          <CardTitle title="Debts" hint="Subtracted from net worth. Payouts go to these before any new challenge." />
          <DebtsForm s={s} />
        </Card>

        <Card>
          <CardTitle title="Start over" hint="Re-run the four setup questions. Your trades and accounts stay." right={<LinkButton href="/setup" size="sm">Redo setup</LinkButton>} />
        </Card>

        <details className="glass group">
          <summary className="flex cursor-pointer list-none items-center justify-between p-5">
            <span>
              <span className="block text-[14px] font-semibold">Advanced</span>
              <span className="block text-[12.5px] text-ink-3">Limits, policy, model assumptions, firm rules. The defaults are sensible.</span>
            </span>
            <span className="text-[12.5px] text-ink-3 group-open:hidden">Show</span>
            <span className="hidden text-[12.5px] text-ink-3 group-open:inline">Hide</span>
          </summary>
          <div className="space-y-8 border-t border-line p-5">
            <section><h3 className="mb-3 text-[14px] font-semibold">Mission</h3><MissionForm s={s} /></section>
            <section><h3 className="mb-3 text-[14px] font-semibold">Risk limits</h3><RiskForm s={s} /></section>
            <section><h3 className="mb-3 text-[14px] font-semibold">Scaling & payout policy</h3><PolicyForm s={s} /></section>
            <section><h3 className="mb-3 text-[14px] font-semibold">Scenario assumptions</h3><ScenarioEditor s={s} /></section>
            <section><h3 className="mb-3 text-[14px] font-semibold">Challenge templates</h3><TemplatesEditor s={s} /></section>
            <section><h3 className="mb-3 text-[14px] font-semibold">Simulation</h3><SimulationForm s={s} /></section>
            <section><h3 className="mb-3 text-[14px] font-semibold">Journal vocabulary</h3><ListsForm s={s} /></section>
            <section>
              <h3 className="mb-1 text-[14px] font-semibold">Data</h3>
              <p className="mb-3 text-[13px] text-ink-2">Stored on this computer in <code className="rounded bg-ink/5 px-1">data/</code>. Back up that folder to keep your history.</p>
              <DangerZone />
            </section>
          </div>
        </details>
      </div>
    </div>
  );
}
