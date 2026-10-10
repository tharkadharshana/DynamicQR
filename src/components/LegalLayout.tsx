import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SITE } from '../lib/site';
import '../pages/Landing.css';

const h2: React.CSSProperties = { fontFamily: 'var(--font-h)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginTop: '40px', marginBottom: '12px' };

/** Shared shell for the Terms, Privacy and Refund pages. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={h2}>{title}</h2>
      <div style={{ display: 'grid', gap: '12px' }}>{children}</div>
    </section>
  );
}

export default function LegalLayout({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="landing-page">
      <nav>
        <div className="nav-inner">
          <Link to="/" className="logo">
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
          </Link>
          <div className="nav-right">
            <Link to="/" className="btn-text">Back</Link>
          </div>
        </div>
      </nav>
      <main style={{ padding: '120px 24px 100px', maxWidth: '760px', margin: '0 auto', color: 'var(--ink2)', fontSize: '15px', lineHeight: 1.7 }}>
        <div className="hero-eyebrow" style={{ opacity: 1, animation: 'none' }}><span className="eyebrow-line"></span> Legal</div>
        <h1 className="hero-h1" style={{ opacity: 1, animation: 'none', fontSize: '44px', marginBottom: '8px' }}>{title}</h1>
        <p style={{ color: 'var(--ink3)', marginBottom: '24px' }}>Last updated: {updated} · {SITE.legalName}, {SITE.location} · {SITE.email}</p>
        {children}
        <p style={{ marginTop: '48px', fontSize: '13px', color: 'var(--ink3)' }}>
          Related: <Link to="/legal/terms-and-conditions">Terms</Link> · <Link to="/legal/privacy-policy">Privacy</Link> · <Link to="/legal/refund-policy">Refunds</Link>
        </p>
      </main>
    </div>
  );
}
