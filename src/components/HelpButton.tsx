import React from 'react';
import { SITE, waLink } from '../lib/site';

/** Floating WhatsApp help button. Renders nothing until VITE_SUPPORT_WHATSAPP is set. */
export default function HelpButton() {
  if (!SITE.whatsapp) return null;
  return (
    <a
      href={waLink(SITE.whatsapp, 'Hi, I need help with Scnr')}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with us on WhatsApp"
      title="Chat with us on WhatsApp"
      style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 50, width: 48, height: 48, borderRadius: '50%', background: '#1F7A4D', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.3)' }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.7-5.4A8.4 8.4 0 1 1 21 11.5z"/></svg>
    </a>
  );
}
