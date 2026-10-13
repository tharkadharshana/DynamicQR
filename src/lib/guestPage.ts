// Renders what a scan of a non-URL dynamic code shows. Pure: no DOM, no Node APIs.
// Shared by the Cloudflare Worker (production) and the Express dev redirect.
// `.js` extension: Vercel runs the server as Node ESM, which does not resolve extensionless paths.
import { vcardText, buildDestination, SOCIALS } from './qrContent.js';

export type Lang = 'en' | 'si' | 'ta';
export type Rendered =
  | { kind: 'html'; body: string }
  | { kind: 'vcard'; body: string; filename: string }
  | { kind: 'ics'; body: string; filename: string }
  | { kind: 'redirect'; location: string };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
// Only links a guest can safely open. Anything else (javascript:, data:) is dropped.
const safeUrl = (u: unknown) => (/^(https?:\/\/|tel:|mailto:)/i.test(String(u || '')) ? String(u) : '');

const UI: Record<Lang, Record<string, string>> = {
  en: { offer: "Today's offer", wifi: 'Wi-Fi', network: 'Network', password: 'Password', copy: 'Copy', copied: 'Copied', powered: 'Made with Scnr', phone: 'Phone', email: 'Email', address: 'Address', website: 'Website', save: 'Save as contact' },
  si: { offer: 'අද දීමනාව', wifi: 'Wi-Fi', network: 'ජාලය', password: 'මුරපදය', copy: 'පිටපත් කරන්න', copied: 'පිටපත් විය', powered: 'Scnr සමඟ සාදන ලදී', phone: 'දුරකථනය', email: 'ඊමේල්', address: 'ලිපිනය', website: 'වෙබ් අඩවිය', save: 'සම්බන්ධතාවය සුරකින්න' },
  ta: { offer: 'இன்றைய சலுகை', wifi: 'Wi-Fi', network: 'நெட்வொர்க்', password: 'கடவுச்சொல்', copy: 'நகலெடு', copied: 'நகலெடுக்கப்பட்டது', powered: 'Scnr மூலம் உருவாக்கப்பட்டது', phone: 'தொலைபேசி', email: 'மின்னஞ்சல்', address: 'முகவரி', website: 'இணையதளம்', save: 'தொடர்பைச் சேமி' },
};

export const FILE_TYPES = { vcard: 'text/vcard; charset=utf-8', ics: 'text/calendar; charset=utf-8' } as const;

/** App-store code: iPhone/iPad → ios URL, Android → android URL, else '' (the caller falls back to destination_url). */
export function appTarget(app: any, ua: string): string {
  if (!app) return '';
  if (/iPhone|iPad|iPod/i.test(ua)) return safeUrl(app.ios);
  if (/Android/i.test(ua)) return safeUrl(app.android);
  return '';
}

/** ?lang= wins, then Accept-Language, then English. */
export function pickLang(query: string | null, acceptLanguage: string | null): Lang {
  const q = (query || '').toLowerCase();
  if (q === 'si' || q === 'ta' || q === 'en') return q;
  const a = (acceptLanguage || '').toLowerCase();
  if (a.startsWith('si')) return 'si';
  if (a.startsWith('ta')) return 'ta';
  return 'en';
}

const shell = (title: string, lang: Lang, inner: string, accent = '#2B4A3A', css = '') => `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Sinhala:wght@400;600&family=Noto+Sans+Tamil:wght@400;600&display=swap">
<style>
  body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans Sinhala','Noto Sans Tamil',sans-serif;background:#FFF8F2;color:#24180F}
  .top{background:${accent};color:#fff;padding:28px 20px 20px;position:relative}
  .top h1{margin:0;font-size:24px} .top p{margin:4px 0 0;opacity:.85;font-size:14px}
  .langs{position:absolute;top:12px;right:12px;display:flex;gap:4px}
  .langs a{color:#fff;text-decoration:none;font-size:12px;font-weight:700;padding:4px 9px;border-radius:999px;background:rgba(255,255,255,.15)}
  .langs a.on{background:#fff;color:${accent}}
  main{padding:16px;display:grid;gap:10px;max-width:480px;margin:0 auto}
  .offer{background:#F6D9B8;border-radius:14px;padding:14px 16px}
  .offer small{font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.7} .offer b{display:block;font-size:16px;margin-top:2px}
  a.btn{display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid #EADFD3;border-radius:12px;padding:15px 16px;font-weight:600;color:#24180F;text-decoration:none}
  a.btn span{color:#B9A592;font-size:18px}
  .box{background:#fff;border:1px solid #EADFD3;border-radius:12px;padding:14px 16px;display:grid;gap:6px}
  .row{display:flex;justify-content:space-between;gap:10px;align-items:center}
  button{font:inherit;border:0;background:${accent};color:#fff;border-radius:8px;padding:6px 12px;cursor:pointer}
  pre{white-space:pre-wrap;word-break:break-word;font:inherit;margin:0}
  footer{text-align:center;font-size:11px;color:#9C8B7A;padding:20px}${css}
</style>
</head>
<body>${inner}
<script>document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(b.dataset.copy).then(()=>{b.textContent=b.dataset.done})})</script>
</body>
</html>`;

const wifiBox = (ssid: string, password: string, t: Record<string, string>) => `
  <div class="box"><b>${esc(t.wifi)}</b>
    <div class="row"><span>${esc(t.network)}: <b>${esc(ssid)}</b></span></div>
    ${password ? `<div class="row"><span>${esc(t.password)}: <b>${esc(password)}</b></span><button data-copy="${esc(password)}" data-done="${esc(t.copied)}">${esc(t.copy)}</button></div>` : ''}
  </div>`;

// iCalendar text escaping (RFC 5545 §3.3.11) and floating local times from datetime-local strings.
const icsEsc = (s: unknown) => String(s ?? '').replace(/[\\;,]/g, m => `\\${m}`).replace(/\r?\n/g, '\\n');
const icsTime = (s: unknown) => String(s || '').replace(/[-:]/g, '').replace(/\.\d+$/, '').padEnd(15, '0').slice(0, 15);

// RFC 5545 line folding. ponytail: folds at 74 characters, not octets; fine for ASCII, a long Sinhala line may run over.
const fold = (l: string) => (l.length <= 75 ? l : l.match(/.{1,74}/g)!.join('\r\n '));

/** An event code downloads one VEVENT. Times are floating (the guest's local time), as typed in the editor. */
export function icsText(d: any = {}, uid = 'scnr'): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Scnr//Event//EN', 'BEGIN:VEVENT',
    `UID:${icsEsc(uid)}@scnr`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${icsTime(d.start)}`, ...(d.end ? [`DTEND:${icsTime(d.end)}`] : []),
    `SUMMARY:${icsEsc(d.title)}`, ...(d.location ? [`LOCATION:${icsEsc(d.location)}`] : []),
    ...(d.description ? [`DESCRIPTION:${icsEsc(d.description)}`] : []), ...(safeUrl(d.url) ? [`URL:${safeUrl(d.url)}`] : []),
    'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n');
}

// ── Pages builder (Phase 7): content_data.blocks[] ────────────────────────────
export const BLOCK_KINDS = ['header', 'socials', 'button', 'text', 'image', 'video', 'products', 'contact', 'offer', 'wifi', 'divider'] as const;
const hex = (c: unknown, d: string) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c) : d);
const https = (u: unknown) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');
const FONTS: Record<string, string> = {
  system: "system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans Sinhala','Noto Sans Tamil',sans-serif",
  serif: "Georgia,'Times New Roman','Noto Sans Sinhala','Noto Sans Tamil',serif",
  mono: "ui-monospace,Menlo,Consolas,monospace",
};

/** The block list for a language: `i18n[lang].blocks[i]` overrides fields of block i, like the Kit's labels. */
export function pageBlocks(d: any, lang: Lang = 'en'): any[] {
  const tr = (d?.i18n && d.i18n[lang] && Array.isArray(d.i18n[lang].blocks)) ? d.i18n[lang].blocks : [];
  return (Array.isArray(d?.blocks) ? d.blocks : []).map((b: any, i: number) => ({ ...b, ...(tr[i] || {}) }));
}

/** YouTube or Vimeo URL → privacy-friendly embed URL, else ''. */
export function videoEmbed(u: unknown): string {
  const s = String(u || '');
  const yt = s.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = s.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return vm ? `https://player.vimeo.com/video/${vm[1]}` : '';
}

/**
 * Click target for a tracked link: key "i" (button / image block i) or "i-j" (item j of a socials or products block).
 * Used by the renderer and by the Worker's /<slug>/l/<key> route, so a click can only reach a link that is on the page.
 */
export function blockTarget(d: any, key: string): { url: string; label: string } | null {
  const m = String(key).match(/^(\d{1,3})(?:-(\d{1,3}))?$/);
  const b = m && pageBlocks(d)[Number(m[1])];
  if (!b) return null;
  const item = m![2] !== undefined && Array.isArray(b.items) ? b.items[Number(m![2])] : null;
  if (b.kind === 'button' && m![2] === undefined) return safeUrl(b.url) ? { url: safeUrl(b.url), label: b.label || 'Button' } : null;
  if (b.kind === 'image' && m![2] === undefined) return safeUrl(b.link) ? { url: safeUrl(b.link), label: b.alt || 'Image' } : null;
  if (b.kind === 'socials' && item && SOCIALS[item.network]) {
    const url = buildDestination(item.network, item);
    return url ? { url, label: item.network } : null;
  }
  if (b.kind === 'products' && item) return safeUrl(item.url) ? { url: safeUrl(item.url), label: item.title || 'Product' } : null;
  return null;
}

/** The contact block as a vCard ("Save as contact"), or null when the page has none. */
export function pageVcard(d: any): string | null {
  const blocks = pageBlocks(d);
  const c = blocks.find(b => b.kind === 'contact');
  if (!c) return null;
  const name = c.name || blocks.find(b => b.kind === 'header')?.name || d.name || '';
  return vcardText({ first_name: name, phone: c.phone, email: c.email, website: c.website, company: c.company });
}

function renderBlocks(config: any, d: any, lang: Lang, t: Record<string, string>, langLinks: string): string {
  const track = (key: string, url: string) => (config.slug ? `/${encodeURIComponent(config.slug)}/l/${key}` : url);
  return pageBlocks(d, lang).map((b: any, i: number) => {
    switch (b.kind) {
      case 'header': {
        const av = https(b.avatar);
        return `<div class="top hdr">${langLinks}${av ? `<img class="av" src="${esc(av)}" alt="">` : ''}<h1>${esc(b.name)}</h1>${b.tagline ? `<p>${esc(b.tagline)}</p>` : ''}</div>`;
      }
      case 'socials': {
        const items = (Array.isArray(b.items) ? b.items : []).map((it: any, j: number) => {
          const tgt = blockTarget(d, `${i}-${j}`);
          return tgt ? `<a class="soc" href="${esc(track(`${i}-${j}`, tgt.url))}" rel="noopener">${esc(it.network)}</a>` : '';
        }).join('');
        return items ? `<div class="socs">${items}</div>` : '';
      }
      case 'button': {
        const tgt = blockTarget(d, String(i));
        return tgt && b.label ? `<a class="btn" href="${esc(track(String(i), tgt.url))}" rel="noopener">${esc(b.label)}<span>›</span></a>` : '';
      }
      case 'text': return b.text ? `<div class="box"><pre>${esc(b.text)}</pre></div>` : '';
      case 'image': {
        const src = https(b.url);
        if (!src) return '';
        const img = `<img class="img" src="${esc(src)}" alt="${esc(b.alt)}" loading="lazy">`;
        const tgt = blockTarget(d, String(i));
        return tgt ? `<a href="${esc(track(String(i), tgt.url))}" rel="noopener">${img}</a>` : img;
      }
      case 'video': {
        const src = videoEmbed(b.url);
        return src ? `<div class="vid"><iframe src="${esc(src)}" title="${esc(b.title || 'Video')}" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>` : '';
      }
      case 'products': {
        const items = (Array.isArray(b.items) ? b.items : []).map((it: any, j: number) => {
          const img = https(it.image), tgt = blockTarget(d, `${i}-${j}`);
          const card = `${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<div class="ph"></div>'}<b>${esc(it.title)}</b>${it.price ? `<small>${esc(it.price)}</small>` : ''}`;
          return tgt ? `<a class="prod" href="${esc(track(`${i}-${j}`, tgt.url))}" rel="noopener">${card}</a>` : `<div class="prod">${card}</div>`;
        }).join('');
        return items ? `${b.title ? `<h2>${esc(b.title)}</h2>` : ''}<div class="prods">${items}</div>` : '';
      }
      case 'contact': {
        const row = (label: string, v: unknown, href: string) => v ? `<div class="row"><span>${esc(label)}</span>${href ? `<a href="${esc(href)}">${esc(v)}</a>` : `<b>${esc(v)}</b>`}</div>` : '';
        const phone = String(b.phone || '').replace(/[^\d+]/g, '');
        return `<div class="box">${row(t.phone, b.phone, phone ? `tel:${phone}` : '')}${row(t.email, b.email, b.email ? `mailto:${b.email}` : '')}${row(t.address, b.address, '')}${row(t.website, safeUrl(b.website), safeUrl(b.website))}
          <a class="btn save" href="?vcf=1">${esc(t.save)}<span>↓</span></a></div>`;
      }
      case 'offer': return b.text ? `<div class="offer"><small>${esc(b.title || t.offer)}</small><b>${esc(b.text)}</b></div>` : '';
      case 'wifi': return b.ssid ? wifiBox(b.ssid, b.password || '', t) : '';
      case 'divider': return '<hr>';
      default: return '';
    }
  }).join('\n');
}

/** config: the cached gate config (qr_type, content_data, title, branding). url: the scanned URL (for language links). */
export function renderGuestPage(config: any, lang: Lang, url: string): Rendered | null {
  const d = config.content_data || {};
  const t = UI[lang];
  const footer = config.branding ? `<footer>${esc(t.powered)}</footer>` : '';
  switch (config.qr_type) {
    case 'vcard':
      return { kind: 'vcard', body: vcardText(d), filename: `${(d.first_name || 'contact').replace(/[^\w-]/g, '')}.vcf` };
    case 'event':
      return { kind: 'ics', body: icsText(d, config.slug), filename: `${String(d.title || 'event').replace(/[^\w-]/g, '').slice(0, 40) || 'event'}.ics` };
    case 'email':
      return { kind: 'redirect', location: `mailto:${d.email || ''}?subject=${encodeURIComponent(d.subject || '')}&body=${encodeURIComponent(d.body || '')}` };
    case 'text':
      return { kind: 'html', body: shell(config.title || 'Message', lang, `<main><div class="box"><pre>${esc(d.text)}</pre></div></main>${footer}`) };
    case 'wifi':
      return { kind: 'html', body: shell(d.ssid || 'Wi-Fi', lang, `<main>${wifiBox(d.ssid || '', d.password || '', t)}</main>${footer}`) };
    case 'page': {
      const tr = (d.i18n && d.i18n[lang]) || {};
      if (Array.isArray(d.blocks) && d.blocks.length) {
        if (new URL(url).searchParams.get('vcf') === '1') {
          const vcf = pageVcard(d);
          if (vcf) return { kind: 'vcard', body: vcf, filename: 'contact.vcf' };
        }
        const th = d.theme || {}, accent = hex(th.accent, '#2B4A3A'), bg = hex(th.bg, '#FFF8F2'), fg = hex(th.text, '#24180F');
        const radius = ({ square: '4px', pill: '999px' } as Record<string, string>)[th.button] || '12px';
        const css = `body{background:${bg};color:${fg};font-family:${FONTS[th.font] || FONTS.system}}
  a.btn{border-radius:${radius};color:${fg}} .hdr{text-align:center} .av{width:84px;height:84px;border-radius:50%;object-fit:cover;border:3px solid #fff}
  h2{font-size:15px;margin:8px 0 0} hr{border:0;border-top:1px solid #EADFD3;width:100%}
  .socs{display:flex;flex-wrap:wrap;gap:8px;justify-content:center} .soc{padding:8px 12px;border-radius:999px;background:${accent};color:#fff;text-decoration:none;font-size:13px;font-weight:600;text-transform:capitalize}
  .img{width:100%;border-radius:12px;display:block} .vid{position:relative;padding-top:56.25%} .vid iframe{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:12px}
  .prods{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px} .prod{flex:0 0 150px;scroll-snap-align:start;background:#fff;border:1px solid #EADFD3;border-radius:12px;padding:8px;color:${fg};text-decoration:none;display:grid;gap:4px}
  .prod img,.prod .ph{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;background:${accent}22} .prod small{opacity:.7} .row a{color:${accent}} .save{margin-top:6px}`;
        const header = pageBlocks(d).find((b: any) => b.kind === 'header');
        const hasLangs = !!(d.i18n && (d.i18n.si || d.i18n.ta));
        const u = new URL(url);
        const langLink = (l: Lang, label: string) => { u.searchParams.set('lang', l); return `<a class="${l === lang ? 'on' : ''}" href="${esc(u.pathname + u.search)}">${label}</a>`; };
        const langLinks = hasLangs ? `<div class="langs">${langLink('en', 'EN')}${langLink('si', 'සිං')}${langLink('ta', 'தமி')}</div>` : '';
        return { kind: 'html', body: shell(header?.name || config.title || 'Page', lang, `<main>${renderBlocks(config, d, lang, t, langLinks)}</main>${footer}`, accent, css) };
      }
      const name = tr.name || d.name || config.title || '';
      const subtitle = tr.subtitle || d.subtitle || '';
      const offer = (tr.offer && tr.offer.text) ? tr.offer : d.offer;
      const labels: string[] = Array.isArray(tr.labels) ? tr.labels : [];
      const u = new URL(url);
      const langLink = (l: Lang, label: string) => { u.searchParams.set('lang', l); return `<a class="${l === lang ? 'on' : ''}" href="${esc(u.pathname + u.search)}">${label}</a>`; };
      const links = (Array.isArray(d.links) ? d.links : [])
        .map((l: any, i: number) => ({ ...l, label: labels[i] || l.label, url: safeUrl(l.url) }))
        .filter((l: any) => l.url && l.label)
        .map((l: any) => `<a class="btn" href="${esc(l.url)}" rel="noopener">${esc(l.label)}<span>›</span></a>`).join('');
      const inner = `
<div class="top">
  <div class="langs">${langLink('en', 'EN')}${langLink('si', 'සිං')}${langLink('ta', 'தமி')}</div>
  <h1>${esc(name)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
</div>
<main>
  ${offer && offer.text ? `<div class="offer"><small>${esc(offer.title || t.offer)}</small><b>${esc(offer.text)}</b></div>` : ''}
  ${links}
  ${d.wifi && d.wifi.ssid ? wifiBox(d.wifi.ssid, d.wifi.password || '', t) : ''}
</main>${footer}`;
      return { kind: 'html', body: shell(name, lang, inner, /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : undefined) };
    }
    default:
      return null; // 'url': the Worker redirects
  }
}

/** One assert-based self-check; run with: npx tsx src/lib/guestPage.ts */
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('guestPage.ts')) {
  const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
  const cfg = { qr_type: 'page', title: 'Café', branding: true, content_data: {
    name: 'Café <Lagoon>', offer: { text: 'Kottu 20% off' },
    links: [{ label: 'Menu', url: 'https://x.lk/menu' }, { label: 'Evil', url: 'javascript:alert(1)' }],
    i18n: { si: { name: 'කැෆේ', labels: ['මෙනුව'] } } } };
  const en = renderGuestPage(cfg, 'en', 'https://s.lk/abcdefg') as any;
  assert(en.kind === 'html' && en.body.includes('Café &lt;Lagoon&gt;'), 'escapes name');
  assert(!en.body.includes('javascript:'), 'drops unsafe links');
  assert(en.body.includes('Made with Scnr'), 'free branding footer');
  const si = renderGuestPage(cfg, 'si', 'https://s.lk/abcdefg') as any;
  assert(si.body.includes('කැෆේ') && si.body.includes('මෙනුව'), 'sinhala overrides');
  assert(pickLang(null, 'ta-LK,ta;q=0.9') === 'ta' && pickLang('si', 'en') === 'si', 'pickLang');
  assert((renderGuestPage({ qr_type: 'vcard', content_data: { first_name: 'A' } }, 'en', 'https://s.lk/x') as any).kind === 'vcard', 'vcard');
  const ics = renderGuestPage({ qr_type: 'event', content_data: { title: 'Launch; party, 2', start: '2026-11-01T18:30', end: '2026-11-01T21:00', url: 'javascript:x' } }, 'en', 'https://s.lk/x') as any;
  assert(ics.kind === 'ics' && ics.body.includes('DTSTART:20261101T183000') && ics.body.includes('SUMMARY:Launch\\; party\\, 2'), 'ics: ' + ics.body);
  assert(!ics.body.includes('javascript') && ics.filename === 'Launchparty2.ics', 'ics: unsafe url dropped, filename');
  const app = { ios: 'https://apps.apple.com/app/id1', android: 'https://play.google.com/store/apps/details?id=x' };
  assert(appTarget(app, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)') === app.ios && appTarget(app, 'Linux; Android 14') === app.android, 'app routing');
  assert(appTarget(app, 'Windows NT 10.0') === '' && appTarget({ ios: 'javascript:x' }, 'iPhone') === '' && appTarget(null, 'iPhone') === '', 'app fallback');
  const long = icsText({ title: 'x', start: '2026-01-01T10:00', description: 'y'.repeat(200) });
  assert(long.split('\r\n').every(l => l.length <= 75) && long.includes('\r\n y'), 'ics folds long lines');
  // Pages builder: every block renders, escapes, and drops unsafe URLs.
  const X = '<x>"', J = 'javascript:alert(1)';
  const blocks = [
    { kind: 'header', name: X, tagline: X, avatar: J },
    { kind: 'socials', items: [{ network: 'instagram', handle: '@cafe' }, { network: 'evil', handle: 'x' }] },
    { kind: 'button', label: X, url: 'https://ok.lk/b' }, { kind: 'button', label: 'Bad', url: J },
    { kind: 'text', text: X }, { kind: 'image', url: 'https://img.lk/a.png', alt: X, link: J },
    { kind: 'video', url: 'https://youtu.be/dQw4w9WgXcQ' }, { kind: 'video', url: J },
    { kind: 'products', title: X, items: [{ title: X, price: 'LKR 900', image: J, url: 'https://shop.lk/1' }, { title: 'p2', url: J }] },
    { kind: 'contact', phone: '+94 77 1', email: 'a@b.lk', address: X, website: J },
    { kind: 'offer', text: X }, { kind: 'wifi', ssid: X, password: 'pw' }, { kind: 'divider' },
  ];
  const pg = { qr_type: 'page', slug: 'abcdefg', title: 'T', content_data: { blocks, theme: { accent: '#ff0000', bg: 'red;}', button: 'pill' } } };
  const html = (renderGuestPage(pg, 'en', 'https://s.lk/abcdefg') as any).body as string;
  assert(!html.includes('<x>') && html.includes('&lt;x&gt;&quot;'), 'blocks escape text');
  assert(!html.includes('javascript:'), 'blocks drop javascript: URLs');
  assert(html.includes('href="/abcdefg/l/2"') && !html.includes('/l/3"'), 'button tracked; unsafe button dropped');
  assert(html.includes('href="/abcdefg/l/1-0"') && !html.includes('/l/1-1'), 'socials tracked; unknown network dropped');
  assert(html.includes('href="/abcdefg/l/8-0"') && !html.includes('/l/8-1') && !html.includes('/l/5'), 'products tracked; unsafe links dropped');
  assert(html.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ') && html.includes('?vcf=1') && html.includes('<hr>'), 'video, contact, divider');
  assert(html.includes('#ff0000') && !html.includes('red;}') && html.includes('999px'), 'theme: valid colours only');
  assert(blockTarget(pg.content_data, '2')?.url === 'https://ok.lk/b' && blockTarget(pg.content_data, '3') === null && blockTarget(pg.content_data, '99') === null && blockTarget(pg.content_data, '../x') === null, 'blockTarget');
  assert(blockTarget(pg.content_data, '1-0')?.url === 'https://www.instagram.com/cafe', 'blockTarget social');
  const vc = renderGuestPage(pg, 'en', 'https://s.lk/abcdefg?vcf=1') as any;
  assert(vc.kind === 'vcard' && vc.body.includes('TEL:+94 77 1') && vc.body.includes('EMAIL:a@b.lk'), 'save as contact');
  const tr = { ...pg, content_data: { ...pg.content_data, i18n: { si: { blocks: [{ name: 'සිං' }] } } } };
  assert((renderGuestPage(tr, 'si', 'https://s.lk/abcdefg') as any).body.includes('<h1>සිං</h1>'), 'per-block translation');
  assert(!(renderGuestPage({ ...pg, slug: undefined }, 'en', 'https://s.lk/p') as any).body.includes('/l/2'), 'preview (no slug) links directly');
  // Kit pages without blocks must render byte-for-byte as before the Pages builder (hash of the pre-Phase-7 output).
  const kit = { qr_type: 'page', title: 'Café', branding: true, content_data: { name: 'Café <Lagoon>', subtitle: 'Galle', color: '#123456', offer: { text: 'Kottu' }, links: [{ label: 'Menu', url: 'https://x.lk/m' }, { label: 'Bad', url: 'javascript:1' }], wifi: { ssid: 'W', password: 'p' }, i18n: { si: { name: 'කැෆේ', labels: ['මෙනුව'] } } } };
  globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode((renderGuestPage(kit, 'si', 'https://s.lk/abc') as any).body)).then(buf => {
    const h = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    assert(h === '4892ea289ea5518269dc5aeee8cd95781ea851fe09f23054f827203399096c76', 'legacy Kit page output changed: ' + h);
    console.log('guestPage self-check ok');
  });
}
