import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { loginWithGoogle } from '../supabase';
import QRCode from 'qrcode';
import { formatPrice, planFeatures, PAID_PLANS, PLANS, Currency, PaidPlan } from '../lib/plans';
import FooterHub from '../components/FooterHub';
import { SHORT_DOMAIN, SHORT_HOST, getQRContent } from '../lib/qrContent';
import { SITE, waLink } from '../lib/site';
import './Landing.css';

const defaultCurrency = (): Currency => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Colombo' ? 'LKR' : 'USD'; } catch { return 'LKR'; }
};

// The hero card's type tabs: [content_data key, label, placeholder] per field. URL uses cardUrl.
const CARD_FIELDS = {
  url: [['url', 'Destination URL', 'https://yourcafe.lk/menu']],
  vcard: [['first_name', 'Name', 'Nimal Perera'], ['phone', 'Phone', '+94 77 123 4567'], ['email', 'Email', 'nimal@yourcafe.lk']],
  wifi: [['ssid', 'Network name', 'Lagoon-Guest'], ['password', 'Password', 'kottu2026']],
  text: [['text', 'Text', 'Any message you want to share']],
} as const;
type CardTab = keyof typeof CARD_FIELDS;

export default function Landing() {
  const [cardUrl, setCardUrl] = useState('https://yourcafe.lk/menu');
  const [tab, setTab] = useState<CardTab>('url');
  const [cd, setCd] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const demoRef = useRef<HTMLCanvasElement>(null);

  const handleLogin = async () => {
    setLoginError(null);
    setLoginLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setLoginError(err?.message || 'Sign-in failed. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  // The footer's /login#pricing link: scroll to the pricing section once the page is up.
  useEffect(() => { if (window.location.hash === '#pricing') document.getElementById('pricing')?.scrollIntoView(); }, []);

  useEffect(() => {
    // Scroll reveal (sections start visible in CSS when reduced motion is on)
    const ro = new IntersectionObserver(entries => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) setTimeout(() => e.target.classList.add('on'), i * 70);
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => ro.observe(el));
    return () => ro.disconnect();
  }, []);

  // Live preview of a real (static) QR for whatever URL the visitor types.
  // What the preview QR encodes: the URL as typed, or a static vCard / Wi-Fi / text code.
  const payload = tab === 'url' ? cardUrl : getQRContent({ qr_type: tab, is_dynamic: false, content_data: cd });
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, payload || SHORT_DOMAIN, { width: 120, margin: 1, color: { dark: '#1A1916', light: '#FFFFFF' } })
      .catch(console.error);
  }, [payload]);

  // A real dynamic code owned by Scnr, so visitors can test a scan end to end.
  useEffect(() => {
    if (!demoRef.current || !SITE.demoSlug) return;
    QRCode.toCanvas(demoRef.current, `${SHORT_DOMAIN}/${SITE.demoSlug}`, { width: 132, margin: 1, color: { dark: '#1A1916', light: '#FFFFFF' } })
      .catch(console.error);
  }, []);

  const shown = tab === 'url' ? cardUrl.replace(/^https?:\/\/(www\.)?/, '') : cd[CARD_FIELDS[tab][0][0]] || '…';
  const downloadQR = () => {
    if (!canvasRef.current) return;
    const a = document.createElement('a');
    a.download = 'scnr-qr.png';
    a.href = canvasRef.current.toDataURL('image/png');
    a.click();
  };

  const price = (plan: PaidPlan) => {
    const p = formatPrice(plan, currency, 'monthly');
    return currency === 'USD' ? p.replace('$', '') : p.replace('LKR ', '');
  };

  return (
    <div className="landing-page">
      {loginError && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px 24px', borderRadius: 8, fontSize: 14, maxWidth: 480, textAlign: 'center' }}>
          {loginError}
        </div>
      )}
      {/* NAV */}
      <nav>
        <div className="nav-inner">
          <a href="#" className="logo">
            <div className="logo-mark">
              <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="5" height="5" rx="1" fill="white"/>
                <rect x="8" y="1" width="5" height="5" rx="1" fill="white"/>
                <rect x="1" y="8" width="5" height="5" rx="1" fill="white"/>
                <rect x="9" y="9" width="2" height="2" fill="white"/>
                <rect x="12" y="9" width="2" height="2" fill="white"/>
                <rect x="9" y="12" width="2" height="2" fill="white"/>
                <rect x="12" y="12" width="2" height="2" fill="white"/>
              </svg>
            </div>
            {SITE.name}
          </a>
          <ul className="nav-links">
            <li><a href="#features">Features</a></li>
            <li><a href="#how">How it works</a></li>
            <li><a href="#pricing">Pricing</a></li>
          </ul>
          <div className="nav-right">
            <button className="btn-text" onClick={handleLogin} disabled={loginLoading}>Sign in</button>
            <button className="btn-cta" onClick={handleLogin} disabled={loginLoading}>{loginLoading ? 'Signing in…' : 'Start free trial'}</button>
          </div>
        </div>
      </nav>

      <main>

      {/* HERO */}
      <div className="hero">
        <div>
          <div className="hero-eyebrow"><span className="eyebrow-line"></span> Built in Colombo</div>
          <h1 className="hero-h1">Menu, review and offer QR codes<br/><em>for Sri Lankan businesses.</em></h1>
          <p className="hero-p">Print once. Change your menu, today's offer or Wi-Fi any time, and see when guests scan. Pay in rupees, get help on WhatsApp.</p>
          <div className="hero-form">
            <input
              type="url"
              className="hero-input"
              placeholder="Paste your menu or website link…"
              value={cardUrl}
              onChange={e => setCardUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
            />
            <button className="btn-hero" onClick={handleLogin}>Start free trial →</button>
          </div>
          <div className="hero-fine">
            <span>No card needed</span>
            <span className="fine-dot"></span>
            <span>14-day trial</span>
            <span className="fine-dot"></span>
            <span>Free forever: 3 codes, 1 dynamic</span>
          </div>
        </div>

        <div className="hero-card">
          <div className="card-tabs">
            {([['url', 'URL'], ['vcard', 'vCard'], ['wifi', 'Wi-Fi'], ['text', 'Text']] as const).map(([k, label]) => (
              <button key={k} className={`tab${tab === k ? ' active' : ''}`} aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>

          <div className="qr-live-wrap">
            <div className="qr-frame">
              <canvas ref={canvasRef} width="100" height="100" style={{ display: 'block', borderRadius: '8px' }}></canvas>
            </div>
            <div className="qr-live-meta">
              <div className="meta-label">Preview</div>
              <div className="meta-slug">Static QR for your {tab === 'url' ? 'link' : tab === 'vcard' ? 'contact' : tab === 'wifi' ? 'Wi-Fi' : 'text'}</div>
              <div className="meta-dest">
                → {shown.slice(0, 28)}{shown.length > 28 ? '…' : ''}
              </div>
              <div className="meta-badges">
                <span className="badge badge-type">Sign in for a dynamic {SHORT_HOST} link</span>
              </div>
            </div>
          </div>

          {CARD_FIELDS[tab].map(([k, label, ph]) => (
            <div className="card-input-group" key={`${tab}-${k}`}>
              <label className="input-label" htmlFor={`card-${k}`}>{label}</label>
              <input id={`card-${k}`} type={k === 'url' ? 'url' : 'text'} className="card-input" placeholder={ph}
                value={k === 'url' ? cardUrl : cd[k] || ''} onChange={e => k === 'url' ? setCardUrl(e.target.value) : setCd({ ...cd, [k]: e.target.value })} />
            </div>
          ))}

          <div className="card-downloads">
            <button className="btn-dl" onClick={downloadQR}>↓ PNG</button>
            <button className="btn-dl-primary" onClick={handleLogin}>Style &amp; track it →</button>
          </div>
        </div>
      </div>

      {/* TRUST STRIP — real facts only */}
      <div className="logos-wrap">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 28px', justifyContent: 'center', alignItems: 'center', padding: '0 24px', fontSize: '14px', color: 'var(--ink3)' }}>
          <span>🇱🇰 Built in {SITE.location}{SITE.founder ? ` by ${SITE.founder}` : ''}</span>
          {SITE.whatsapp && <a href={waLink(SITE.whatsapp, 'Hi, I have a question about Scnr')} target="_blank" rel="noreferrer">WhatsApp support · {SITE.supportHours}</a>}
          {SITE.statusUrl && <a href={SITE.statusUrl} target="_blank" rel="noreferrer">● Live status</a>}
          <span>Marketing and menu QR codes · not a LANKAQR payment replacement</span>
        </div>
      </div>

      {/* FEATURES */}
      <section className="features-section" id="features">
        <div className="section-wrap">
          <div className="features-header">
            <div>
              <div className="eyebrow reveal">Features</div>
              <h2 className="section-h2 reveal">One printed code,<br/><em>changed whenever you like.</em></h2>
            </div>
            <p className="section-p reveal" style={{ maxWidth: '360px' }}>For menus, table tents, shop windows, flyers and packaging. Change the destination without reprinting.</p>
          </div>
          <div className="features-grid reveal">
            <div className="feat">
              <div className="feat-num">01</div>
              <div className="feat-icon" style={{ background: 'var(--coral-l)' }}>🔄</div>
              <div className="feat-name">Change it after printing</div>
              <p className="feat-desc">Update a menu, a promotion or an event page any time. The printed code stays the same; the change is live on the next scan.</p>
              <div className="feat-arrow">↗</div>
            </div>
            <div className="feat">
              <div className="feat-num">02</div>
              <div className="feat-icon" style={{ background: '#E8F5EC' }}>📊</div>
              <div className="feat-name">Scan statistics</div>
              <p className="feat-desc">Scans per day, unique visitors, country, device, operating system and browser for every code.</p>
              <div className="feat-arrow">↗</div>
            </div>
            <div className="feat">
              <div className="feat-num">03</div>
              <div className="feat-icon" style={{ background: '#EEF0FF' }}>🎨</div>
              <div className="feat-name">Your brand on the code</div>
              <p className="feat-desc">Colours, dot and corner shapes, and your logo in the centre. Download PNG or SVG up to 1200 px.</p>
              <div className="feat-arrow">↗</div>
            </div>
            <div className="feat">
              <div className="feat-num">04</div>
              <div className="feat-icon" style={{ background: '#FFF8E8' }}>🛡️</div>
              <div className="feat-name">Rules on every code</div>
              <p className="feat-desc">PIN protection, an expiry date, a total scan limit, and limits on repeat scans from the same phone.</p>
              <div className="feat-arrow">↗</div>
            </div>
            <div className="feat">
              <div className="feat-num">05</div>
              <div className="feat-icon" style={{ background: 'var(--coral-l)' }}>🔒</div>
              <div className="feat-name">Privacy-respecting</div>
              <p className="feat-desc">We never store raw IP addresses. No cookies or tracking pixels on scan pages. <Link to="/legal/privacy-policy">Read how scans are counted</Link>.</p>
              <div className="feat-arrow">↗</div>
            </div>
            <div className="feat">
              <div className="feat-num">06</div>
              <div className="feat-icon" style={{ background: '#E8F5EC' }}>⏸️</div>
              <div className="feat-name">Never deleted on downgrade</div>
              <p className="feat-desc">If a plan ends, your codes keep working for 30 days. After that, codes above your plan pause — they are never deleted.</p>
              <div className="feat-arrow">↗</div>
            </div>
            <div className="feat">
              <div className="feat-num">07</div>
              <div className="feat-icon" style={{ background: '#EEF0FF' }}>📄</div>
              <div className="feat-name">Mobile pages</div>
              <p className="feat-desc">Build a page from blocks (buttons, social icons, images, video, products, a contact card) or start from one of a dozen ready-made templates. Free includes {PLANS.free.pages} page; Pro includes {PLANS.pro.pages}.</p>
              <div className="feat-arrow">↗</div>
            </div>
            <div className="feat">
              <div className="feat-num">08</div>
              <div className="feat-icon" style={{ background: '#FFF8E8' }}>📝</div>
              <div className="feat-name">Forms</div>
              <p className="feat-desc">Print a code that opens a form. Get each answer by email, see them in a table and download a CSV. Pro includes {PLANS.pro.forms} forms.</p>
              <div className="feat-arrow">↗</div>
            </div>
            <div className="feat">
              <div className="feat-num">09</div>
              <div className="feat-icon" style={{ background: 'var(--coral-l)' }}>🔗</div>
              <div className="feat-name">Short links</div>
              <p className="feat-desc">Shorten any link with your own back-half. Pro includes {PLANS.pro.short_links} short links; Free includes {PLANS.free.short_links}.</p>
              <div className="feat-arrow">↗</div>
            </div>
            <div className="feat">
              <div className="feat-num">10</div>
              <div className="feat-icon" style={{ background: '#E8F5EC' }}>🏢</div>
              <div className="feat-name">For agencies and chains</div>
              <p className="feat-desc">The Business plan has {PLANS.business.workspaces} workspaces, {PLANS.business.seats} team members, up to {PLANS.business.custom_domains} custom domains and webhooks.</p>
              <div className="feat-arrow">↗</div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how-section" id="how">
        <div className="section-wrap">
          <div className="how-inner">
            <div>
              <div className="eyebrow reveal">How it works</div>
              <h2 className="section-h2 reveal">From link to printed code<br/><em>in a few minutes.</em></h2>
              <div className="steps-list reveal">
                <div className="step-item">
                  <div className="step-n">01</div>
                  <div className="step-content">
                    <div className="step-title">Add your destination</div>
                    <p className="step-desc">A website or menu link, a contact card, a Wi-Fi network, text, or an email.</p>
                  </div>
                </div>
                <div className="step-item">
                  <div className="step-n">02</div>
                  <div className="step-content">
                    <div className="step-title">Style it</div>
                    <p className="step-desc">Your colours and logo. Takes under a minute.</p>
                  </div>
                </div>
                <div className="step-item">
                  <div className="step-n">03</div>
                  <div className="step-content">
                    <div className="step-title">Download and print</div>
                    <p className="step-desc">PNG or SVG. Scan a test print on your own phone before a large print run.</p>
                  </div>
                </div>
                <div className="step-item">
                  <div className="step-n">04</div>
                  <div className="step-content">
                    <div className="step-title">Change and track</div>
                    <p className="step-desc">See scans in your dashboard. Change the destination whenever you need — the printed code never changes.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="how-visual reveal" style={{ display: 'grid', justifyItems: 'center', alignContent: 'center', gap: '14px', textAlign: 'center' }}>
              {SITE.demoSlug ? (
                <>
                  <span className="hv-title">Scan our live demo</span>
                  <canvas ref={demoRef} width="132" height="132" style={{ borderRadius: '8px', background: '#fff', padding: '8px' }} />
                  <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{SHORT_HOST}/{SITE.demoSlug} — a real dynamic code</span>
                </>
              ) : (
                <>
                  <span className="hv-title">Want help setting up?</span>
                  <p style={{ fontSize: '14px', color: 'var(--ink3)', maxWidth: '280px' }}>We can design your codes, set the destinations and help with printing.</p>
                </>
              )}
              {SITE.whatsapp && (
                <a className="btn-plan outline" style={{ textDecoration: 'none', maxWidth: '260px' }} href={waLink(SITE.whatsapp, 'Hi, I would like help setting up QR codes for my business.')} target="_blank" rel="noreferrer">Book setup on WhatsApp</a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="pricing-section" id="pricing">
        <div className="section-wrap">
          <div className="pricing-header">
            <div className="eyebrow reveal" style={{ justifyContent: 'center' }}>Pricing</div>
            <h2 className="section-h2 reveal" style={{ textAlign: 'center', maxWidth: '100%' }}>Start free. <em>Upgrade when you need more.</em></h2>
            <p className="section-p reveal" style={{ textAlign: 'center', margin: '0 auto' }}>Every plan has clear limits. Pay yearly and get 2 months free.</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '18px' }} role="group" aria-label="Currency">
              {(['LKR', 'USD'] as Currency[]).map(c => (
                <button key={c} className={`btn-plan ${currency === c ? 'filled' : 'outline'}`} style={{ width: 'auto', padding: '8px 18px' }} aria-pressed={currency === c} onClick={() => setCurrency(c)}>{c}</button>
              ))}
            </div>
          </div>
          <div className="pricing-grid reveal">
            <div className="plan">
              <div className="plan-tier">Free</div>
              <div className="plan-price"><sup>{currency === 'USD' ? '$' : 'LKR '}</sup>0</div>
              <div className="plan-cycle">forever · no card needed</div>
              <div className="plan-divider"></div>
              <ul className="plan-feats">
                {planFeatures('free').map(f => <li key={f}><span className="pf-check">✓</span> {f}</li>)}
              </ul>
              <button className="btn-plan outline" onClick={handleLogin}>Create a free code</button>
            </div>
            {PAID_PLANS.map(p => (
              <div key={p} className={`plan${p === 'pro' ? ' featured' : ''}`}>
                {p === 'pro' && <div className="plan-badge">For one business</div>}
                <div className="plan-tier">{p.charAt(0).toUpperCase() + p.slice(1)}</div>
                <div className="plan-price"><sup>{currency === 'USD' ? '$' : 'LKR '}</sup>{price(p)}</div>
                <div className="plan-cycle">per month · {formatPrice(p, currency, 'annual')} / year</div>
                <div className="plan-divider"></div>
                <ul className="plan-feats">
                  {planFeatures(p).map(f => <li key={f}><span className="pf-check">✓</span> {f}</li>)}
                </ul>
                <button className={`btn-plan ${p === 'pro' ? 'filled' : 'outline'}`} onClick={handleLogin}>Start 14-day trial</button>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--ink3)', marginTop: '18px' }}>
            Prices in {currency}. {currency === 'LKR' ? 'Paid in rupees through PayHere.' : 'Paid by international card.'}
          </p>
        </div>
      </section>

      {/* FINAL CTA */}
      <div className="cta-final">
        <div className="cta-box reveal">
          <h2 className="cta-h">Your first code is<br/><em>free right now.</em></h2>
          <p className="cta-sub">No card. Paste a link and download a working QR code in a few minutes.</p>
          <div className="cta-btns">
            <button className="btn-cta-white" onClick={handleLogin}>Start free trial →</button>
            {SITE.whatsapp && <a className="btn-cta-ghost" style={{ textDecoration: 'none' }} href={waLink(SITE.whatsapp, 'Hi, I would like a demo of Scnr.')} target="_blank" rel="noreferrer">Ask on WhatsApp</a>}
          </div>
          <p className="cta-note">Free forever plan · 14-day trial · Cancel any time</p>
        </div>
      </div>

      </main>

      {/* FOOTER */}
      <footer>
        <div className="footer-inner">
          <a href="#" className="logo" style={{ fontSize: '18px' }}>
            <div className="logo-mark" style={{ width: '20px', height: '20px', borderRadius: '5px' }}>
              <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '12px', height: '12px' }}>
                <rect x="1" y="1" width="5" height="5" rx="1" fill="white"/>
                <rect x="8" y="1" width="5" height="5" rx="1" fill="white"/>
                <rect x="1" y="8" width="5" height="5" rx="1" fill="white"/>
                <rect x="9" y="9" width="2" height="2" fill="white"/>
                <rect x="12" y="9" width="2" height="2" fill="white"/>
                <rect x="9" y="12" width="2" height="2" fill="white"/>
                <rect x="12" y="12" width="2" height="2" fill="white"/>
              </svg>
            </div>
            {SITE.name}
          </a>
          <FooterHub />
          <div className="footer-copy">© 2026 {SITE.legalName} · {SITE.location} · {SITE.email}</div>
        </div>
      </footer>
    </div>
  );
}
