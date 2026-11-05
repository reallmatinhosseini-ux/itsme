# Workflow audit — the $100K Challenge

Prepared 31 Oct 2026. Rules are from FundedNext's official help centre ([Stellar 2-Step Challenge](https://help.fundednext.com/en/articles/17255124-stellar-2-step-challenge)), read the same day. Every number below is either from that page or from the app's Monte Carlo model with clearly labelled assumptions. None of it is a forecast of your results.

## Verified rules (FundedNext Stellar 2-Step)

| Item | Rule |
| --- | --- |
| Targets | Phase 1 8%, Phase 2 5%, no time limit |
| Daily loss | 5% of initial balance |
| Max loss | 10% static (balance/equity never below 90% of initial) |
| Min trading days | 5 per phase (removable via add-on on $6K–$25K only) |
| Funded risk cap | Max 3% open risk at any time |
| On-Demand payout | 90% split; account growth ≥2%; best day ≤40% of profit |
| Fee refund | Challenge fee refunded with the first reward |
| Quick Strike | Profit from trades closed within 30s must stay <30% |
| News | Funded: only 40% of profit within ±5 min of high-impact news counts |
| Copy trading | Prohibited when it involves FundedNext (funded) accounts |
| EAs | Not permitted on $50K+ accounts |
| KYC | Must be approved within 30 days of passing; ID + possibly proof of address |
| List prices | $6K $59.99 · $15K $119.99 · $25K $199.99 · $50K $299.99 · $100K $549.99 · $200K $999.99 |
| Payout option | Chosen at checkout, cannot be changed |

**Check these yourself before buying**: age and country eligibility (not stated on the rules page), payout methods available in your country, the total allocation cap (the app assumes $300K), and tax treatment of payouts.

## Findings

1. **$100K realized in six months is not mathematically likely at sustainable risk.** From a $6K start, with base-case assumptions (0.21R per trade, 0.5% risk, 1.5 trades a day), the median six-month outcome is about **$300**. The optimistic case (0.46R, 0.75% risk) gives a median of about **$6.6K** (90% range ~$0.9K–$18K). Holding base risk and frequency, even 1.25R per trade gives a median of about $26K and essentially 0% chance of $100K. The bottleneck is time: two phases with 5-day minimums, KYC, and payout cycles use up months before funded capital can compound.
2. **A two-week Phase 1 implies ~1.6R per trading day** at 0.5% risk (8% = 16R over 10 days). That timeline pushes toward oversizing. There is no time limit, so the plan drops the deadline for evaluations.
3. **A $500 first payout needs ~8.2% growth on the $6K** ($490 × 90% + $59.99 refund). That is most of the 10% loss allowance, held at risk, and it also has to meet the 40% best-day cap. The app recommends a ~4% trigger (≈$276 including refund). Its withdrawal-scenario table picks the trigger that maximises expected cash per unit time among those reachable with ≥50% probability.
4. **The $50K is $299.99 at list price, not $240.** The allocation calculator handles the shortfall: it buys the largest challenge the fee budget allows ($25K/$15K) or waits for another payout.
5. **Funded + personal accounts are mostly one bet.** Same trader, same ideas, same day. The model correlates accounts at ρ=0.8. The Risk Center de-duplicates ideas, breaks exposure into currency legs, and flags identical trades on multiple funded accounts (also a FundedNext rules risk).
6. **Scaling is gated on evidence, not on a schedule:** ≥30 trades, positive expectancy, no critical alerts, execution score ≥70. Until the gate passes, payouts go to reserve rather than a personal live account, and new challenges are capped at $25K.

## What the system optimises for instead

Realized wealth, measured honestly, plus a process that survives: fixed risk, a daily stop, a checklist on every trade, a review every day, and a scaling decision made from your own data once there is enough of it. Probability of Success switches from assumptions to your trades automatically at 30 closed trades and shows "Insufficient data" before that.
