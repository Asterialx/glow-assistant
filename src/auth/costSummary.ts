type CostSample = { status: string; cost_usd: number | null; total_tokens: number | null };
/** Observed API cost, not a subscription quote or a guessed provider tariff. */
export function summarizeCosts(samples: CostSample[]) {
  const settled = samples.filter(item => item.status === "settled");
  const priced = settled.filter(item => typeof item.cost_usd === "number" && Number.isFinite(item.cost_usd)
    && item.cost_usd >= 0 && typeof item.total_tokens === "number" && item.total_tokens > 0);
  const dollars = priced.reduce((sum,item)=>sum+item.cost_usd!,0);
  const tokens = priced.reduce((sum,item)=>sum+item.total_tokens!,0);
  return { dollars, tokens, pricedRequests:priced.length, unknownRequests:settled.length-priced.length,
    per100k:tokens > 0 ? dollars/tokens*100000 : null };
}
