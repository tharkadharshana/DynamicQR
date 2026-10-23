// What a provider call costs us, in USD. Prices are OpenAI's list prices as of AI_PRICES_AS_OF; a ledger row keeps the
// unit prices it was computed with, so a later price change never rewrites history. Update the tables when OpenAI changes prices.
export const AI_PRICES_AS_OF = '2026-10-22';

export interface TokenPrice { in: number; cachedIn: number; out: number } // USD per 1M tokens
export interface Usage { input_tokens?: number; output_tokens?: number; cached_tokens?: number }

export const TEXT_PRICES: Record<string, TokenPrice> = {
  'gpt-6.1-sol': { in: 2, cachedIn: 0.2, out: 10 },
  'gpt-6-luna': { in: 0.1, cachedIn: 0.01, out: 0.5 },
  'gpt-6-astra': { in: 10, cachedIn: 1, out: 50 },
};
// Image models bill tokens too (image tokens in and out).
export const IMAGE_PRICES: Record<string, TokenPrice> = {
  'gpt-image-2.5-flare': { in: 8, cachedIn: 2, out: 30 },
  'gpt-image-2.5-sunburst': { in: 8, cachedIn: 2, out: 30 },
};
// When a response carries no usage, a 1024x1024 image costs about this much per quality (OpenAI list estimates).
export const IMAGE_FALLBACK_USD: Record<string, number> = { low: 0.006, medium: 0.0133, high: 0.0528, xhigh: 0.094, max: 0.211 };

const WORST_TEXT = TEXT_PRICES['gpt-6-astra'];
const per = (tokens: number | undefined, usdPerM: number) => ((tokens || 0) * usdPerM) / 1_000_000;

/** Cost of a text call. An unknown model is priced like the most expensive one, so a typo never under-reports spend. */
export function textCost(model: string, u: Usage) {
  const price = TEXT_PRICES[model] || WORST_TEXT;
  const cached = Math.min(u.cached_tokens || 0, u.input_tokens || 0);
  const usd = per((u.input_tokens || 0) - cached, price.in) + per(cached, price.cachedIn) + per(u.output_tokens, price.out);
  return { usd: Math.round(usd * 1e6) / 1e6, unit: { ...price, known: !!TEXT_PRICES[model] } };
}

/** Cost of one image: from the token usage when the response has it, else the per-quality estimate. */
export function imageCost(model: string, quality: string, u: Usage | null) {
  const price = IMAGE_PRICES[model];
  const fallback = IMAGE_FALLBACK_USD[quality] ?? IMAGE_FALLBACK_USD.high;
  if (price && u && (u.input_tokens || u.output_tokens)) {
    const cached = Math.min(u.cached_tokens || 0, u.input_tokens || 0);
    const usd = per((u.input_tokens || 0) - cached, price.in) + per(cached, price.cachedIn) + per(u.output_tokens, price.out);
    return { usd: Math.round(usd * 1e6) / 1e6, unit: { ...price, known: true } };
  }
  return { usd: fallback, unit: { per_image: fallback, known: !!price, estimated: true } };
}

/** Self-check: npx tsx src/lib/aiPricing.ts */
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('aiPricing.ts')) {
  const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
  const t = textCost('gpt-6.1-sol', { input_tokens: 1000, output_tokens: 500 });
  assert(Math.abs(t.usd - (0.002 + 0.005)) < 1e-9, 'sol: 1000 in + 500 out = $0.007');
  assert(Math.abs(textCost('gpt-6.1-sol', { input_tokens: 1000, cached_tokens: 400, output_tokens: 0 }).usd - (600 * 2 + 400 * 0.2) / 1e6) < 1e-9, 'cached input is cheaper');
  assert(textCost('gpt-typo', { input_tokens: 1000, output_tokens: 0 }).usd === 0.01 && !textCost('gpt-typo', {}).unit.known, 'unknown model priced at the top rate');
  const i = imageCost('gpt-image-2.5-flare', 'medium', { input_tokens: 50, output_tokens: 439 });
  assert(Math.abs(i.usd - (50 * 8 + 439 * 30) / 1e6) < 1e-9, 'image from usage tokens');
  assert(imageCost('gpt-image-2.5-flare', 'medium', null).usd === 0.0133 && (imageCost('gpt-image-2.5-flare', 'medium', null).unit as any).estimated, 'image estimate without usage');
  console.log('aiPricing self-check ok');
}
