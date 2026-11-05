"use server";

import Anthropic from "@anthropic-ai/sdk";
import { loadMission, onTrackText } from "@/lib/data";
import { findings, periodReport } from "@/lib/engine/insights";
import { weekKey, monthKey } from "@/lib/engine/util";

const SYSTEM = `You are the performance analyst inside a trader's personal mission-control app.
You receive a JSON object of statistics that the app computed from the trader's own journal.
Write a concise review (max ~250 words, plain prose with short headed sections: Summary, Evidence, Recommended focus).
Rules:
- Use only numbers that appear in the JSON. Never invent statistics, probabilities or market facts.
- Distinguish findings marked "significant" from "suggestive" or "anecdotal"; call small samples small.
- No psychological diagnoses. Refer to emotions only as the trader's own self-reported labels.
- Never recommend increasing position size or risk to meet a deadline. Recommendations must concern process, risk control or data collection.
- If the data is too thin to say anything, say so plainly.`;

export async function generateNarrative(period: "week" | "month", key: string): Promise<{ ok: boolean; text?: string; error?: string }> {
  const m = loadMission();
  const fn = period === "week" ? weekKey : monthKey;
  const report = periodReport(period, key, m.closed, m.scores, onTrackText(m), m.settings.risk.maxTradesPerDay);
  const payload = {
    period: report.label,
    trades_in_period: report.n,
    net_pnl_usd: +report.netPnl.toFixed(2),
    total_r: +report.totalR.toFixed(2),
    win_rate: +report.winRate.toFixed(3),
    avg_execution_score: report.avgScore,
    all_time: { trades: m.stats.n, expectancy_r: +m.stats.avgR.toFixed(3), expectancy_ci_95: m.stats.expectancyCI.map((x) => (Number.isFinite(x) ? +x.toFixed(3) : null)), win_rate: +m.stats.winRate.toFixed(3), max_drawdown_r: +m.stats.maxDrawdownR.toFixed(2) },
    findings: findings(m.closed.filter((t) => fn(t.day) <= key), m.settings.risk.maxTradesPerDay).map((f) => ({ title: f.title, detail: f.detail, n: f.n, strength: f.strength })),
    report_sections: { wentWell: report.wentWell, wentWrong: report.wentWrong, change: report.change, keep: report.keep, onTrack: report.onTrack },
    risk_alerts: m.alerts.map((a) => ({ level: a.level, title: a.title })),
  };

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: `Statistics:\n${JSON.stringify(payload, null, 2)}` }],
    });
    if (response.stop_reason === "refusal") return { ok: false, error: "The model declined to produce a summary for this data." };
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    return text ? { ok: true, text } : { ok: false, error: "Empty response." };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, error: "No valid Anthropic credentials. Set ANTHROPIC_API_KEY in .env.local (or run `ant auth login`) to enable AI summaries. All statistical insights work without it." };
    if (error instanceof Anthropic.RateLimitError) return { ok: false, error: "Rate limited — try again in a minute." };
    if (error instanceof Anthropic.APIError) return { ok: false, error: `API error ${error.status}: ${error.message}` };
    return { ok: false, error: error instanceof Error ? error.message : "Could not reach the Claude API." };
  }
}
