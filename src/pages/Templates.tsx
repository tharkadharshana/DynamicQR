import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { apiFetch } from '../lib/api';
import { renderGuestPage } from '../lib/guestPage';
import { useUI } from '../shared/UIContext';
import { SITE, waLink } from '../lib/site';

// The Pages gallery: hero, category chips, a row of template cards per category, and a right rail.
// Templates come from GET /api/page-templates (admin-managed rows in `page_templates`).

interface Tpl { id: string; name: string; description: string; category: string; tags: string[]; content: any }

// Filter chips. `cat` matches a row title, `tag` matches a template tag.
const CHIPS: { label: string; cat?: string; tag?: string }[] = [
  { label: 'All' }, { label: 'Link in Bio', cat: 'Link in Bio' }, { label: 'Business', cat: 'Business & Services' },
  { label: 'Restaurant', cat: 'Restaurant & Food' }, { label: 'Promotions', tag: 'promo' }, { label: 'Events', tag: 'event' }, { label: 'Real Estate', cat: 'Real Estate' },
];
const SUBTITLES: Record<string, string> = {
  'Link in Bio': 'Perfect for creators, influencers and personal brands.',
  'Business & Services': 'Showcase your products, services and company information.',
  'Restaurant & Food': 'Menus, orders and more for your food business.',
  'Promotions & Events': 'Drive engagement with offers, events and special campaigns.',
  'Real Estate': 'Listings, viewings and agency pages for property.',
};
// The design crops each row's thumbnails to a different height (the page is cropped from the top).
const THUMB_H: Record<string, number> = { 'Business & Services': 243, 'Restaurant & Food': 180, 'Promotions & Events': 105, 'Real Estate': 180 };
const TAGS = ['link in bio', 'business', 'restaurant', 'promo', 'event', 'real estate', 'minimal', 'dark mode'];
const tagLabel = (t: string) => ({ promo: 'Promo', 'link in bio': 'Link in Bio', 'real estate': 'Real Estate', 'dark mode': 'Dark Mode' } as Record<string, string>)[t] || t.charAt(0).toUpperCase() + t.slice(1);

// A card thumbnail is the real page rendered in a small sandboxed frame, so an edited template updates its own preview.
function Thumb({ tpl }: { tpl: Tpl }) {
  const h = THUMB_H[tpl.category] || 265;
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { rootMargin: '300px' });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  const html = useMemo(() => (on ? (renderGuestPage({ qr_type: 'page', title: tpl.name, content_data: tpl.content }, 'en', 'https://preview.local/p') as any)?.body || '' : ''), [on, tpl]);
  return (
    <div className="tg-thumb" ref={ref} style={{ height: h }}>
      {on && <iframe title={tpl.name} srcDoc={html} sandbox="" tabIndex={-1} loading="lazy" />}
    </div>
  );
}

function Hero({ onBrowse }: { onBrowse: () => void }) {
  const [qr, setQr] = useState('');
  useEffect(() => { QRCode.toDataURL('https://scnr.tharkak.com', { margin: 0, width: 160, color: { dark: '#1E1B4B', light: '#0000' } }).then(setQr).catch(() => {}); }, []);
  const chip = (icon: React.ReactNode, label: string, cls: string) => <div className={`tg-feat ${cls}`}><span>{icon}</span>{label}</div>;
  return (
    <section className="tg-hero">
      <div className="tg-hero-copy">
        <div className="tg-eyebrow">CREATE BEAUTIFUL PAGES</div>
        <h1>Turn your links into<br />powerful experiences</h1>
        <p>Choose a template, customise it to your needs, and create beautiful pages in seconds.</p>
        <button className="tg-browse" onClick={onBrowse}>Browse templates <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10M9 4l4 4-4 4" /></svg></button>
      </div>
      <div className="tg-phone" aria-hidden="true">
        <div className="tg-phone-top"><i>◆</i></div>
        <b>Your Brand</b><small>Scan • Explore • Connect</small>
        <div className="tg-phone-row"><i className="a" />Visit our website<em>›</em></div>
        <div className="tg-phone-row"><i className="b" />Follow on Instagram<em>›</em></div>
        <div className="tg-phone-row"><i className="c" />Get in touch<em>›</em></div>
        {qr && <img src={qr} alt="" />}
      </div>
      <div className="tg-feats">
        {chip(<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a9 9 0 100 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A3.6 3.6 0 0021 9c0-3.3-4-6-9-6z" /></svg>, 'Custom branding', 'f1')}
        {chip(<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5-5 4 4 8-9" /></svg>, 'Analytics', 'f2')}
        {chip(<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /></svg>, 'Fast & Secure', 'f3')}
      </div>
    </section>
  );
}

function RightRail({ tpls, q, setQ, tag, setTag }: { tpls: Tpl[]; q: string; setQ: (v: string) => void; tag: string; setTag: (v: string) => void }) {
  const cats = new Set(tpls.map(t => t.category)).size;
  const stat = (cls: string, icon: React.ReactNode, label: string, value: string) => (
    <div className="tg-stat"><span className={`tg-stat-ic ${cls}`}>{icon}</span><div><small>{label}</small><b>{value}</b></div></div>
  );
  return (
    <aside className="tg-rail">
      <div className="tg-rcard">
        <h3>Quick search</h3>
        <label className="tg-rsearch">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search templates..." aria-label="Search templates" />
        </label>
        <h3 style={{ marginTop: 22 }}>Popular tags</h3>
        <div className="tg-tags">
          {TAGS.map(t => <button key={t} className={tag === t ? 'on' : ''} onClick={() => setTag(tag === t ? '' : t)}># {tagLabel(t)}</button>)}
        </div>
      </div>
      <div className="tg-custom">
        <span className="tg-bulb">💡</span>
        <h4>Need a custom template?</h4>
        <p>Tell us what you need and we'll create it for you.</p>
        <a className="tg-reqbtn" href={SITE.whatsapp ? waLink(SITE.whatsapp, 'Hi, I would like a custom page template.') : `mailto:${SITE.email}?subject=Custom%20page%20template`} target="_blank" rel="noreferrer">Request Custom</a>
      </div>
      <div className="tg-rcard">
        <h3>Templates summary</h3>
        {stat('red', <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></svg>, 'Total templates', `${tpls.length}+`)}
        {stat('blue', <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16M3 10h6" /></svg>, 'Categories', String(cats))}
        {stat('green', <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg>, 'Pro designs', '100% Responsive')}
        {stat('blue', <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>, 'Languages', 'EN / SI / TA')}
      </div>
      <div className="tg-promo">
        <div><b>Small link.<br />Big possibilities.</b><span>Scnr</span></div>
        <svg viewBox="0 0 240 90" preserveAspectRatio="none" aria-hidden="true"><path d="M0 90V60l40-34 28 22 36-40 50 52 30-22 56 40v12z" fill="rgba(80,70,130,.55)" /><path d="M0 90V74l50-26 40 28 46-34 54 38 50-20v30z" fill="rgba(54,48,102,.75)" /></svg>
      </div>
    </aside>
  );
}

export default function Templates() {
  const navigate = useNavigate();
  const { showToast } = useUI();
  const [params, setParams] = useSearchParams();
  const [tpls, setTpls] = useState<Tpl[] | null>(null);
  const [chip, setChip] = useState('All');
  const [tag, setTag] = useState('');
  const q = params.get('q') || '';
  const setQ = (v: string) => setParams(v ? { q: v } : {}, { replace: true });
  const rows = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch('/api/page-templates').then(setTpls).catch(() => { setTpls([]); showToast('error', 'Could not load templates'); });
  }, []);

  const shown = useMemo(() => {
    const c = CHIPS.find(x => x.label === chip) || CHIPS[0], term = q.trim().toLowerCase();
    return (tpls || []).filter(t =>
      (!c.cat || t.category === c.cat) && (!c.tag || t.tags.includes(c.tag)) && (!tag || t.tags.includes(tag)) &&
      (!term || `${t.name} ${t.description} ${t.category} ${t.tags.join(' ')}`.toLowerCase().includes(term)));
  }, [tpls, chip, tag, q]);
  const groups = useMemo(() => {
    const m = new Map<string, Tpl[]>();
    shown.forEach(t => m.set(t.category, [...(m.get(t.category) || []), t]));
    return [...m.entries()];
  }, [shown]);

  const use = (t: Tpl) => navigate(`/pages/new?template=${t.id}`);
  return (
    <div className="tg">
      <div className="tg-main">
        <Hero onBrowse={() => rows.current?.scrollIntoView({ behavior: 'smooth' })} />
        <div className="tg-chips-wrap">
          <div className="tg-chips" ref={chipsRef} role="tablist">
            {CHIPS.map(c => <button key={c.label} role="tab" aria-selected={chip === c.label} className={chip === c.label ? 'on' : ''} onClick={() => setChip(c.label)}>{c.label}</button>)}
          </div>
          <button className="tg-chip-next" aria-label="Scroll categories" onClick={() => chipsRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3l5 5-5 5" /></svg>
          </button>
        </div>
        <div ref={rows}>
          {tpls === null && <div className="tg-empty">Loading templates…</div>}
          {tpls !== null && !groups.length && <div className="tg-empty">No templates match. <button onClick={() => { setQ(''); setTag(''); setChip('All'); }}>Clear filters</button></div>}
          {groups.map(([cat, list]) => (
            <section key={cat} className="tg-sec">
              <div className="tg-sec-head">
                <div><h2>{cat}</h2><p>{SUBTITLES[cat] || 'More templates in this category.'}</p></div>
                <button className="tg-viewall" onClick={() => { const c = CHIPS.find(x => x.cat === cat); if (c) setChip(c.label); }}>View all <i>›</i></button>
              </div>
              <div className="tg-grid">
                {list.map(t => (
                  <article key={t.id} className="tg-card">
                    <button className="tg-thumb-btn" onClick={() => use(t)} aria-label={`Use ${t.name}`}><Thumb tpl={t} /></button>
                    <h4>{t.name}</h4>
                    <p>{t.description}</p>
                    <button className="tg-use" onClick={() => use(t)}>Use template</button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
        <p className="tg-mine">Looking for pages you already made? <Link to="/pages/mine">Your pages →</Link> Or <Link to="/pages/new?template=blank">start from a blank page →</Link></p>
      </div>
      <RightRail tpls={tpls || []} q={q} setQ={setQ} tag={tag} setTag={setTag} />
    </div>
  );
}
