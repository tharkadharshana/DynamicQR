// Renders what a scan of a non-URL dynamic code shows. Pure: no DOM, no Node APIs.
// Shared by the Cloudflare Worker (production) and the Express dev redirect.
import { vcardText } from './qrContent';

export type Lang = 'en' | 'si' | 'ta';
export type Rendered =
  | { kind: 'html'; body: string }
  | { kind: 'vcard'; body: string; filename: string }
  | { kind: 'redirect'; location: string };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
// Only links a guest can safely open. Anything else (javascript:, data:) is dropped.
const safeUrl = (u: unknown) => (/^(https?:\/\/|tel:|mailto:)/i.test(String(u || '')) ? String(u) : '');

const UI: Record<Lang, Record<string, string>> = {
  en: { offer: "Today's offer", wifi: 'Wi-Fi', network: 'Network', password: 'Password', copy: 'Copy', copied: 'Copied', powered: 'Made with Scnr' },
  si: { offer: 'අද දීමනාව', wifi: 'Wi-Fi', network: 'ජාලය', password: 'මුරපදය', copy: 'පිටපත් කරන්න', copied: 'පිටපත් විය', powered: 'Scnr සමඟ සාදන ලදී' },
  ta: { offer: 'இன்றைய சலுகை', wifi: 'Wi-Fi', network: 'நெட்வொர்க்', password: 'கடவுச்சொல்', copy: 'நகலெடு', copied: 'நகலெடுக்கப்பட்டது', powered: 'Scnr மூலம் உருவாக்கப்பட்டது' },
};

/** ?lang= wins, then Accept-Language, then English. */
export function pickLang(query: string | null, acceptLanguage: string | null): Lang {
  const q = (query || '').toLowerCase();
  if (q === 'si' || q === 'ta' || q === 'en') return q;
  const a = (acceptLanguage || '').toLowerCase();
  if (a.startsWith('si')) return 'si';
  if (a.startsWith('ta')) return 'ta';
  return 'en';
}

const shell = (title: string, lang: Lang, inner: string, accent = '#2B4A3A') => `<!DOCTYPE html>
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
  footer{text-align:center;font-size:11px;color:#9C8B7A;padding:20px}
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

/** config: the cached gate config (qr_type, content_data, title, branding). url: the scanned URL (for language links). */
export function renderGuestPage(config: any, lang: Lang, url: string): Rendered | null {
  const d = config.content_data || {};
  const t = UI[lang];
  const footer = config.branding ? `<footer>${esc(t.powered)}</footer>` : '';
  switch (config.qr_type) {
    case 'vcard':
      return { kind: 'vcard', body: vcardText(d), filename: `${(d.first_name || 'contact').replace(/[^\w-]/g, '')}.vcf` };
    case 'email':
      return { kind: 'redirect', location: `mailto:${d.email || ''}?subject=${encodeURIComponent(d.subject || '')}&body=${encodeURIComponent(d.body || '')}` };
    case 'text':
      return { kind: 'html', body: shell(config.title || 'Message', lang, `<main><div class="box"><pre>${esc(d.text)}</pre></div></main>${footer}`) };
    case 'wifi':
      return { kind: 'html', body: shell(d.ssid || 'Wi-Fi', lang, `<main>${wifiBox(d.ssid || '', d.password || '', t)}</main>${footer}`) };
    case 'page': {
      const tr = (d.i18n && d.i18n[lang]) || {};
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
  console.log('guestPage self-check ok');
}
