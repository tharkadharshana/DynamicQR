import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { useUI } from '../shared/UIContext';

export function getQRContent(qr: any): string {
  if (qr.is_dynamic !== false) {
    return `${window.location.origin}/${qr.slug}`;
  }
  if (qr.qr_type === 'vcard') {
    const d = qr.content_data || {};
    return `BEGIN:VCARD\nVERSION:3.0\nN:${d.last_name||''};${d.first_name||''}\nFN:${d.first_name||''} ${d.last_name||''}\nTEL:${d.phone||''}\nEMAIL:${d.email||''}\nORG:${d.company||''}\nURL:${d.website||''}\nEND:VCARD`;
  }
  if (qr.qr_type === 'wifi') {
    const d = qr.content_data || {};
    return `WIFI:S:${d.ssid||''};T:${d.encryption||'WPA'};P:${d.password||''};;`;
  }
  if (qr.qr_type === 'text') return qr.content_data?.text || '';
  if (qr.qr_type === 'email') {
    const d = qr.content_data || {};
    return `mailto:${d.email||''}?subject=${encodeURIComponent(d.subject||'')}&body=${encodeURIComponent(d.body||'')}`;
  }
  return qr.destination_url || 'https://scnr.app';
}

export default function QRViewerModal({ qr, onClose }: { qr: any; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { showToast } = useUI();
  const shortUrl = `${window.location.host}/${qr.slug}`;
  const content = getQRContent(qr);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, content, {
      width: 280,
      margin: 2,
      color: {
        dark: qr.style?.dot_color || '#000000',
        light: qr.style?.bg_color || '#FFFFFF',
      },
    }).catch(console.error);
  }, [content, qr.style]);

  const handleDownload = async () => {
    try {
      const dataUrl = await QRCode.toDataURL(content, {
        width: 1024,
        margin: 2,
        color: {
          dark: qr.style?.dot_color || '#000000',
          light: qr.style?.bg_color || '#FFFFFF',
        },
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${(qr.title || qr.slug).replace(/[^a-z0-9]/gi, '_')}-qr.png`;
      a.click();
    } catch {
      showToast('error', 'Failed to generate download');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`https://${shortUrl}`).then(() => {
      showToast('success', 'Link copied!');
    });
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', width: '340px', boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)', marginBottom: '4px' }}>{qr.title || 'Untitled'}</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'monospace' }}>{shortUrl}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '20px', lineHeight: 1, padding: '2px 6px' }}
            aria-label="Close"
          >×</button>
        </div>

        {/* QR Canvas */}
        <div style={{ display: 'flex', justifyContent: 'center', background: qr.style?.bg_color || '#FFFFFF', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
          <canvas ref={canvasRef} width={280} height={280} style={{ display: 'block', borderRadius: '4px' }} />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleDownload}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download PNG
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={handleCopy}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            Copy Link
          </button>
        </div>

        {/* Destination */}
        {qr.destination_url && (
          <div style={{ fontSize: '11px', color: 'var(--text3)', padding: '10px 12px', background: 'var(--surface2)', borderRadius: '8px', wordBreak: 'break-all' }}>
            <span style={{ fontWeight: 600, color: 'var(--text2)' }}>Destination: </span>{qr.destination_url}
          </div>
        )}
      </div>
    </div>
  );
}
