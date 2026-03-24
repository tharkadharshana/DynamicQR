import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { loginWithGoogle } from '../firebase';
import QRCode from 'qrcode';
import './Landing.css';

export default function Landing() {
  const [heroUrl, setHeroUrl] = useState('https://yoursite.com');
  const [cardUrl, setCardUrl] = useState('https://yoursite.com');
  const [qrSlug, setQrSlug] = useState('x9Km4p');
  const [scanCount, setScanCount] = useState(1284);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const slugs = ['x9Km4p','bR3nVq','mZ7wYt','kP2sLf','dN8jXc','hQ5eWr'];

  useEffect(() => {
    // Scroll reveal
    const ro = new IntersectionObserver(entries => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          setTimeout(() => e.target.classList.add('on'), i * 70);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => ro.observe(el));

    // Live scan counter animation
    const interval = setInterval(() => {
      if (Math.random() > 0.55) {
        setScanCount(prev => prev + Math.floor(Math.random() * 4) + 1);
      }
    }, 3200);

    return () => {
      ro.disconnect();
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const renderQR = async () => {
      if (!canvasRef.current) return;
      try {
        await QRCode.toCanvas(canvasRef.current, cardUrl || 'https://scnr.app', {
          width: 120,
          margin: 1,
          color: {
            dark: '#1A1916',
            light: '#FFFFFF'
          }
        });
      } catch (err) {
        console.error(err);
      }
    };
    const timer = setTimeout(() => {
      renderQR();
      setQrSlug(slugs[Math.floor(Math.random() * slugs.length)]);
    }, 300);
    return () => clearTimeout(timer);
  }, [cardUrl]);

  const handleHeroGenerate = () => {
    setCardUrl(heroUrl);
    loginWithGoogle();
  };

  const downloadQR = () => {
    if (!canvasRef.current) return;
    const a = document.createElement('a');
    a.download = 'scnr-qr.png';
    a.href = canvasRef.current.toDataURL('image/png');
    a.click();
  };

  const handleUrlInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHeroUrl(e.target.value);
    setCardUrl(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleHeroGenerate();
    }
  };

  return (
    <div className="landing-page">
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
            Scnr
          </a>
          <ul className="nav-links">
            <li><a href="#features">Features</a></li>
            <li><a href="#how">How it works</a></li>
            <li><a href="#analytics">Analytics</a></li>
            <li><a href="#pricing">Pricing</a></li>
          </ul>
          <div className="nav-right">
            <button className="btn-text" onClick={loginWithGoogle}>Sign in</button>
            <button className="btn-cta" onClick={loginWithGoogle}>Start free trial</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <div className="hero">
        <div>
          <div className="hero-eyebrow"><span className="eyebrow-line"></span> Dynamic QR Platform</div>
          <h1 className="hero-h1">QR codes that<br/><em>think ahead.</em></h1>
          <p className="hero-p">Create, customise, and track QR codes in real time. Change destinations without reprinting. Know exactly who scans, when, and where.</p>
          <div className="hero-form">
            <input 
              type="url" 
              className="hero-input" 
              placeholder="Paste your URL here…" 
              value={heroUrl}
              onChange={handleUrlInput}
              onKeyDown={handleKeyDown}
            />
            <button className="btn-hero" onClick={handleHeroGenerate}>Start free trial →</button>
          </div>
          <div className="hero-fine">
            <span>No credit card required</span>
            <span className="fine-dot"></span>
            <span>14-day free trial</span>
            <span className="fine-dot"></span>
            <span>Static QRs free forever</span>
          </div>
        </div>

        <div className="hero-card">
          <div className="card-tabs">
            <button className="tab active">URL</button>
            <button className="tab">vCard</button>
            <button className="tab">WiFi</button>
            <button className="tab">PDF</button>
          </div>

          <div className="qr-live-wrap">
            <div className="qr-frame">
              <canvas ref={canvasRef} width="100" height="100" style={{ display: 'block', borderRadius: '8px' }}></canvas>
            </div>
            <div className="qr-live-meta">
              <div className="meta-label">Short link</div>
              <div className="meta-slug">scnr.app/{qrSlug}</div>
              <div className="meta-dest">
                → {cardUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].slice(0, 28) + (cardUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].length > 28 ? '…' : '')}
              </div>
              <div className="meta-badges">
                <span className="badge badge-live"><span className="badge-dot"></span>Live</span>
                <span className="badge badge-type">Dynamic</span>
                <span className="badge badge-type">Trackable</span>
              </div>
            </div>
          </div>

          <div className="card-input-group">
            <label className="input-label">Destination URL</label>
            <input 
              type="url" 
              className="card-input" 
              placeholder="https://yoursite.com" 
              value={cardUrl} 
              onChange={handleUrlInput}
            />
          </div>

          <div className="card-downloads">
            <button className="btn-dl" onClick={downloadQR}>↓ PNG</button>
            <button className="btn-dl">↓ SVG</button>
            <button className="btn-dl-primary" onClick={loginWithGoogle}>Edit style →</button>
          </div>

          <div className="card-stats">
            <div className="cstat">
              <div className="cstat-val" key={scanCount} style={{ animation: 'countTick 0.25s ease' }}>
                {scanCount.toLocaleString()}
              </div>
              <div className="cstat-key">Total scans</div>
            </div>
            <div className="cstat">
              <div className="cstat-val">73%</div>
              <div className="cstat-key">Mobile</div>
            </div>
            <div className="cstat">
              <div className="cstat-val">🌏 12</div>
              <div className="cstat-key">Countries</div>
            </div>
          </div>
        </div>
      </div>

      {/* LOGOS MARQUEE */}
      <div className="logos-wrap">
        <div className="logos-label">Trusted by teams at</div>
        <div className="marquee-track">
          <span className="m-logo">Shopify</span>
          <span className="m-logo">Marriott Hotels</span>
          <span className="m-logo">Eventbrite</span>
          <span className="m-logo">Starbucks</span>
          <span className="m-logo">Notion</span>
          <span className="m-logo">Stripe</span>
          <span className="m-logo">Airbnb</span>
          <span className="m-logo">HubSpot</span>
          <span className="m-logo">Figma</span>
          <span className="m-logo">Linear</span>
          <span className="m-logo">Shopify</span>
          <span className="m-logo">Marriott Hotels</span>
          <span className="m-logo">Eventbrite</span>
          <span className="m-logo">Starbucks</span>
          <span className="m-logo">Notion</span>
          <span className="m-logo">Stripe</span>
          <span className="m-logo">Airbnb</span>
          <span className="m-logo">HubSpot</span>
          <span className="m-logo">Figma</span>
          <span className="m-logo">Linear</span>
        </div>
      </div>

      {/* FEATURES */}
      <section className="features-section" id="features">
        <div className="section-wrap">
          <div className="features-header">
            <div>
              <div className="eyebrow reveal">Features</div>
              <h2 className="section-h2 reveal">Built for businesses<br/>that <em>move fast.</em></h2>
            </div>
            <p className="section-p reveal" style={{ maxWidth: '360px' }}>Everything from creation to analytics. Professional QR tools without the enterprise price tag.</p>
          </div>
          <div className="features-grid reveal">
            <div className="feat">
              <div className="feat-num">01</div>
              <div className="feat-icon" style={{ background: 'var(--coral-l)' }}>🔄</div>
              <div className="feat-name">Dynamic destinations</div>
              <p className="feat-desc">Change where your QR points anytime — no reprinting. Update menus, campaign URLs, or event pages on the fly.</p>
              <div className="feat-arrow">↗</div>
            </div>
            <div className="feat">
              <div className="feat-num">02</div>
              <div className="feat-icon" style={{ background: '#E8F5EC' }}>📊</div>
              <div className="feat-name">Real-time analytics</div>
              <p className="feat-desc">Every scan logged. Country, city, device, browser, time of day. Understand your audience with precision.</p>
              <div className="feat-arrow">↗</div>
            </div>
            <div className="feat">
              <div className="feat-num">03</div>
              <div className="feat-icon" style={{ background: '#EEF0FF' }}>🎨</div>
              <div className="feat-name">Style Studio</div>
              <p className="feat-desc">Custom dot shapes, corner styles, colors, and logo embedding. Branded QR codes in under a minute.</p>
              <div className="feat-arrow">↗</div>
            </div>
            <div className="feat">
              <div className="feat-num">04</div>
              <div className="feat-icon" style={{ background: '#FFF8E8' }}>📱</div>
              <div className="feat-name">Smart device routing</div>
              <p className="feat-desc">iOS to the App Store, Android to Google Play — automatically. One QR, two destinations, zero friction.</p>
              <div className="feat-arrow">↗</div>
            </div>
            <div className="feat">
              <div className="feat-num">05</div>
              <div className="feat-icon" style={{ background: 'var(--coral-l)' }}>🔒</div>
              <div className="feat-name">Privacy-safe tracking</div>
              <p className="feat-desc">IP hashing, no personal data retained. Full analytics without compromising your users. GDPR ready.</p>
              <div className="feat-arrow">↗</div>
            </div>
            <div className="feat">
              <div className="feat-num">06</div>
              <div className="feat-icon" style={{ background: '#E8F5EC' }}>⬇️</div>
              <div className="feat-name">Export everywhere</div>
              <p className="feat-desc">PNG, SVG, or print-ready PDF. Every format, every size. Pixel-perfect at any dimension.</p>
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
              <h2 className="section-h2 reveal">From link to live QR<br/><em>in 30 seconds.</em></h2>
              <div className="steps-list reveal">
                <div className="step-item">
                  <div className="step-n">01</div>
                  <div className="step-content">
                    <div className="step-title">Paste your destination</div>
                    <p className="step-desc">Any URL, PDF, contact card, WiFi password, or payment link. Scnr handles every format.</p>
                  </div>
                </div>
                <div className="step-item">
                  <div className="step-n">02</div>
                  <div className="step-content">
                    <div className="step-title">Customise the style</div>
                    <p className="step-desc">Add your brand colours, logo, and choose from dot styles. Takes under a minute.</p>
                  </div>
                </div>
                <div className="step-item">
                  <div className="step-n">03</div>
                  <div className="step-content">
                    <div className="step-title">Download and deploy</div>
                    <p className="step-desc">PNG, SVG, or PDF. Print on menus, packaging, signage, cards — anywhere it fits.</p>
                  </div>
                </div>
                <div className="step-item">
                  <div className="step-n">04</div>
                  <div className="step-content">
                    <div className="step-title">Track every scan</div>
                    <p className="step-desc">Watch the dashboard fill up in real time. Update the destination whenever you need — the QR never changes.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="how-visual reveal">
              <div className="hv-header">
                <span className="hv-title">Scan activity — last 14 days</span>
                <span className="hv-badge">+31% this week</span>
              </div>
              <div className="mini-chart">
                <div className="mc-bar" style={{ height: '35%' }}></div>
                <div className="mc-bar" style={{ height: '50%' }}></div>
                <div className="mc-bar" style={{ height: '42%' }}></div>
                <div className="mc-bar hi2" style={{ height: '68%' }}></div>
                <div className="mc-bar" style={{ height: '55%' }}></div>
                <div className="mc-bar" style={{ height: '60%' }}></div>
                <div className="mc-bar hi2" style={{ height: '74%' }}></div>
                <div className="mc-bar" style={{ height: '65%' }}></div>
                <div className="mc-bar" style={{ height: '70%' }}></div>
                <div className="mc-bar hi2" style={{ height: '82%' }}></div>
                <div className="mc-bar" style={{ height: '75%' }}></div>
                <div className="mc-bar hi2" style={{ height: '88%' }}></div>
                <div className="mc-bar" style={{ height: '80%' }}></div>
                <div className="mc-bar hi" style={{ height: '100%' }}></div>
              </div>
              <div className="country-row">
                <span className="country-flag">🇱🇰</span>
                <span className="country-name">Sri Lanka</span>
                <div className="country-track"><div className="country-fill" style={{ width: '88%' }}></div></div>
                <span className="country-count">2,841</span>
              </div>
              <div className="country-row">
                <span className="country-flag">🇺🇸</span>
                <span className="country-name">United States</span>
                <div className="country-track"><div className="country-fill" style={{ width: '64%' }}></div></div>
                <span className="country-count">1,920</span>
              </div>
              <div className="country-row">
                <span className="country-flag">🇬🇧</span>
                <span className="country-name">United Kingdom</span>
                <div className="country-track"><div className="country-fill" style={{ width: '42%' }}></div></div>
                <span className="country-count">1,244</span>
              </div>
              <div className="country-row">
                <span className="country-flag">🇩🇪</span>
                <span className="country-name">Germany</span>
                <div className="country-track"><div className="country-fill" style={{ width: '28%' }}></div></div>
                <span className="country-count">820</span>
              </div>
              <div className="country-row">
                <span className="country-flag">🇸🇬</span>
                <span className="country-name">Singapore</span>
                <div className="country-track"><div className="country-fill" style={{ width: '18%' }}></div></div>
                <span className="country-count">541</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ANALYTICS */}
      <section className="analytics-section" id="analytics">
        <div className="section-wrap">
          <div className="analytics-inner">
            <div className="analytics-cards reveal">
              <div className="acard span2">
                <div className="acard-label">Total scans this month</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                  <div className="acard-val">48,291</div>
                  <div className="acard-change up">↑ 23.4%</div>
                </div>
                <div className="sparkline">
                  <div className="sp-bar" style={{ height: '28%' }}></div>
                  <div className="sp-bar" style={{ height: '40%' }}></div>
                  <div className="sp-bar" style={{ height: '33%' }}></div>
                  <div className="sp-bar" style={{ height: '55%' }}></div>
                  <div className="sp-bar" style={{ height: '48%' }}></div>
                  <div className="sp-bar active" style={{ height: '62%' }}></div>
                  <div className="sp-bar" style={{ height: '70%' }}></div>
                  <div className="sp-bar" style={{ height: '58%' }}></div>
                  <div className="sp-bar active" style={{ height: '75%' }}></div>
                  <div className="sp-bar" style={{ height: '82%' }}></div>
                  <div className="sp-bar active" style={{ height: '88%' }}></div>
                  <div className="sp-bar" style={{ height: '78%' }}></div>
                  <div className="sp-bar active" style={{ height: '95%' }}></div>
                  <div className="sp-bar active" style={{ height: '100%' }}></div>
                </div>
              </div>
              <div className="acard">
                <div className="acard-label">Unique visitors</div>
                <div className="acard-val" style={{ fontSize: '28px' }}>12,040</div>
                <div className="acard-change up" style={{ marginTop: '6px' }}>↑ 18%</div>
              </div>
              <div className="acard">
                <div className="acard-label">Avg scans/day</div>
                <div className="acard-val" style={{ fontSize: '28px' }}>1,609</div>
                <div className="acard-change up" style={{ marginTop: '6px' }}>↑ 9%</div>
              </div>
              <div className="acard span2">
                <div className="acard-label">Device breakdown</div>
                <div className="donut-wrap" style={{ marginTop: '10px' }}>
                  <svg className="donut-svg" width="72" height="72" viewBox="0 0 72 72">
                    <circle cx="36" cy="36" r="28" fill="none" stroke="#F4F3EF" strokeWidth="10"/>
                    <circle cx="36" cy="36" r="28" fill="none" stroke="#E85D3A" strokeWidth="10"
                      strokeDasharray="125 51" strokeDashoffset="0" strokeLinecap="round"/>
                    <circle cx="36" cy="36" r="28" fill="none" stroke="#C4C3BC" strokeWidth="10"
                      strokeDasharray="47 129" strokeDashoffset="-125" strokeLinecap="round"/>
                    <circle cx="36" cy="36" r="28" fill="none" stroke="#D4D3CC" strokeWidth="10"
                      strokeDasharray="12 164" strokeDashoffset="-172" strokeLinecap="round"/>
                  </svg>
                  <div className="donut-legend">
                    <div className="dl-row"><div className="dl-dot" style={{ background: 'var(--coral)' }}></div><span className="dl-name">Mobile</span><span className="dl-pct">71%</span></div>
                    <div className="dl-row"><div className="dl-dot" style={{ background: 'var(--ink4)' }}></div><span className="dl-name">Desktop</span><span className="dl-pct">27%</span></div>
                    <div className="dl-row"><div className="dl-dot" style={{ background: 'var(--border2)' }}></div><span className="dl-name">Tablet</span><span className="dl-pct">2%</span></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="reveal">
              <div className="eyebrow">Analytics</div>
              <h2 className="section-h2">Know who's scanning,<br/><em>not just how many.</em></h2>
              <p className="section-p" style={{ marginBottom: '32px' }}>Every scan gives you city-level location, device type, browser, and time of day — all in one clean dashboard.</p>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <li style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <span style={{ width: '22px', height: '22px', background: 'var(--coral-l)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '12px', color: 'var(--coral)', fontWeight: 700, marginTop: '1px' }}>✓</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>City-level geo from every scan</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>Cloudflare provides location data for free — no extra GeoIP subscription needed.</div>
                  </div>
                </li>
                <li style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <span style={{ width: '22px', height: '22px', background: 'var(--coral-l)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '12px', color: 'var(--coral)', fontWeight: 700, marginTop: '1px' }}>✓</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>Unique visitor detection</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>Privacy-safe fingerprinting distinguishes new from returning without storing personal data.</div>
                  </div>
                </li>
                <li style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <span style={{ width: '22px', height: '22px', background: 'var(--coral-l)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '12px', color: 'var(--coral)', fontWeight: 700, marginTop: '1px' }}>✓</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>Peak hours heatmap</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>Know exactly when your audience scans. Optimise campaigns and promotions by time of day.</div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="pricing-section" id="pricing">
        <div className="section-wrap">
          <div className="pricing-header">
            <div className="eyebrow reveal" style={{ justifyContent: 'center' }}>Pricing</div>
            <h2 className="section-h2 reveal" style={{ textAlign: 'center', maxWidth: '100%' }}>Start free. <em>Scale when ready.</em></h2>
            <p className="section-p reveal" style={{ textAlign: 'center', margin: '0 auto' }}>No lock-in. Static QR codes are free forever. Upgrade only when you need dynamic links and analytics.</p>
          </div>
          <div className="pricing-grid reveal">
            <div className="plan">
              <div className="plan-tier">Free</div>
              <div className="plan-price"><sup>$</sup>0</div>
              <div className="plan-cycle">forever · no card needed</div>
              <div className="plan-divider"></div>
              <ul className="plan-feats">
                <li><span className="pf-check">✓</span> 3 static QR codes</li>
                <li><span className="pf-check">✓</span> PNG + SVG export</li>
                <li><span className="pf-check">✓</span> Basic styling</li>
                <li><span className="pf-x">–</span> Dynamic destinations</li>
                <li><span className="pf-x">–</span> Scan analytics</li>
                <li><span className="pf-x">–</span> Logo embedding</li>
              </ul>
              <button className="btn-plan outline" onClick={loginWithGoogle}>Create free QR</button>
            </div>
            <div className="plan featured">
              <div className="plan-badge">Most popular</div>
              <div className="plan-tier">Pro</div>
              <div className="plan-price"><sup>$</sup>7</div>
              <div className="plan-cycle">per month · 14-day free trial</div>
              <div className="plan-divider"></div>
              <ul className="plan-feats">
                <li><span className="pf-check">✓</span> Unlimited QR codes</li>
                <li><span className="pf-check">✓</span> Dynamic destinations</li>
                <li><span className="pf-check">✓</span> Full scan analytics</li>
                <li><span className="pf-check">✓</span> Logo + custom colors</li>
                <li><span className="pf-check">✓</span> 90-day history</li>
                <li><span className="pf-x">–</span> White-label</li>
              </ul>
              <button className="btn-plan filled" onClick={loginWithGoogle}>Start free trial</button>
            </div>
            <div className="plan">
              <div className="plan-tier">Team</div>
              <div className="plan-price"><sup>$</sup>29</div>
              <div className="plan-cycle">per month · all Pro features</div>
              <div className="plan-divider"></div>
              <ul className="plan-feats">
                <li><span className="pf-check">✓</span> Everything in Pro</li>
                <li><span className="pf-check">✓</span> Shared workspaces</li>
                <li><span className="pf-check">✓</span> White-label option</li>
                <li><span className="pf-check">✓</span> API access</li>
                <li><span className="pf-check">✓</span> 365-day history</li>
                <li><span className="pf-check">✓</span> Priority support</li>
              </ul>
              <button className="btn-plan outline" onClick={loginWithGoogle}>Contact sales</button>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="testi-section">
        <div className="section-wrap">
          <div className="eyebrow reveal">What people say</div>
          <h2 className="section-h2 reveal">Loved by <em>10,000+ businesses</em></h2>
          <div className="testi-grid reveal">
            <div className="tcard">
              <div className="tcard-stars">★★★★★</div>
              <p className="tcard-text">"We updated our restaurant menu <strong>three times in one month</strong> without reprinting a single table card. Worth every cent."</p>
              <div className="tcard-author">
                <div className="tcard-av" style={{ background: 'var(--coral-l)', color: 'var(--coral)' }}>AR</div>
                <div>
                  <div className="tcard-name">Amara R.</div>
                  <div className="tcard-role">Restaurant owner, Colombo</div>
                </div>
              </div>
            </div>
            <div className="tcard">
              <div className="tcard-stars">★★★★★</div>
              <p className="tcard-text">"The analytics are <strong>genuinely impressive</strong>. I can see which cities my print ads work in, which to pull. Changed how we budget entirely."</p>
              <div className="tcard-author">
                <div className="tcard-av" style={{ background: '#EEF0FF', color: '#5B5BD6' }}>JS</div>
                <div>
                  <div className="tcard-name">James S.</div>
                  <div className="tcard-role">Marketing director, London</div>
                </div>
              </div>
            </div>
            <div className="tcard">
              <div className="tcard-stars">★★★★★</div>
              <p className="tcard-text">"50 property listings, 50 QR codes. I know <strong>exactly which yard signs</strong> get scanned. Best $7 I spend each month — not even close."</p>
              <div className="tcard-author">
                <div className="tcard-av" style={{ background: '#E8F5EC', color: 'var(--green)' }}>PK</div>
                <div>
                  <div className="tcard-name">Priya K.</div>
                  <div className="tcard-role">Real estate agent, Singapore</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <div className="cta-final">
        <div className="cta-box reveal">
          <h2 className="cta-h">Your first QR is<br/><em>free right now.</em></h2>
          <p className="cta-sub">No credit card. No setup. Paste a link and have a working,<br/>trackable QR code in under 30 seconds.</p>
          <div className="cta-btns">
            <button className="btn-cta-white" onClick={loginWithGoogle}>Start free trial →</button>
            <button className="btn-cta-ghost" onClick={loginWithGoogle}>See all features</button>
          </div>
          <p className="cta-note">Free forever · 14-day trial on Pro · Cancel anytime</p>
        </div>
      </div>

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
            Scnr
          </a>
          <div className="footer-links">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <Link to="/legal/refund-policy">Refund Policy</Link>
            <Link to="/legal/privacy-policy">Privacy</Link>
            <Link to="/legal/terms-and-conditions">Terms</Link>
          </div>
          <div className="footer-copy">© 2026 Scnr. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
