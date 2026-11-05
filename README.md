# $100K Mission Control

A personal trading & wealth operating system for the six-month $100K challenge: prop evaluations, funded accounts, payouts, personal capital, risk, journal, analytics and a Monte Carlo model of the whole mission. The audit of the original plan and the design decisions are in [docs/AUDIT.md](docs/AUDIT.md).

## Run it

```bash
npm install
npm run dev        # this computer only: http://localhost:3100
```

The first visit opens a four-step setup: cash, debts, first challenge and phone passcode.

### On your phone

1. On the computer, go to **Settings → Phone access** and set a passcode.
2. Run the phone server (same Wi-Fi as your phone):

```bash
npm run phone
```

3. Scan the QR code shown in Settings, sign in, then add the app to your Home Screen.

Without a passcode the app refuses other devices, and `npm run phone` won't start.

```bash
npm test                     # engine unit tests
npm run typecheck
```

Data lives in `data/mission.db` (SQLite) and `data/uploads/`. Back up the `data` folder.

## How it's organised

The everyday app has four screens: **Today** (the next thing to do and today's limits), **Journal**, **Progress** and **Money**. Everything else (risk details, analytics, the financial model, reports, challenge management) sits under **More**. The engine runs behind the scenes and only surfaces what matters.

Debts are subtracted from net worth. Payouts go to a debt before anything else, and no new challenge is bought until the debt is covered.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js 15 (App Router, React 19, Server Components + Server Actions) | One codebase for UI and data, so heavy simulations run on the server and stream in with Suspense |
| Language | TypeScript (strict) + Zod 4 | Every form and setting is validated at the boundary |
| Data | SQLite via better-sqlite3 + Drizzle ORM | Real persistence with no external service; Drizzle keeps a Postgres migration path open |
| UI | Tailwind CSS 4, hand-built component kit, Geist / Geist Mono / Instrument Serif | Light glass design system with tabular figures |
| Charts | Recharts 3 + custom SVG/HTML (calendar heatmap, timeline, fan) | Interactive, themeable, works with server-rendered data |
| AI | Anthropic SDK (`claude-opus-5-5`), optional | Narrative from computed statistics only, with server-side refusal fallback enabled |
| Auth | Optional passcode gate (middleware + httpOnly cookie) | Single-user, local-first |

## Architecture

```
src/lib/engine/   Pure, tested domain logic (no I/O)
  accounts.ts     Per-account state: stage balance, daily/max loss, min days, payout eligibility, breaches
  wealth.ts       Six money layers → realized net wealth; mission clock and pace
  stats.ts        Win rate (Wilson CI), expectancy (t-CI), PF, drawdown, streaks, breakdowns
  simulate.ts     Day-by-day Monte Carlo of the whole mission (rules, delays, payouts, scaling, correlation)
  payout.ts       Withdrawal-trigger scenarios (P(reach before breach), time, cash per period)
  allocation.ts   Scaling gate + explainable payout allocation
  risk.ts         Alerts, exposure (currency legs, idea de-duplication), daily execution score
  insights.ts     Evidence-graded findings + weekly/monthly reports
  advisor.ts      Next Best Action ranking
src/lib/data.ts   Loads DB → computes everything once per request; memoised projections
src/app/          12 sections + server actions (actions.ts)
```

## Honesty rules built into the code

- Prop balances never count as wealth. Only received payouts, refunds, fees, expenses and personal-account results move the goal.
- Probability of Success shows **"Insufficient data"** until there are 30 closed trades (configurable). Scenario projections are labelled assumptions.
- Evaluation pass rates come out of the simulation; they are never typed in as guesses.
- No recommendation ever increases risk to meet a deadline.
- Findings carry sample size and a significance grade. Emotional findings compare your own labels; nothing is diagnosed.
