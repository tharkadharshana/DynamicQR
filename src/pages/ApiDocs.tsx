import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

const CodeBlock = ({ code, children }: { code: string, children: React.ReactNode }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="code-block">
      <button className="code-copy" onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre>{children}</pre>
    </div>
  );
};

const EndpointCard = ({ method, path, desc, children, defaultOpen = false }: { method: string, path: string, desc: string, children: React.ReactNode, defaultOpen?: boolean }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className={`endpoint-card ${isOpen ? 'open' : ''}`}>
      <div className="endpoint-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="endpoint-left">
          <span className={`method-tag ${method.toLowerCase()}`}>{method}</span>
          <span className="endpoint-path">{path}</span>
          <span className="endpoint-desc">{desc}</span>
        </div>
        <span className="endpoint-chevron">▼</span>
      </div>
      <div className="endpoint-body">
        {children}
      </div>
    </div>
  );
};

export default function ApiDocs() {
  const [activeNav, setActiveNav] = useState('intro');

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      setActiveNav(id);
    }
  };

  const baseUrl = `${window.location.origin}/api/v1`;

  return (
    <div className="page active" style={{ padding: 0, height: 'calc(100vh - 56px)' }}>
      <div className="docs-layout" style={{ height: '100%' }}>
        
        {/* Sidebar Nav */}
        <div className="docs-nav">
          <div className="docs-nav-section">
            <div className="docs-nav-label">Getting started</div>
            <div className={`docs-nav-item ${activeNav === 'intro' ? 'active' : ''}`} onClick={() => scrollToSection('intro')}>Introduction</div>
            <div className={`docs-nav-item ${activeNav === 'auth-section' ? 'active' : ''}`} onClick={() => scrollToSection('auth-section')}>Authentication</div>
            <div className={`docs-nav-item ${activeNav === 'base-url' ? 'active' : ''}`} onClick={() => scrollToSection('base-url')}>Base URL & versioning</div>
            <div className={`docs-nav-item ${activeNav === 'errors' ? 'active' : ''}`} onClick={() => scrollToSection('errors')}>Error handling</div>
            <div className={`docs-nav-item ${activeNav === 'ratelimit' ? 'active' : ''}`} onClick={() => scrollToSection('ratelimit')}>Rate limits</div>
          </div>
          <div className="docs-nav-section">
            <div className="docs-nav-label">QR Codes</div>
            <div className={`docs-nav-item ${activeNav === 'qr-list' ? 'active' : ''}`} onClick={() => scrollToSection('qr-list')}><span className="method-tag get">GET</span>/qr</div>
            <div className={`docs-nav-item ${activeNav === 'qr-create' ? 'active' : ''}`} onClick={() => scrollToSection('qr-create')}><span className="method-tag post">POST</span>/qr</div>
            <div className={`docs-nav-item ${activeNav === 'qr-get' ? 'active' : ''}`} onClick={() => scrollToSection('qr-get')}><span className="method-tag get">GET</span>/qr/:id</div>
            <div className={`docs-nav-item ${activeNav === 'qr-update' ? 'active' : ''}`} onClick={() => scrollToSection('qr-update')}><span className="method-tag put">PUT</span>/qr/:id</div>
            <div className={`docs-nav-item ${activeNav === 'qr-delete' ? 'active' : ''}`} onClick={() => scrollToSection('qr-delete')}><span className="method-tag del">DEL</span>/qr/:id</div>
          </div>
          <div className="docs-nav-section">
            <div className="docs-nav-label">Analytics</div>
            <div className={`docs-nav-item ${activeNav === 'ana-summary' ? 'active' : ''}`} onClick={() => scrollToSection('ana-summary')}><span className="method-tag get">GET</span>/analytics/summary</div>
            <div className={`docs-nav-item ${activeNav === 'ana-timeseries' ? 'active' : ''}`} onClick={() => scrollToSection('ana-timeseries')}><span className="method-tag get">GET</span>/analytics/timeseries</div>
            <div className={`docs-nav-item ${activeNav === 'ana-geo' ? 'active' : ''}`} onClick={() => scrollToSection('ana-geo')}><span className="method-tag get">GET</span>/analytics/geo</div>
            <div className={`docs-nav-item ${activeNav === 'ana-devices' ? 'active' : ''}`} onClick={() => scrollToSection('ana-devices')}><span className="method-tag get">GET</span>/analytics/devices</div>
          </div>
          <div className="docs-nav-section">
            <div className="docs-nav-label">Webhooks</div>
            <div className={`docs-nav-item ${activeNav === 'webhooks' ? 'active' : ''}`} onClick={() => scrollToSection('webhooks')}>Overview</div>
            <div className={`docs-nav-item ${activeNav === 'webhook-events' ? 'active' : ''}`} onClick={() => scrollToSection('webhook-events')}>Event types</div>
            <div className={`docs-nav-item ${activeNav === 'webhook-verify' ? 'active' : ''}`} onClick={() => scrollToSection('webhook-verify')}>Signature verification</div>
          </div>
          <div className="docs-nav-section">
            <div className="docs-nav-label">API Keys</div>
            <div className={`docs-nav-item ${activeNav === 'api-keys' ? 'active' : ''}`} onClick={() => scrollToSection('api-keys')}>Manage keys</div>
          </div>
        </div>

        {/* Main Content */}
        <div className="docs-content" id="docs-scroll">
          
          {/* INTRO */}
          <div className="docs-section" id="intro">
            <div className="docs-h1">DynamicQR REST API</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span className="chip" style={{ background: 'var(--green-l)', color: 'var(--green)', padding: '4px 10px', borderRadius: '20px', fontWeight: 600, fontSize: '12px' }}>● v1 — Stable</span>
              <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Base URL: <code style={{ fontFamily: 'monospace', color: 'var(--coral)' }}>{baseUrl}</code></span>
            </div>
            <div className="docs-p">The DynamicQR API gives you programmatic access to everything in the dashboard — create and manage QR codes, fetch real-time analytics, and listen to scan events via webhooks. The API is available on the <strong style={{ color: 'var(--text)' }}>Team plan</strong> and above.</div>
            <div className="alert-box alert-info">
              <span className="alert-icon">ℹ</span>
              <span>All requests must include your API key in the <code style={{ fontFamily: 'monospace' }}>Authorization</code> header. Keys are scoped to read, write, or admin. <a href="#">Generate your first key →</a></span>
            </div>
          </div>

          {/* AUTH */}
          <div className="docs-section" id="auth-section">
            <div className="docs-h2"><span className="method-tag post" style={{ fontSize: '11px' }}>AUTH</span> Authentication</div>
            <div className="docs-p">DynamicQR uses Bearer token authentication. Pass your API key in every request header:</div>
            <CodeBlock code="Authorization: Bearer sk_live_your_api_key_here">
              <span className="hl-k">Authorization</span>: Bearer <span className="hl-s">sk_live_your_api_key_here</span>
            </CodeBlock>
            <div className="docs-p">Keys are prefixed with <code style={{ fontFamily: 'monospace', color: 'var(--amber)' }}>sk_live_</code> for production and <code style={{ fontFamily: 'monospace', color: 'var(--blue)' }}>sk_test_</code> for testing. Never expose keys in client-side code or public repositories.</div>
            <div className="alert-box alert-warn">
              <span className="alert-icon">⚠</span>
              <span>Treat your API key like a password. If compromised, rotate it immediately from your <a href="#">API Keys settings</a>. DynamicQR will never ask for your key via email or chat.</span>
            </div>
          </div>

          {/* BASE URL */}
          <div className="docs-section" id="base-url">
            <div className="docs-h2">Base URL & versioning</div>
            <div className="docs-p">All endpoints are versioned under <code style={{ fontFamily: 'monospace', color: 'var(--coral)' }}>/v1</code>. We will never make breaking changes to v1 — when a new version ships, v1 continues working with a deprecation notice.</div>
            <CodeBlock code={`# Production\n${baseUrl}\n\n# Example full endpoint\n${baseUrl}/qr`}>
              <span className="hl-c"># Production</span>{'\n'}
              <span className="hl-n">{baseUrl}</span>{'\n\n'}
              <span className="hl-c"># Example full endpoint</span>{'\n'}
              <span className="hl-n">{baseUrl}/qr</span>
            </CodeBlock>
          </div>

          {/* ERRORS */}
          <div className="docs-section" id="errors">
            <div className="docs-h2">Error handling</div>
            <div className="docs-p">All errors return a consistent JSON shape with a machine-readable <code style={{ fontFamily: 'monospace', color: 'var(--amber)' }}>code</code> and a human-readable <code style={{ fontFamily: 'monospace', color: 'var(--amber)' }}>message</code>.</div>
            <CodeBlock code={`// 400 Bad Request\n{\n  "error": {\n    "code":    "INVALID_URL",\n    "message": "destination_url must start with https://",\n    "field":   "destination_url"\n  }\n}`}>
              <span className="hl-c">// 400 Bad Request</span>{'\n'}
              {'{'}{'\n'}
              {'  '}<span className="hl-k">"error"</span>: {'{'}{'\n'}
              {'    '}<span className="hl-k">"code"</span>:    <span className="hl-s">"INVALID_URL"</span>,{'\n'}
              {'    '}<span className="hl-k">"message"</span>: <span className="hl-s">"destination_url must start with https://"</span>,{'\n'}
              {'    '}<span className="hl-k">"field"</span>:   <span className="hl-s">"destination_url"</span>{'\n'}
              {'  '}{'}'}{'\n'}
              {'}'}
            </CodeBlock>
            <table className="param-table">
              <thead><tr><th>HTTP Status</th><th>Code</th><th>Meaning</th></tr></thead>
              <tbody>
                <tr><td><span className="param-type">400</span></td><td><span className="param-name">INVALID_PARAMS</span></td><td className="param-desc">Missing or malformed request body</td></tr>
                <tr><td><span className="param-type">401</span></td><td><span className="param-name">UNAUTHORIZED</span></td><td className="param-desc">Missing or invalid API key</td></tr>
                <tr><td><span className="param-type">403</span></td><td><span className="param-name">FORBIDDEN</span></td><td className="param-desc">Key lacks required scope</td></tr>
                <tr><td><span className="param-type">404</span></td><td><span className="param-name">NOT_FOUND</span></td><td className="param-desc">Resource does not exist or belongs to another user</td></tr>
                <tr><td><span className="param-type">429</span></td><td><span className="param-name">RATE_LIMITED</span></td><td className="param-desc">Too many requests — see Retry-After header</td></tr>
                <tr><td><span className="param-type">500</span></td><td><span className="param-name">SERVER_ERROR</span></td><td className="param-desc">Something went wrong on our end</td></tr>
              </tbody>
            </table>
          </div>

          {/* RATE LIMITS */}
          <div className="docs-section" id="ratelimit">
            <div className="docs-h2">Rate limits</div>
            <div className="docs-p">Rate limits are applied per API key. Responses include <code style={{ fontFamily: 'monospace', color: 'var(--amber)' }}>X-RateLimit-*</code> headers so you can track usage.</div>
            <table className="param-table">
              <thead><tr><th>Plan</th><th>Requests / minute</th><th>Requests / day</th></tr></thead>
              <tbody>
                <tr><td>Free</td><td className="param-desc">API not available</td><td className="param-desc">—</td></tr>
                <tr><td style={{ color: 'var(--amber)' }}>Pro</td><td className="param-desc">API not available</td><td className="param-desc">—</td></tr>
                <tr><td style={{ color: 'var(--purple)' }}>Team</td><td><span className="param-type">60 req/min</span></td><td><span className="param-type">10,000 req/day</span></td></tr>
              </tbody>
            </table>
          </div>

          {/* QR LIST */}
          <div className="docs-section" id="qr-list">
            <div className="docs-h2"><span className="method-tag get">GET</span> /qr — List QR codes</div>
            <div className="docs-p">Returns a paginated list of all QR codes belonging to the authenticated user.</div>
            <EndpointCard method="GET" path="/v1/qr" desc="List all QR codes" defaultOpen={true}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Query parameters</div>
              <table className="param-table" style={{ marginBottom: '16px' }}>
                <thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td><span className="param-name">limit</span></td><td><span className="param-type">integer</span></td><td><span className="param-opt">optional</span></td><td className="param-desc">Number of results per page. Default: 20, max: 100</td></tr>
                  <tr><td><span className="param-name">offset</span></td><td><span className="param-type">integer</span></td><td><span className="param-opt">optional</span></td><td className="param-desc">Pagination offset. Default: 0</td></tr>
                  <tr><td><span className="param-name">active</span></td><td><span className="param-type">boolean</span></td><td><span className="param-opt">optional</span></td><td className="param-desc">Filter by active status. Omit to return all</td></tr>
                </tbody>
              </table>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Example request</div>
              <CodeBlock code={`curl ${baseUrl}/qr?limit=10&active=true \\\n  -H "Authorization: Bearer sk_live_xxxx"`}>
                <span className="hl-n">curl</span> {baseUrl}/qr?limit=10&active=true \{'\n'}
                {'  '}-H <span className="hl-s">"Authorization: Bearer sk_live_xxxx"</span>
              </CodeBlock>
              <div className="response-tabs">
                <button className="resp-tab active">200 OK</button>
                <button className="resp-tab">401</button>
              </div>
              <CodeBlock code={`{\n  "data": [\n    {\n      "id":              "qr_x9Km4p",\n      "slug":           "x9Km4p",\n      "short_url":      "https://dynamicqr.app/x9Km4p",\n      "destination_url":"https://yoursite.com/menu",\n      "title":          "Restaurant Menu",\n      "is_active":      true,\n      "type":           "url",\n      "total_scans":    18420,\n      "created_at":     "2026-02-14T10:32:00Z",\n      "updated_at":     "2026-03-18T08:11:00Z"\n    }\n  ],\n  "meta": {\n    "total":  7,\n    "limit":  10,\n    "offset": 0\n  }\n}`}>
                {'{'}{'\n'}
                {'  '}<span className="hl-k">"data"</span>: [{'\n'}
                {'    '}{'{'}{'\n'}
                {'      '}<span className="hl-k">"id"</span>:              <span className="hl-s">"qr_x9Km4p"</span>,{'\n'}
                {'      '}<span className="hl-k">"slug"</span>:           <span className="hl-s">"x9Km4p"</span>,{'\n'}
                {'      '}<span className="hl-k">"short_url"</span>:      <span className="hl-s">"https://dynamicqr.app/x9Km4p"</span>,{'\n'}
                {'      '}<span className="hl-k">"destination_url"</span>:<span className="hl-s">"https://yoursite.com/menu"</span>,{'\n'}
                {'      '}<span className="hl-k">"title"</span>:          <span className="hl-s">"Restaurant Menu"</span>,{'\n'}
                {'      '}<span className="hl-k">"is_active"</span>:      <span className="hl-v">true</span>,{'\n'}
                {'      '}<span className="hl-k">"type"</span>:           <span className="hl-s">"url"</span>,{'\n'}
                {'      '}<span className="hl-k">"total_scans"</span>:    <span className="hl-v">18420</span>,{'\n'}
                {'      '}<span className="hl-k">"created_at"</span>:     <span className="hl-s">"2026-02-14T10:32:00Z"</span>,{'\n'}
                {'      '}<span className="hl-k">"updated_at"</span>:     <span className="hl-s">"2026-03-18T08:11:00Z"</span>{'\n'}
                {'    '}{'}'}{'\n'}
                {'  '}],{'\n'}
                {'  '}<span className="hl-k">"meta"</span>: {'{'}{'\n'}
                {'    '}<span className="hl-k">"total"</span>:  <span className="hl-v">7</span>,{'\n'}
                {'    '}<span className="hl-k">"limit"</span>:  <span className="hl-v">10</span>,{'\n'}
                {'    '}<span className="hl-k">"offset"</span>: <span className="hl-v">0</span>{'\n'}
                {'  '}{'}'}{'\n'}
                {'}'}
              </CodeBlock>
            </EndpointCard>
          </div>

          {/* QR CREATE */}
          <div className="docs-section" id="qr-create">
            <div className="docs-h2"><span className="method-tag post">POST</span> /qr — Create QR code</div>
            <div className="docs-p">Creates a new QR code. The slug is auto-generated (7 chars, collision-safe). The QR image is returned as both SVG and PNG base64.</div>
            <EndpointCard method="POST" path="/v1/qr" desc="Create a new QR code">
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Request body</div>
              <table className="param-table" style={{ marginBottom: '16px' }}>
                <thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td><span className="param-name">destination_url</span></td><td><span className="param-type">string</span></td><td><span className="param-req">required</span></td><td className="param-desc">Must start with https://. Max 2048 chars.</td></tr>
                  <tr><td><span className="param-name">title</span></td><td><span className="param-type">string</span></td><td><span className="param-opt">optional</span></td><td className="param-desc">Human-readable label. Max 100 chars.</td></tr>
                  <tr><td><span className="param-name">type</span></td><td><span className="param-type">enum</span></td><td><span className="param-opt">optional</span></td><td className="param-desc">url · vcard · wifi · text · email. Default: url</td></tr>
                  <tr><td><span className="param-name">style.dot_color</span></td><td><span className="param-type">string</span></td><td><span className="param-opt">optional</span></td><td className="param-desc">Hex color for QR dots. Default: #000000</td></tr>
                  <tr><td><span className="param-name">style.bg_color</span></td><td><span className="param-type">string</span></td><td><span className="param-opt">optional</span></td><td className="param-desc">Hex color for background. Default: #FFFFFF</td></tr>
                  <tr><td><span className="param-name">style.error_correction</span></td><td><span className="param-type">enum</span></td><td><span className="param-opt">optional</span></td><td className="param-desc">L · M · Q · H. Default: M. Use H for logos.</td></tr>
                  <tr><td><span className="param-name">is_dynamic</span></td><td><span className="param-type">boolean</span></td><td><span className="param-opt">optional</span></td><td className="param-desc">Enable analytics + editable destination. Default: true</td></tr>
                </tbody>
              </table>
              <CodeBlock code={`curl -X POST ${baseUrl}/qr \\\n  -H "Authorization: Bearer sk_live_xxxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "destination_url": "https://yoursite.com/menu",\n    "title": "Restaurant Menu",\n    "style": { "dot_color": "#E85D3A", "bg_color": "#FFFFFF" },\n    "is_dynamic": true\n  }'`}>
                <span className="hl-n">curl</span> -X POST {baseUrl}/qr \{'\n'}
                {'  '}-H <span className="hl-s">"Authorization: Bearer sk_live_xxxx"</span> \{'\n'}
                {'  '}-H <span className="hl-s">"Content-Type: application/json"</span> \{'\n'}
                {'  '}-d <span className="hl-s">{`'{
    "destination_url": "https://yoursite.com/menu",
    "title": "Restaurant Menu",
    "style": { "dot_color": "#E85D3A", "bg_color": "#FFFFFF" },
    "is_dynamic": true
  }'`}</span>
              </CodeBlock>
            </EndpointCard>
          </div>

          {/* QR GET / UPDATE / DELETE */}
          <div className="docs-section" id="qr-get">
            <div className="docs-h2"><span className="method-tag get">GET</span> /qr/:id — Get QR code</div>
            <EndpointCard method="GET" path="/v1/qr/{id}" desc="Get a single QR code by ID">
              <div className="docs-p">Returns the full QR code object including style config and total scan count.</div>
              <CodeBlock code={`curl ${baseUrl}/qr/qr_x9Km4p \\\n  -H "Authorization: Bearer sk_live_xxxx"`}>
                <span className="hl-n">curl</span> {baseUrl}/qr/qr_x9Km4p \{'\n'}
                {'  '}-H <span className="hl-s">"Authorization: Bearer sk_live_xxxx"</span>
              </CodeBlock>
            </EndpointCard>
          </div>

          <div className="docs-section" id="qr-update">
            <div className="docs-h2"><span className="method-tag put">PUT</span> /qr/:id — Update QR code</div>
            <EndpointCard method="PUT" path="/v1/qr/{id}" desc="Update destination or style">
              <div className="docs-p">Update any field except <code style={{ fontFamily: 'monospace', color: 'var(--amber)' }}>slug</code> (immutable). Changing <code style={{ fontFamily: 'monospace', color: 'var(--amber)' }}>destination_url</code> takes effect within 5 minutes as the Cloudflare KV cache expires.</div>
              <table className="param-table"><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody>
                <tr><td><span className="param-name">destination_url</span></td><td><span className="param-type">string</span></td><td className="param-desc">New redirect destination</td></tr>
                <tr><td><span className="param-name">title</span></td><td><span className="param-type">string</span></td><td className="param-desc">Update the display label</td></tr>
                <tr><td><span className="param-name">is_active</span></td><td><span className="param-type">boolean</span></td><td className="param-desc">Deactivate returns 410 on scan</td></tr>
                <tr><td><span className="param-name">style</span></td><td><span className="param-type">object</span></td><td className="param-desc">Regenerates the QR image</td></tr>
              </tbody></table>
            </EndpointCard>
          </div>

          <div className="docs-section" id="qr-delete">
            <div className="docs-h2"><span className="method-tag del">DEL</span> /qr/:id — Delete QR code</div>
            <EndpointCard method="DEL" path="/v1/qr/{id}" desc="Permanently deactivate a QR">
              <div className="alert-box alert-warn"><span className="alert-icon">⚠</span><span>QR codes are never fully deleted — the slug must remain reserved so printed codes don't resolve to a wrong URL. Deletion sets <code style={{ fontFamily: 'monospace' }}>is_active=false</code> and returns 410 on scan.</span></div>
              <CodeBlock code={`curl -X DELETE ${baseUrl}/qr/qr_x9Km4p \\\n  -H "Authorization: Bearer sk_live_xxxx"\n\n// 200 OK\n{ "deleted": true, "id": "qr_x9Km4p" }`}>
                <span className="hl-n">curl</span> -X DELETE {baseUrl}/qr/qr_x9Km4p \{'\n'}
                {'  '}-H <span className="hl-s">"Authorization: Bearer sk_live_xxxx"</span>{'\n\n'}
                <span className="hl-c">// 200 OK</span>{'\n'}
                {'{ '} <span className="hl-k">"deleted"</span>: <span className="hl-v">true</span>, <span className="hl-k">"id"</span>: <span className="hl-s">"qr_x9Km4p"</span> {' }'}
              </CodeBlock>
            </EndpointCard>
          </div>

          {/* ANALYTICS */}
          <div className="docs-section" id="ana-summary">
            <div className="docs-h2"><span className="method-tag get">GET</span> /analytics/summary</div>
            <EndpointCard method="GET" path="/v1/analytics/{slug}/summary" desc="Totals, velocity, unique count">
              <CodeBlock code={`{\n  "slug":          "x9Km4p",\n  "total_scans":   18420,\n  "unique_scans":  4821,\n  "mobile_pct":    71.2,\n  "velocity":      23.4,  // % change vs previous period\n  "first_scan_at": "2026-02-14T10:32:00Z",\n  "last_scan_at":  "2026-03-21T14:08:22Z"\n}`}>
                {'{'}{'\n'}
                {'  '}<span className="hl-k">"slug"</span>:          <span className="hl-s">"x9Km4p"</span>,{'\n'}
                {'  '}<span className="hl-k">"total_scans"</span>:   <span className="hl-v">18420</span>,{'\n'}
                {'  '}<span className="hl-k">"unique_scans"</span>:  <span className="hl-v">4821</span>,{'\n'}
                {'  '}<span className="hl-k">"mobile_pct"</span>:    <span className="hl-v">71.2</span>,{'\n'}
                {'  '}<span className="hl-k">"velocity"</span>:      <span className="hl-v">23.4</span>,  <span className="hl-c">// % change vs previous period</span>{'\n'}
                {'  '}<span className="hl-k">"first_scan_at"</span>: <span className="hl-s">"2026-02-14T10:32:00Z"</span>,{'\n'}
                {'  '}<span className="hl-k">"last_scan_at"</span>:  <span className="hl-s">"2026-03-21T14:08:22Z"</span>{'\n'}
                {'}'}
              </CodeBlock>
            </EndpointCard>
          </div>

          <div className="docs-section" id="ana-timeseries">
            <div className="docs-h2"><span className="method-tag get">GET</span> /analytics/timeseries</div>
            <EndpointCard method="GET" path="/v1/analytics/{slug}/timeseries" desc="Daily scan counts over a range">
              <table className="param-table" style={{ marginBottom: '14px' }}><thead><tr><th>Param</th><th>Type</th><th>Default</th></tr></thead><tbody>
                <tr><td><span className="param-name">days</span></td><td><span className="param-type">integer</span></td><td className="param-desc">30. Max: 365 (Team), 90 (Pro)</td></tr>
                <tr><td><span className="param-name">timezone</span></td><td><span className="param-type">string</span></td><td className="param-desc">UTC. IANA format e.g. Asia/Colombo</td></tr>
              </tbody></table>
              <CodeBlock code={`{\n  "data": [\n    { "date": "2026-03-20", "total": 580, "unique": 162 },\n    { "date": "2026-03-21", "total": 600, "unique": 171 }\n  ]\n}`}>
                {'{'}{'\n'}
                {'  '}<span className="hl-k">"data"</span>: [{'\n'}
                {'    '}{'{ '} <span className="hl-k">"date"</span>: <span className="hl-s">"2026-03-20"</span>, <span className="hl-k">"total"</span>: <span className="hl-v">580</span>, <span className="hl-k">"unique"</span>: <span className="hl-v">162</span> {' }'},{'\n'}
                {'    '}{'{ '} <span className="hl-k">"date"</span>: <span className="hl-s">"2026-03-21"</span>, <span className="hl-k">"total"</span>: <span className="hl-v">600</span>, <span className="hl-k">"unique"</span>: <span className="hl-v">171</span> {' }'}{'\n'}
                {'  '}]{'\n'}
                {'}'}
              </CodeBlock>
            </EndpointCard>
          </div>

          <div className="docs-section" id="ana-geo">
            <div className="docs-h2"><span className="method-tag get">GET</span> /analytics/geo</div>
            <EndpointCard method="GET" path="/v1/analytics/{slug}/geo" desc="Country breakdown">
              <CodeBlock code={`{\n  "data": [\n    { "country": "LK", "scans": 8420, "pct": 45.7 },\n    { "country": "US", "scans": 4210, "pct": 22.9 }\n  ]\n}`}>
                {'{'}{'\n'}
                {'  '}<span className="hl-k">"data"</span>: [{'\n'}
                {'    '}{'{ '} <span className="hl-k">"country"</span>: <span className="hl-s">"LK"</span>, <span className="hl-k">"scans"</span>: <span className="hl-v">8420</span>, <span className="hl-k">"pct"</span>: <span className="hl-v">45.7</span> {' }'},{'\n'}
                {'    '}{'{ '} <span className="hl-k">"country"</span>: <span className="hl-s">"US"</span>, <span className="hl-k">"scans"</span>: <span className="hl-v">4210</span>, <span className="hl-k">"pct"</span>: <span className="hl-v">22.9</span> {' }'}{'\n'}
                {'  '}]{'\n'}
                {'}'}
              </CodeBlock>
            </EndpointCard>
          </div>

          <div className="docs-section" id="ana-devices">
            <div className="docs-h2"><span className="method-tag get">GET</span> /analytics/devices</div>
            <EndpointCard method="GET" path="/v1/analytics/{slug}/devices" desc="Device, OS, and browser split">
              <CodeBlock code={`{\n  "devices":  { "mobile": 71, "desktop": 27, "tablet": 2 },\n  "os":       { "Android": 42, "iOS": 31, "Windows": 18 },\n  "browsers": { "Chrome": 52, "Safari": 28, "Firefox": 12 }\n}`}>
                {'{'}{'\n'}
                {'  '}<span className="hl-k">"devices"</span>:  {'{ '} <span className="hl-s">"mobile"</span>: <span className="hl-v">71</span>, <span className="hl-s">"desktop"</span>: <span className="hl-v">27</span>, <span className="hl-s">"tablet"</span>: <span className="hl-v">2</span> {' }'},{'\n'}
                {'  '}<span className="hl-k">"os"</span>:       {'{ '} <span className="hl-s">"Android"</span>: <span className="hl-v">42</span>, <span className="hl-s">"iOS"</span>: <span className="hl-v">31</span>, <span className="hl-s">"Windows"</span>: <span className="hl-v">18</span> {' }'},{'\n'}
                {'  '}<span className="hl-k">"browsers"</span>: {'{ '} <span className="hl-s">"Chrome"</span>: <span className="hl-v">52</span>, <span className="hl-s">"Safari"</span>: <span className="hl-v">28</span>, <span className="hl-s">"Firefox"</span>: <span className="hl-v">12</span> {' }'}{'\n'}
                {'}'}
              </CodeBlock>
            </EndpointCard>
          </div>

          {/* WEBHOOKS */}
          <div className="docs-section" id="webhooks">
            <div className="docs-h2">Webhooks — Overview</div>
            <div className="docs-p">DynamicQR can POST to your server in real time when a QR is scanned, created, updated, or deactivated. Configure your endpoint URL in the dashboard under Settings → Webhooks.</div>
            <div className="alert-box alert-info"><span className="alert-icon">ℹ</span><span>Webhook deliveries are retried up to 5 times with exponential backoff if your server returns a non-200 status. Your endpoint must respond within 5 seconds.</span></div>
          </div>

          <div className="docs-section" id="webhook-events">
            <div className="docs-h2">Event types</div>
            <table className="param-table">
              <thead><tr><th>Event</th><th>Trigger</th></tr></thead>
              <tbody>
                <tr><td><span className="param-name">qr.scanned</span></td><td className="param-desc">Every scan — includes country, device, is_unique flag</td></tr>
                <tr><td><span className="param-name">qr.created</span></td><td className="param-desc">New QR code created via dashboard or API</td></tr>
                <tr><td><span className="param-name">qr.updated</span></td><td className="param-desc">Destination URL or style changed</td></tr>
                <tr><td><span className="param-name">qr.deactivated</span></td><td className="param-desc">QR set to inactive</td></tr>
                <tr><td><span className="param-name">scan.milestone</span></td><td className="param-desc">QR hits 100, 1K, 10K, 100K total scans</td></tr>
              </tbody>
            </table>
            <CodeBlock code={`// POST to your endpoint\n{\n  "event":      "qr.scanned",\n  "created_at": "2026-03-21T14:08:22Z",\n  "data": {\n    "slug":      "x9Km4p",\n    "country":  "LK",\n    "device":   "mobile",\n    "is_unique":true,\n    "browser":  "Chrome"\n  }\n}`}>
              <span className="hl-c">// POST to your endpoint</span>{'\n'}
              {'{'}{'\n'}
              {'  '}<span className="hl-k">"event"</span>:      <span className="hl-s">"qr.scanned"</span>,{'\n'}
              {'  '}<span className="hl-k">"created_at"</span>: <span className="hl-s">"2026-03-21T14:08:22Z"</span>,{'\n'}
              {'  '}<span className="hl-k">"data"</span>: {'{'}{'\n'}
              {'    '}<span className="hl-k">"slug"</span>:      <span className="hl-s">"x9Km4p"</span>,{'\n'}
              {'    '}<span className="hl-k">"country"</span>:  <span className="hl-s">"LK"</span>,{'\n'}
              {'    '}<span className="hl-k">"device"</span>:   <span className="hl-s">"mobile"</span>,{'\n'}
              {'    '}<span className="hl-k">"is_unique"</span>:<span className="hl-v">true</span>,{'\n'}
              {'    '}<span className="hl-k">"browser"</span>:  <span className="hl-s">"Chrome"</span>{'\n'}
              {'  '}{'}'}{'\n'}
              {'}'}
            </CodeBlock>
          </div>

          <div className="docs-section" id="webhook-verify">
            <div className="docs-h2">Signature verification</div>
            <div className="docs-p">Every webhook POST includes an <code style={{ fontFamily: 'monospace', color: 'var(--amber)' }}>X-DynamicQR-Signature</code> header. Verify it to confirm the request came from DynamicQR and not a third party.</div>
            <CodeBlock code={`// Node.js verification\nconst crypto = require('crypto')\n\nfunction verifyWebhook(body, signature, secret) {\n  const expected = crypto\n    .createHmac('sha256', secret)\n    .update(body)\n    .digest('hex')\n  return crypto.timingSafeEqual(\n    Buffer.from(expected),\n    Buffer.from(signature)\n  )\n}`}>
              <span className="hl-c">// Node.js verification</span>{'\n'}
              <span className="hl-k">const</span> crypto = <span className="hl-n">require</span>(<span className="hl-s">'crypto'</span>){'\n\n'}
              <span className="hl-k">function</span> <span className="hl-n">verifyWebhook</span>(body: any, signature: any, secret: any) {'{'}{'\n'}
              {'  '}<span className="hl-k">const</span> expected = crypto{'\n'}
              {'    '}.<span className="hl-n">createHmac</span>(<span className="hl-s">'sha256'</span>, secret){'\n'}
              {'    '}.<span className="hl-n">update</span>(body){'\n'}
              {'    '}.<span className="hl-n">digest</span>(<span className="hl-s">'hex'</span>){'\n'}
              {'  '}<span className="hl-k">return</span> crypto.<span className="hl-n">timingSafeEqual</span>({'\n'}
              {'    '}Buffer.<span className="hl-n">from</span>(expected),{'\n'}
              {'    '}Buffer.<span className="hl-n">from</span>(signature){'\n'}
              {'  '}){'\n'}
              {'}'}
            </CodeBlock>
          </div>

          {/* API KEYS */}
          <div className="docs-section" id="api-keys">
            <div className="docs-h2">API Keys</div>
            <div className="docs-p">Generate and manage API keys below. Keys are only shown once at creation — store them securely. You can create up to 5 keys per account.</div>
            <div id="api-keys-list" style={{ marginBottom: '16px' }}></div>
            <button className="btn btn-primary">+ Generate new key</button>
          </div>

        </div>
      </div>
    </div>
  );
}

