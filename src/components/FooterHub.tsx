import React from 'react';
import { Link } from 'react-router-dom';
import { SITE } from '../lib/site';

export const TOOLS = [
  { slug: 'qr-scanner', name: 'QR code scanner', desc: 'Read a QR code with your camera or from a photo.' },
  { slug: 'utm-builder', name: 'UTM link builder', desc: 'Add campaign tags to any link.' },
  { slug: 'google-review-link', name: 'Google review link', desc: 'A direct link to the review box for your business.' },
  { slug: 'whatsapp-link', name: 'WhatsApp link maker', desc: 'A click-to-chat link with a ready message.' },
  { slug: 'qr-generator', name: 'Free QR generator', desc: 'A static QR code for a link or text, PNG or SVG.' },
];

/** Link hub shown at the bottom of the landing page and the public tool pages. */
export default function FooterHub() {
  return (
    <div className="footer-hub">
      <nav aria-label="Free tools">
        <h2>Free tools</h2>
        {TOOLS.map(t => <Link key={t.slug} to={`/tools/${t.slug}`}>{t.name}</Link>)}
      </nav>
      <nav aria-label="Product">
        <h2>Product</h2>
        <Link to="/login">Sign in</Link>
        <Link to="/login#pricing">Pricing</Link>
        <Link to="/whats-new">What's new</Link>
        {SITE.statusUrl && <a href={SITE.statusUrl} target="_blank" rel="noreferrer">Status</a>}
      </nav>
      <nav aria-label="Legal">
        <h2>Legal</h2>
        <Link to="/legal/refund-policy">Refunds</Link>
        <Link to="/legal/privacy-policy">Privacy</Link>
        <Link to="/legal/terms-and-conditions">Terms</Link>
      </nav>
    </div>
  );
}
