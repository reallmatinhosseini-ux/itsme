import Link from "next/link";
import { loadMission, liveProjection, scenarioProjections, yieldToStream } from "@/lib/data";
import { Assumption, Badge, Card, CardTitle, KV, cx } from "./ui";
import { prob, usd, compactUsd } from "@/lib/format";

/** Probability of Success. Shows "Insufficient data" rather than a fabricated number. */
export async function ProbabilityCard({ detailed = false }: { detailed?: boolean }) {
  await yieldToStream();
  const m = loadMission();
  const live = liveProjection(m);
  const scenarios = scenarioProjections(m);
  const need = m.settings.simulation.minTradesForMonteCarlo;
  const r = live.result;

  return (
    <Card className="h-full">
      <CardTitle
        title="Probability of Success"
        hint={`Reaching ${compactUsd(m.settings.targetAmount)} realized by ${new Date(m.settings.missionEnd + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
        right={r ? <Badge tone="accent">Monte Carlo · {r.paths.toLocaleString()} paths</Badge> : <Badge>Assumption-based only</Badge>}
      />
      {r ? (
        <>
          <div className="flex items-end gap-3">
            <div className="num text-[44px] leading-[48px] font-semibold tracking-[-0.04em]">{prob(r.probability)}</div>
            <div className="pb-1.5 text-[12px] leading-4 text-ink-3">
              from your {live.ctx.live!.n} trades
              <br />
              simulation range {prob(r.probabilityCI[0])}–{prob(r.probabilityCI[1])}
            </div>
          </div>
          <div className="mt-3 text-[12.5px] leading-[18px] text-ink-2">
            Projected final capital: median <b className="num text-ink">{usd(r.final.p50)}</b>, middle 50% {usd(r.final.p25)}–{usd(r.final.p75)}.
          </div>
        </>
      ) : (
        <>
          <div className="text-[30px] leading-9 font-semibold tracking-[-0.03em] text-ink-3">Insufficient data</div>
          <div className="mt-1.5 text-[12.5px] leading-[18px] text-ink-2">
            {m.closed.length}/{need} closed trades. A data-driven probability needs a real sample of your own R-multiples — until then only the labelled assumptions below exist.
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/85">
            <div className="h-full rounded-full bg-fill" style={{ width: `${Math.min(100, (m.closed.length / need) * 100)}%` }} />
          </div>
        </>
      )}
      <div className="mt-5 border-t border-line pt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="eyebrow">Scenario projections</span>
          <Assumption>assumptions</Assumption>
        </div>
        {scenarios.map((s) => (
          <KV
            key={s.key}
            k={<span>{s.scenario.label} <span className="text-ink-3">· {s.result.expectancyR.toFixed(2)}R/trade</span></span>}
            v={<span>{usd(s.result.final.p50)} <span className={cx("ml-1 text-[12px]", s.result.probability > 0.05 ? "text-ink-2" : "text-ink-3")}>P {prob(s.result.probability)}</span></span>}
          />
        ))}
        {detailed && live.ctx.seededFirstChallenge && <p className="mt-2 text-[12px] text-ink-3">No challenge recorded yet — projections assume you start the $6K challenge now.</p>}
        <Link href="/planning" className="mt-2 inline-block text-[12.5px] font-medium text-accent-ink hover:underline">Full model & sensitivity →</Link>
      </div>
    </Card>
  );
}

export function ProbabilitySkeleton() {
  return (
    <Card className="h-full">
      <div className="eyebrow">Probability of Success</div>
      <div className="mt-4 h-11 w-40 animate-pulse rounded-lg bg-ink/[0.06]" />
      <div className="mt-3 h-4 w-64 animate-pulse rounded bg-ink/[0.05]" />
      <div className="mt-6 space-y-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-ink/[0.04]" />)}
      </div>
      <div className="mt-3 text-[12px] text-ink-3">Running Monte Carlo simulation…</div>
    </Card>
  );
}
