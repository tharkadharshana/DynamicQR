import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function ApiDocs() {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="page" style={{ padding: 0, height: 'calc(100vh - 56px)' }}>
      <div className="docs-layout" style={{ height: '100%' }}>
        
        {/* Sidebar Nav */}
        <div className="docs-nav">
          <div className="docs-nav-section">
            <div className="docs-nav-label">Getting started</div>
            <div className="docs-nav-item active" onClick={() => scrollToSection('intro')}>Introduction</div>
            <div className="docs-nav-item" onClick={() => scrollToSection('auth-section')}>Authentication</div>
            <div className="docs-nav-item" onClick={() => scrollToSection('base-url')}>Base URL & versioning</div>
            <div className="docs-nav-item" onClick={() => scrollToSection('errors')}>Error handling</div>
            <div className="docs-nav-item" onClick={() => scrollToSection('ratelimit')}>Rate limits</div>
          </div>
          <div className="docs-nav-section">
            <div className="docs-nav-label">QR Codes</div>
            <div className="docs-nav-item" onClick={() => scrollToSection('qr-list')}><span className="method-tag get">GET</span>/qr</div>
            <div className="docs-nav-item" onClick={() => scrollToSection('qr-create')}><span className="method-tag post">POST</span>/qr</div>
            <div className="docs-nav-item" onClick={() => scrollToSection('qr-get')}><span className="method-tag get">GET</span>/qr/:id</div>
            <div className="docs-nav-item" onClick={() => scrollToSection('qr-update')}><span className="method-tag put">PUT</span>/qr/:id</div>
            <div className="docs-nav-item" onClick={() => scrollToSection('qr-delete')}><span className="method-tag del">DEL</span>/qr/:id</div>
          </div>
        </div>

        {/* Main Content */}
        <div className="docs-content" id="docs-scroll" style={{ overflowY: 'auto', padding: '40px' }}>
          
          <div className="docs-section" id="intro" style={{ marginBottom: '60px' }}>
            <div className="docs-h1" style={{ fontSize: '32px', fontWeight: 700, marginBottom: '16px' }}>Scnr REST API</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span className="chip" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '4px 10px', borderRadius: '20px', fontWeight: 600, fontSize: '12px' }}>● v1 — Stable</span>
              <span style={{ fontSize: '12px', color: '#71717a' }}>Base URL: <code style={{ fontFamily: 'monospace', color: '#f43f5e' }}>{window.location.origin}/api</code></span>
            </div>
            <div className="docs-p" style={{ color: '#a1a1aa', lineHeight: 1.6, marginBottom: '24px' }}>The Scnr API gives you programmatic access to everything in the dashboard — create and manage QR codes, fetch real-time analytics, and listen to scan events via webhooks.</div>
            <div className="alert-box alert-info" style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '16px', borderRadius: '8px', display: 'flex', gap: '12px' }}>
              <span className="alert-icon" style={{ color: '#3b82f6' }}>ℹ</span>
              <span style={{ color: '#d4d4d8', fontSize: '14px' }}>All requests must include your API key in the <code style={{ fontFamily: 'monospace' }}>Authorization</code> header. Keys are scoped to read, write, or admin.</span>
            </div>
          </div>

          <div className="docs-section" id="auth-section" style={{ marginBottom: '60px' }}>
            <div className="docs-h2" style={{ fontSize: '24px', fontWeight: 600, marginBottom: '16px', borderBottom: '1px solid #27272a', paddingBottom: '8px' }}><span className="method-tag post" style={{ fontSize: '11px', marginRight: '8px' }}>AUTH</span> Authentication</div>
            <div className="docs-p" style={{ color: '#a1a1aa', lineHeight: 1.6, marginBottom: '16px' }}>Scnr uses Bearer token authentication. Pass your API key in every request header:</div>
            <div className="code-block" style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '8px', padding: '16px', position: 'relative', marginBottom: '24px' }}>
              <button className="code-copy" onClick={() => handleCopy('Authorization: Bearer sk_live_your_api_key_here', 'auth')} style={{ position: 'absolute', top: '8px', right: '8px', background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}>
                {copied === 'auth' ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <pre style={{ margin: 0, color: '#e4e4e7', fontFamily: 'monospace', fontSize: '14px' }}><span style={{ color: '#3b82f6' }}>Authorization</span>: Bearer <span style={{ color: '#10b981' }}>sk_live_your_api_key_here</span></pre>
            </div>
          </div>

          <div className="docs-section" id="base-url" style={{ marginBottom: '60px' }}>
            <div className="docs-h2" style={{ fontSize: '24px', fontWeight: 600, marginBottom: '16px', borderBottom: '1px solid #27272a', paddingBottom: '8px' }}>Base URL & versioning</div>
            <div className="docs-p" style={{ color: '#a1a1aa', lineHeight: 1.6, marginBottom: '16px' }}>All endpoints are versioned under <code style={{ fontFamily: 'monospace', color: '#f43f5e' }}>/v1</code>. We will never make breaking changes to v1.</div>
            <div className="code-block" style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '8px', padding: '16px', position: 'relative' }}>
              <button className="code-copy" onClick={() => handleCopy(`${window.location.origin}/api`, 'base')} style={{ position: 'absolute', top: '8px', right: '8px', background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}>
                {copied === 'base' ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <pre style={{ margin: 0, color: '#e4e4e7', fontFamily: 'monospace', fontSize: '14px' }}><span style={{ color: '#71717a' }}># Production</span>
<span style={{ color: '#e4e4e7' }}>{window.location.origin}/api</span></pre>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
