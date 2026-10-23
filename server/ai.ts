// OpenAI calls for the Restaurant Kit (menu from a prompt, menu from a file), page images and AI-made templates.
// Plain fetch, no SDK. Every function returns the provider's usage so the caller can write the cost ledger.
import { MENU_SCHEMA } from '../src/lib/menu.js';
import type { Usage } from '../src/lib/aiPricing.js';

export class AiError extends Error {
  constructor(public status: number, message: string, public code = 'AI_PROVIDER', public detail = '') { super(message); }
}

export const aiConfig = () => ({
  key: process.env.OPENAI_API_KEY || '',
  base: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  textModel: process.env.OPENAI_TEXT_MODEL || 'gpt-6.1-sol',
  imageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare',
  imageQuality: process.env.OPENAI_IMAGE_QUALITY || 'medium',
});

async function post(path: string, body: unknown, ms = 90_000): Promise<any> {
  const c = aiConfig();
  if (!c.key) throw new AiError(503, 'AI is not set up on this server.', 'AI_DISABLED');
  let res: Response;
  try {
    res = await fetch(`${c.base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  } catch {
    throw new AiError(502, 'The AI service did not answer in time. Try again.', 'AI_TIMEOUT');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new AiError(502, 'The AI service could not complete that request. Try again.', 'AI_PROVIDER', `${res.status} ${String(json?.error?.message || '').slice(0, 300)}`);
  return json;
}

export interface Billed<T> { data: T; usage: Usage; model: string; quality?: string; size?: string }

const chatUsage = (u: any): Usage => ({ input_tokens: u?.prompt_tokens || 0, output_tokens: u?.completion_tokens || 0, cached_tokens: u?.prompt_tokens_details?.cached_tokens || 0 });

/** One chat completion that must answer with JSON. `schema` turns on strict structured outputs; without it the model answers with a JSON object. */
async function chatJson(content: any[], system: string, schema?: { name: string; schema: unknown }): Promise<Billed<any>> {
  const c = aiConfig();
  const json = await post('/chat/completions', {
    model: c.textModel,
    messages: [{ role: 'system', content: system }, { role: 'user', content }],
    max_completion_tokens: 6000,
    response_format: schema ? { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.schema } } : { type: 'json_object' },
  });
  const raw = json?.choices?.[0]?.message?.content;
  let data: any = null;
  try { data = JSON.parse(raw); } catch { /* the caller treats null as "unusable answer" */ }
  return { data, usage: chatUsage(json?.usage), model: json?.model || c.textModel };
}

export interface MenuRequest { name: string; cuisine?: string; description?: string; categories?: string[]; currency?: string; prices?: boolean; dietary?: string[]; language?: string; notes?: string }

const MENU_SYSTEM = `You write restaurant menus for businesses in Sri Lanka. Answer only with JSON that matches the schema.
Use the requested categories in that order (if none are given, choose 4 to 6 sensible ones). Give 4 to 8 items per category, with realistic dishes for the cuisine.
Each description is one short sentence, at most 90 characters. Write prices as text in the requested currency, for example "LKR 650", or an empty string when prices are turned off.
Never invent a restaurant name, address or phone number. Use the requested language for names and descriptions.`;

export async function generateMenu(r: MenuRequest) {
  return chatJson([{ type: 'text', text: JSON.stringify({ business: r.name, about: r.description || '', cuisine: r.cuisine || 'Sri Lankan', categories: r.categories || [], currency: r.currency || 'LKR', prices: r.prices !== false, dietary: r.dietary || [], language: r.language || 'English', notes: r.notes || '' }) }],
    MENU_SYSTEM, { name: 'menu', schema: MENU_SCHEMA });
}

/** Read a menu from a photo or PDF. `b64` is the file's bytes in base64. */
export async function importMenu(file: { mime: string; b64: string; filename: string }) {
  const part = file.mime === 'application/pdf'
    ? { type: 'file', file: { filename: file.filename, file_data: `data:application/pdf;base64,${file.b64}` } }
    : { type: 'image_url', image_url: { url: `data:${file.mime};base64,${file.b64}` } };
  return chatJson([{ type: 'text', text: 'Extract the menu from this file. Keep the original section names, item names, descriptions and prices exactly as written (prices as text including the currency). Skip anything that is not a menu item.' }, part],
    'You read restaurant menus from documents and photos. Answer only with JSON that matches the schema. If the file has no menu, answer with an empty sections list.', { name: 'menu', schema: MENU_SCHEMA });
}

export async function generateImage(prompt: string): Promise<Billed<Buffer>> {
  const c = aiConfig();
  const size = '1024x1024';
  const json = await post('/images/generations', { model: c.imageModel, prompt, size, quality: c.imageQuality, n: 1, output_format: 'webp', output_compression: 80 }, 120_000);
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new AiError(502, 'The AI service returned no image. Try again.', 'AI_PROVIDER', 'no b64_json');
  const u = json?.usage || {};
  return { data: Buffer.from(b64, 'base64'), usage: { input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0, cached_tokens: u.input_tokens_details?.cached_tokens || 0 }, model: c.imageModel, quality: c.imageQuality, size };
}

const TEMPLATE_SYSTEM = `You design mobile landing pages (link-in-bio style) for small businesses. Answer only with a JSON object:
{"name": string (max 40), "description": string (one sentence, max 90), "category": one of "Link in Bio" | "Business & Services" | "Restaurant & Food" | "Promotions & Events" | "Real Estate", "tags": up to 4 of "link in bio","business","restaurant","promo","event","real estate","minimal","dark mode",
 "content": {"theme": {"accent": "#RRGGBB", "bg": "#RRGGBB", "bg2": "#RRGGBB" (optional gradient end), "text": "#RRGGBB", "card": "#RRGGBB" (optional), "line": "#RRGGBB" (optional), "header": "plain" (optional), "button": "rounded"|"pill"|"square", "font": "system"|"serif"},
  "blocks": [3 to 8 blocks, each one of:
   {"kind":"header","name":string,"tagline":string,"emoji":string}, {"kind":"button","label":string,"url":"https://"}, {"kind":"text","text":string},
   {"kind":"socials","items":[{"network":"instagram"|"facebook"|"tiktok"|"youtube"|"x"|"linkedin","handle":""}]}, {"kind":"offer","title":string,"text":string},
   {"kind":"contact","phone":"","email":"","address":""}, {"kind":"products","title":string,"items":[{"title":string,"price":string,"url":"https://"}]},
   {"kind":"menu","sections":[{"name":string,"items":[{"name":string,"description":string,"price":string}]}]}, {"kind":"wifi","ssid":"","password":""}, {"kind":"divider"}]}}
Use only these block kinds. The first block is a header. Keep text readable: dark text on light backgrounds, light text on dark ones. No real phone numbers or addresses.`;

export async function generateTemplate(prompt: string) {
  return chatJson([{ type: 'text', text: prompt }], TEMPLATE_SYSTEM);
}
