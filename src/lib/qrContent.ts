// What a QR code encodes. Shared by the dashboard, the create/edit preview, the viewer modal and the server.
// Dynamic codes always encode the permanent short domain, never window.location (printed codes must not
// depend on which host the dashboard happened to be opened on).

// Vite only inlines `import.meta.env.VITE_*` written out in full; the typeof guard keeps Node (server, QA) safe.
import { waLink } from './site.js';

const ENV_DOMAIN = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_SHORT_DOMAIN : undefined;
export const SHORT_DOMAIN: string = (ENV_DOMAIN || 'https://scnr.tharkak.com').replace(/\/$/, '');

export const SHORT_HOST = SHORT_DOMAIN.replace(/^https?:\/\//, '');

// Team accounts with a verified custom domain encode that instead (set once the plan loads).
let activeDomain = SHORT_DOMAIN;
export function setShortDomain(hostname: string | null | undefined) {
  activeDomain = hostname ? `https://${hostname}` : SHORT_DOMAIN;
}
export const shortHost = () => activeDomain.replace(/^https?:\/\//, '');

export function vcardText(d: any = {}): string {
  return `BEGIN:VCARD\nVERSION:3.0\nN:${d.last_name || ''};${d.first_name || ''}\nFN:${d.first_name || ''} ${d.last_name || ''}\nTEL:${d.phone || ''}\nEMAIL:${d.email || ''}\nORG:${d.company || ''}\nURL:${d.website || ''}\nEND:VCARD`;
}

// Dot styles offered by the editor. Older codes stored 'diamond' and 'star'; they keep rendering.
export const DOT_STYLES = ['square', 'dots', 'rounded', 'classy', 'classy-rounded', 'extra-rounded'] as const;

/** A stored dot_style as one of DOT_STYLES (older codes stored 'diamond' and 'star'). */
export const normDotStyle = (d: unknown): string =>
  ({ diamond: 'classy', star: 'classy-rounded' } as Record<string, string>)[String(d)] || ((DOT_STYLES as readonly string[]).includes(String(d)) ? String(d) : 'square');

/** qr-code-styling options from a stored `style` (used by the editor preview, downloads and the viewer modal). */
export function stylingOptions(style: any = {}, data: string, size: number) {
  const dotType = normDotStyle(style.dot_style);
  const cornerType = ({ dot: 'dot', rounded: 'extra-rounded' } as any)[style.corner_style] || 'square';
  const cornerDot = style.corner_dot_style === 'dot' || style.corner_dot_style === 'square'
    ? style.corner_dot_style : cornerType === 'extra-rounded' ? 'dot' : cornerType;
  const color = style.dot_color || '#000000';
  // Optional linear gradient from dot_color to gradient_color.
  const gradient = /^#[0-9a-f]{6}$/i.test(style.gradient_color || '')
    ? { type: 'linear', rotation: Math.PI / 4, colorStops: [{ offset: 0, color }, { offset: 1, color: style.gradient_color }] }
    : undefined;
  return {
    width: size,
    height: size,
    data,
    shape: style.shape === 'circle' ? 'circle' : 'square',
    image: style.logo_url || undefined,
    dotsOptions: { color, type: dotType, gradient },
    cornersSquareOptions: { type: cornerType, color },
    cornersDotOptions: { type: cornerDot, color },
    backgroundOptions: { color: style.bg_color || '#FFFFFF' },
    imageOptions: { crossOrigin: 'anonymous', margin: 5, imageSize: 0.4 },
    qrOptions: { errorCorrectionLevel: style.error_correction || 'M' },
  } as any;
}

/** Shrink an uploaded logo to <= maxPx (PNG data URL) so the QR save stays far below the 100 KB API body limit. */
export function resizeLogo(file: File, maxPx = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale) || maxPx;
      canvas.height = Math.round(img.height * scale) || maxPx;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = URL.createObjectURL(file);
  });
}

export function getQRContent(qr: any, shortDomain: string = activeDomain): string {
  if (qr.is_dynamic !== false && qr.gtin) return `${shortDomain}${gs1Path(qr.gtin, qr.content_data?.batch)}`;
  if (qr.is_dynamic !== false) return `${shortDomain}/${qr.slug}`;
  const d = qr.content_data || {};
  switch (qr.qr_type) {
    case 'vcard': return vcardText(d);
    case 'wifi': return `WIFI:S:${d.ssid || ''};T:${d.encryption || 'WPA'};P:${d.password || ''};;`;
    case 'text': return d.text || '';
    case 'email': return `mailto:${d.email || ''}?subject=${encodeURIComponent(d.subject || '')}&body=${encodeURIComponent(d.body || '')}`;
    default: return qr.destination_url || '';
  }
}

// ── URL code types ────────────────────────────────────────────────────────────
// These store qr_type 'url' with content_data.kind = <type> and destination_url = buildDestination(...),
// like WhatsApp, so the Worker and analytics need nothing new.
export const SOCIALS: Record<string, (h: string) => string> = {
  instagram: h => `https://www.instagram.com/${h}`,
  facebook: h => `https://www.facebook.com/${h}`,
  tiktok: h => `https://www.tiktok.com/@${h}`,
  youtube: h => `https://www.youtube.com/@${h}`,
  linkedin: h => `https://www.linkedin.com/in/${h}`,
  x: h => `https://x.com/${h}`,
};

/** "@name", "name" or a pasted profile URL → "name". Only handle-safe characters survive. */
export const cleanHandle = (h: unknown) =>
  String(h || '').trim().replace(/^https?:\/\/[^/]+\//i, '').replace(/^@/, '').split(/[/?#]/)[0].replace(/[^\w.-]/g, '');

/** The destination a URL-type code redirects to, or '' when the required input is missing. */
export function buildDestination(kind: string, d: any = {}): string {
  const enc = encodeURIComponent;
  const phone = String(d.phone || '').replace(/[^\d+]/g, '');
  if (Object.hasOwn(SOCIALS, kind)) { const h = cleanHandle(d.handle); return h ? SOCIALS[kind](h) : ''; }
  switch (kind) {
    case 'google_review': return d.place_id ? `https://search.google.com/local/writereview?placeid=${enc(String(d.place_id).trim())}` : '';
    case 'phone': return phone ? `tel:${phone}` : '';
    case 'sms': return phone ? `sms:${phone}${d.body ? `?body=${enc(d.body)}` : ''}` : '';
    case 'location': {
      const q = d.lat !== undefined && d.lat !== '' && d.lng !== undefined && d.lng !== '' ? `${Number(d.lat)},${Number(d.lng)}` : String(d.address || '').trim();
      return q && q !== 'NaN,NaN' ? `https://maps.google.com/?q=${enc(q)}` : '';
    }
    case 'whatsapp': return phone ? waLink(phone, d.text || '') : '';
    case 'pdf': return /^https:\/\//.test(d.file_url || '') ? d.file_url : '';
    default: return d.url || '';
  }
}

// ── GS1 Digital Link ──────────────────────────────────────────────────────────
/** GTIN-8/12/13/14 with a valid mod-10 check digit. */
export function gtinValid(g: unknown): boolean {
  const s = String(g || '');
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(s)) return false;
  const digits = s.split('').map(Number), check = digits.pop()!;
  const sum = digits.reverse().reduce((t, n, i) => t + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
/** GS1 Digital Link path: /01/<GTIN-14>[/10/<batch>]. */
export const gs1Path = (gtin: string, batch?: string) =>
  `/01/${String(gtin).padStart(14, '0')}${batch ? `/10/${encodeURIComponent(batch)}` : ''}`;

// ── Frames ────────────────────────────────────────────────────────────────────
export const FRAME_TEXTS = ['Scan me', 'Menu', 'Review us', 'Pay here', 'Wi-Fi'];

/**
 * Wrap a QR SVG (as qr-code-styling's getRawData('svg') returns it) in a rounded frame with a call-to-action
 * band. Composed at download time, so the stored code and its preview stay plain.
 */
export function framedSvg(qrSvg: string, size: number, frame: { text?: string; color?: string } = {}): string {
  const pad = Math.round(size * 0.06), band = Math.round(size * 0.18), w = size + pad * 2, h = size + pad * 2 + band;
  const color = /^#[0-9a-f]{6}$/i.test(frame.color || '') ? frame.color : '#1A1916';
  const text = String(frame.text || 'Scan me').slice(0, 24).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const inner = qrSvg.replace(/<\?xml[^>]*>/, '').replace(/<svg\b/, `<svg x="${pad}" y="${pad}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<rect width="${w}" height="${h}" rx="${pad}" fill="${color}"/>`
    + `<rect x="${pad / 2}" y="${pad / 2}" width="${size + pad}" height="${size + pad}" rx="${pad / 2}" fill="#fff"/>`
    + inner
    + `<text x="${w / 2}" y="${size + pad * 1.5 + band / 2}" fill="#fff" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="${Math.round(band * 0.42)}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${text}</text>`
    + `</svg>`;
}

// ── Short links (Phase 8) ─────────────────────────────────────────────────────
// One list for the Worker (pass-through) and the server (custom back-halves), so a slug never shadows a route.
export const RESERVED_SLUGS = new Set([
  '', 'create', 'edit', 'kit', 'bulk', 'analytics', 'settings', 'billing', 'pricing', 'api-docs', 'login', 'logout',
  'signup', 'legal', 'pages', 'forms', 'links', 'tools', 'whats-new', 'help', 'support', 'admin', 'account',
  'dashboard', 'app', 'www', 'static', 'public', 'docs', 'blog', 'features', 'status',
]);
export const CUSTOM_SLUG_RE = /^[A-Za-z0-9-]{3,40}$/;
/** A custom back-half that would collide with a route or a pass-through prefix (api*, internal*, assets*). */
export const isReservedSlug = (s: string) => RESERVED_SLUGS.has(s.toLowerCase()) || /^(api|internal|assets)/i.test(s);
/** The editor's message for a typed back-half, or '' when it is fine (or empty). */
export const slugProblem = (s: string) =>
  !s ? '' : !CUSTOM_SLUG_RE.test(s) ? 'Use 3–40 letters, numbers or dashes.' : isReservedSlug(s) ? `"${s}" is reserved. Pick another back-half.` : '';

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
/** Append UTM tags from content_data.utm ({source, medium, …}); a parameter already in the URL wins. */
export function withUtm(url: string, utm: any): string {
  if (!utm || typeof utm !== 'object') return url;
  let u: URL;
  try { u = new URL(url); } catch { return url; }
  if (!/^https?:$/.test(u.protocol)) return url;
  let added = false;
  for (const k of UTM_KEYS) {
    const v = utm[k.slice(4)];
    if (v && !u.searchParams.has(k)) { u.searchParams.set(k, String(v).slice(0, 100)); added = true; }
  }
  return added ? u.toString() : url; // untouched when nothing is added, so signed or unusual URLs stay byte-for-byte
}

/** Tags: lower-case, trimmed, unique, at most 10 of up to 30 characters; null when the input is not an array. */
export function normTags(t: unknown): string[] | null {
  if (!Array.isArray(t)) return null;
  return [...new Set(t.map(x => String(x).trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 30)).filter(Boolean))].slice(0, 10);
}

/** Self-check: npx tsx src/lib/qrContent.ts */
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('qrContent.ts')) {
  const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
  assert(buildDestination('instagram', { handle: '@scnr.lk' }) === 'https://www.instagram.com/scnr.lk', 'instagram');
  assert(buildDestination('tiktok', { handle: 'https://www.tiktok.com/@cafe?x=1' }) === 'https://www.tiktok.com/@cafe', 'tiktok from url');
  assert(buildDestination('x', { handle: '<script>' }) === 'https://x.com/script', 'handle is sanitised');
  assert(buildDestination('google_review', { place_id: 'ChIJ123' }) === 'https://search.google.com/local/writereview?placeid=ChIJ123', 'review');
  assert(buildDestination('phone', { phone: '+94 77 123 4567' }) === 'tel:+94771234567', 'phone');
  assert(buildDestination('sms', { phone: '0771234567', body: 'Hi there' }) === 'sms:0771234567?body=Hi%20there', 'sms');
  assert(buildDestination('location', { lat: '6.9271', lng: '79.8612' }) === 'https://maps.google.com/?q=6.9271%2C79.8612', 'location latlng');
  assert(buildDestination('location', { address: 'Galle Face, Colombo' }) === 'https://maps.google.com/?q=Galle%20Face%2C%20Colombo', 'location address');
  assert(buildDestination('whatsapp', { phone: '+94 77 123 4567', text: 'Hi' }) === 'https://wa.me/94771234567?text=Hi', 'whatsapp');
  assert(buildDestination('pdf', { file_url: 'javascript:alert(1)' }) === '' && buildDestination('phone', {}) === '', 'empty when invalid');
  assert(gtinValid('4006381333931') && gtinValid('96385074') && gtinValid('00012345600012'), 'valid GTINs');
  assert(!gtinValid('4006381333932') && !gtinValid('abc') && !gtinValid('123'), 'invalid GTINs');
  assert(gs1Path('4006381333931', 'L 1') === '/01/04006381333931/10/L%201', 'gs1 path');
  assert(getQRContent({ slug: 'abcdefg', gtin: '4006381333931' }, 'https://s.lk') === 'https://s.lk/01/04006381333931', 'gs1 content');
  const f = framedSvg('<?xml version="1.0"?><svg width="100" height="100"></svg>', 100, { text: '<Menu>' });
  assert(f.includes('<svg x="6" y="6" width="100"') && f.includes('&lt;Menu&gt;') && !f.includes('<?xml'), 'frame wraps and escapes');
  assert(stylingOptions({ shape: 'circle', gradient_color: '#ff0000', dot_style: 'diamond' }, 'x', 10).dotsOptions.type === 'classy', 'legacy dot style');
  assert(stylingOptions({ shape: 'circle', gradient_color: '#ff0000' }, 'x', 10).shape === 'circle', 'circle');
  assert(withUtm('https://a.lk/p?utm_source=keep&x=1', { source: 'qr', medium: 'print' }) === 'https://a.lk/p?utm_source=keep&x=1&utm_medium=print', 'utm keeps existing params');
  assert(withUtm('https://example.com', { source: '' }) === 'https://example.com', 'utm: nothing added → unchanged');
  assert(withUtm('tel:+94', { source: 'qr' }) === 'tel:+94' && withUtm('https://a.lk', null) === 'https://a.lk', 'utm only on http(s)');
  assert(JSON.stringify(normTags([' Menu ', 'menu', 'A<b>', '', 1])) === '["menu","ab","1"]' && normTags('x') === null, 'tags');
  assert(isReservedSlug('Pricing') && isReservedSlug('api-x') && !isReservedSlug('menu-2026') && CUSTOM_SLUG_RE.test('menu-2026') && !CUSTOM_SLUG_RE.test('a/b'), 'reserved slugs');
  // ponytail: every top-level route in App.tsx must be reserved; read the file when run from the repo root.
  const fs = (process as any).getBuiltinModule?.('node:fs');
  if (fs?.existsSync('src/App.tsx')) {
    const routes = [...fs.readFileSync('src/App.tsx', 'utf8').matchAll(/path="\/?([^"/:*]*)/g)].map((m: string[]) => m[1]);
    for (const r of routes) assert(RESERVED_SLUGS.has(r), `App.tsx route "${r}" is not in RESERVED_SLUGS`);
  }
  console.log('qrContent self-check ok');
}
