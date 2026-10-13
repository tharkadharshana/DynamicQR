// Smart routing (Phase 10): content_data.rules = [{ if: {...}, url }]. First match wins, else destination_url.
// Pure: imported by the Worker (edge), the server (validation, dev redirect) and the editor.

export interface RouteCtx { device: string; os: string; country: string; lang: string; now: Date }
export interface Rule {
  if: { device?: string[]; os?: string[]; country?: string[]; lang?: string[]; days?: number[]; from?: string; to?: string; tz?: string };
  url: string;
}

export const DEVICES = ['mobile', 'tablet', 'desktop'];
export const OSES = ['iOS', 'Android', 'Windows', 'macOS', 'Linux', 'Other'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const okUrl = (u: unknown) => /^https?:\/\//i.test(String(u || ''));

/** Primary language subtag of an Accept-Language header: 'fil-PH,en;q=0.8' → 'fil'. */
export const primaryLang = (h: string) => (String(h || '').split(/[,;]/)[0].split('-')[0].trim().toLowerCase().match(/^[a-z]{2,3}$/) || [''])[0];

/** Device and OS from a User-Agent, country from Cloudflare, language from Accept-Language (primary subtag). */
export function routeCtx(ua: string, country: string, acceptLanguage: string, now = new Date()): RouteCtx {
  const os = /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux|CrOS/i.test(ua) ? 'Linux' : 'Other';
  const device = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? 'tablet'
    : /Mobi|iPhone|iPod|Android/i.test(ua) ? 'mobile' : 'desktop';
  return { device, os, country: String(country || '').toUpperCase(), lang: primaryLang(acceptLanguage), now };
}

/** Day of week (0 = Sunday) and "HH:MM" in a time zone (default Sri Lanka). */
function localTime(now: Date, tz = 'Asia/Colombo'): { day: number; hm: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  } catch { return localTime(now); }
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')), hm: `${get('hour')}:${get('minute')}` };
}

const inList = (list: unknown, v: string) => !Array.isArray(list) || !list.length || list.some(x => String(x).toLowerCase() === v.toLowerCase());

export function ruleMatches(rule: Rule, ctx: RouteCtx): boolean {
  const c = rule?.if || {};
  if (!inList(c.device, ctx.device) || !inList(c.os, ctx.os) || !inList(c.country, ctx.country) || !inList(c.lang, ctx.lang)) return false;
  if ((Array.isArray(c.days) && c.days.length) || c.from || c.to) {
    const { day, hm } = localTime(ctx.now, c.tz);
    if (Array.isArray(c.days) && c.days.length && !c.days.includes(day)) return false;
    const from = c.from || '00:00', to = c.to || '24:00';
    // An overnight window (22:00–06:00) wraps past midnight.
    if (from <= to ? !(hm >= from && hm < to) : !(hm >= from || hm < to)) return false;
  }
  return true;
}

/** The first matching rule's URL, or '' (the caller falls back to destination_url). */
export function pickRoute(rules: unknown, ctx: RouteCtx): string {
  if (!Array.isArray(rules)) return '';
  const hit = rules.find(r => r && okUrl(r.url) && ruleMatches(r, ctx));
  return hit ? hit.url : '';
}

/** Checks rules before they are saved. Returns an error message, or null. */
export function rulesError(rules: unknown): string | null {
  if (rules === undefined || rules === null) return null;
  if (!Array.isArray(rules) || rules.length > 20) return 'rules must be a list of at most 20 rules';
  for (const r of rules as any[]) {
    if (!r || typeof r !== 'object' || !okUrl(r.url)) return 'Each rule needs an http(s) url';
    const c = r.if || {};
    for (const k of ['device', 'os', 'country', 'lang'] as const) {
      if (c[k] !== undefined && (!Array.isArray(c[k]) || c[k].some((x: unknown) => typeof x !== 'string' || x.length > 20))) return `${k} must be a list of strings`;
    }
    if (c.days !== undefined && (!Array.isArray(c.days) || c.days.some((d: unknown) => !Number.isInteger(d) || (d as number) < 0 || (d as number) > 6))) return 'days must be 0 (Sunday) to 6';
    if ((c.from && !HHMM.test(c.from)) || (c.to && !HHMM.test(c.to) && c.to !== '24:00')) return 'from and to must be HH:MM';
    if (c.tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: c.tz }); } catch { return 'tz must be an IANA time zone'; } }
  }
  return null;
}

/** The app-store code as rules (Phase 6's preset): iPhone/iPad → App Store, Android → Play. */
export const appRules = (app: { ios?: string; android?: string }): Rule[] => [
  ...(okUrl(app?.ios) ? [{ if: { os: ['iOS'] }, url: app.ios! }] : []),
  ...(okUrl(app?.android) ? [{ if: { os: ['Android'] }, url: app.android! }] : []),
];

/** Self-check: npx tsx src/lib/routing.ts */
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('routing.ts')) {
  const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148';
  const pixel = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36';
  const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
  const ipad = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)';
  assert(routeCtx(iphone, 'lk', 'si-LK,si;q=0.9').os === 'iOS' && routeCtx(iphone, 'lk', '').device === 'mobile' && routeCtx(iphone, 'lk', 'si-LK').lang === 'si', 'iphone ctx');
  assert(routeCtx(iphone, '', 'fil-PH,en;q=0.8').lang === 'fil' && primaryLang('') === '' && primaryLang('*') === '' && primaryLang('SI') === 'si', 'primary language subtag');
  assert(routeCtx(ipad, '', '').device === 'tablet' && routeCtx(pixel, '', '').os === 'Android' && routeCtx(win, '', '').device === 'desktop', 'device and os');
  const rules: Rule[] = [
    { if: { os: ['iOS'] }, url: 'https://apps.apple.com/x' },
    { if: { country: ['LK'], device: ['desktop'] }, url: 'https://lk.example/desktop' },
    { if: { lang: ['ta'] }, url: 'https://example.com/ta' },
    { if: { days: [1, 2, 3, 4, 5], from: '09:00', to: '17:00' }, url: 'https://example.com/open' },
    { if: { from: '22:00', to: '06:00' }, url: 'https://example.com/night' },
  ];
  // 2026-10-14 is a Wednesday. 06:30 UTC = 12:00 in Colombo (UTC+5:30); 18:00 UTC = 23:30 in Colombo.
  const noon = new Date('2026-10-14T06:30:00Z'), late = new Date('2026-10-14T18:00:00Z'), sat = new Date('2026-10-17T06:30:00Z');
  assert(pickRoute(rules, routeCtx(iphone, 'US', 'en', noon)) === 'https://apps.apple.com/x', 'os rule first');
  assert(pickRoute(rules, routeCtx(win, 'LK', 'en', late)) === 'https://lk.example/desktop', 'country + device');
  assert(pickRoute(rules, routeCtx(pixel, 'IN', 'ta-IN', late)) === 'https://example.com/ta', 'language');
  assert(pickRoute(rules, routeCtx(pixel, 'IN', 'en', noon)) === 'https://example.com/open', 'weekday office hours in Colombo');
  assert(pickRoute(rules, routeCtx(pixel, 'IN', 'en', late)) === 'https://example.com/night', 'overnight window');
  assert(pickRoute(rules, routeCtx(pixel, 'IN', 'en', sat)) === '', 'no match → fallback');
  assert(pickRoute([{ if: {}, url: 'javascript:alert(1)' }], routeCtx(win, '', '')) === '' && pickRoute(null, routeCtx(win, '', '')) === '', 'unsafe or no rules');
  assert(pickRoute([{ if: { from: '00:00', to: '24:00', tz: 'UTC' }, url: 'https://a.lk' }], routeCtx(win, '', '', late)) === 'https://a.lk', 'all-day window, explicit tz');
  assert(rulesError(rules) === null && rulesError([{ if: {}, url: 'ftp://x' }]) && rulesError([{ if: { days: [7] }, url: 'https://a' }]) && rulesError([{ if: { tz: 'Mars/Base' }, url: 'https://a' }]), 'rulesError');
  assert(JSON.stringify(appRules({ ios: 'https://i', android: 'javascript:x' })) === '[{"if":{"os":["iOS"]},"url":"https://i"}]', 'app preset');
  console.log('routing self-check ok');
}
