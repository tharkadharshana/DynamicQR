import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SITE } from '../lib/site';
import FooterHub from './FooterHub';
import HelpButton from './HelpButton';
import '../pages/Landing.css';

/** Public page shell (no login) for the free tools and What's new. Sets the page title and description. */
export default function ToolsLayout({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  useEffect(() => {
    window.scrollTo(0, 0);
    const prev = document.title;
    document.title = `${title} | ${SITE.name}`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    const prevDesc = meta.content;
    meta.content = description;
    return () => { document.title = prev; if (meta) meta.content = prevDesc; };
  }, [title, description]);
  return (
    <div className="landing-page">
      <nav>
        <div className="nav-inner">
          <Link to="/" className="logo">
            <div className="logo-mark">
              <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
            <Link to="/login" className="btn-text">Sign in</Link>
          </div>
        </div>
      </nav>
      <main className="tool-main">{children}</main>
      <footer>
        <div className="footer-inner" style={{ display: 'block' }}>
          <FooterHub />
          <div className="footer-copy">© 2026 {SITE.legalName} · {SITE.location} · {SITE.email}</div>
        </div>
      </footer>
      <HelpButton />
    </div>
  );
}
