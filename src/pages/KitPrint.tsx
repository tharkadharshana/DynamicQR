import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import QRCodeStyling from 'qr-code-styling';
import { apiFetch } from '../lib/api';
import { getQRContent, stylingOptions, SHORT_HOST } from '../lib/qrContent';

// A6 table tent. Printing uses the browser's own print-to-PDF (no PDF library).
const PRINT_CSS = `
@page { size: A6 portrait; margin: 0; }
@media print {
  body * { visibility: hidden !important; }
  #tent, #tent * { visibility: visible !important; }
  #tent { position: fixed; inset: 0; margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
  .no-print { display: none !important; }
}`;

function StyledQR({ qr, size }: { qr: any; size: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !qr) return;
    const q = new QRCodeStyling({ ...stylingOptions(qr.style, getQRContent(qr), size), margin: 4, type: 'svg' });
    ref.current.innerHTML = '';
    q.append(ref.current);
  }, [qr, size]);
  return <div ref={ref} style={{ width: size, height: size }} />;
}

export default function KitPrint() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const [qr, setQr] = useState<any>(null);
  const [wifi, setWifi] = useState<any>(null);

  useEffect(() => {
    if (!slug) return;
    apiFetch(`/api/qr/${slug}`).then(setQr).catch(console.error);
    const w = params.get('wifi');
    if (w) apiFetch(`/api/qr/${w}`).then(setWifi).catch(() => setWifi(null));
    apiFetch('/api/events', { method: 'POST', body: JSON.stringify({ name: 'print_opened', slug }) }).catch(() => {});
  }, [slug]);

  if (!qr) return <div className="content" style={{ padding: '28px' }}>Loading…</div>;
  const d = qr.content_data || {};

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <style>{PRINT_CSS}</style>
      <div className="no-print" style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => window.print()}>Print / save as PDF (A6)</button>
        <Link className="btn btn-ghost" to={`/kit?edit=${slug}`}>Edit kit</Link>
        <Link className="btn btn-ghost" to="/">Done</Link>
        <span style={{ fontSize: '12px', color: 'var(--text3)', alignSelf: 'center' }}>Tip: print one, scan it with your phone, then print the rest.</span>
      </div>
      <div id="tent" style={{ width: '105mm', minHeight: '148mm', background: '#fff', color: '#24180F', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,.2)', padding: '10mm 8mm', boxSizing: 'border-box', display: 'grid', justifyItems: 'center', alignContent: 'start', gap: '4mm', textAlign: 'center', fontFamily: "system-ui, 'Noto Sans Sinhala', 'Noto Sans Tamil', sans-serif" }}>
        <div style={{ fontSize: '20pt', fontWeight: 700, color: d.color || '#2B4A3A' }}>{d.name || qr.title}</div>
        <div style={{ fontSize: '10pt' }}>Scan for our menu, offers & Wi-Fi</div>
        <div style={{ fontSize: '9pt', opacity: .8 }}>මෙනුව සහ දීමනා සඳහා ස්කෑන් කරන්න · மெனு மற்றும் சலுகைகளுக்கு ஸ்கேன் செய்யுங்கள்</div>
        <StyledQR qr={qr} size={250} />
        {d.offer?.text && <div style={{ fontSize: '11pt', fontWeight: 600, background: '#F6D9B8', borderRadius: '6px', padding: '2mm 4mm' }}>{d.offer.text}</div>}
        {wifi && (
          <div style={{ display: 'flex', gap: '4mm', alignItems: 'center', marginTop: '2mm' }}>
            <StyledQR qr={wifi} size={90} />
            <div style={{ fontSize: '9pt', textAlign: 'left' }}><b>Wi-Fi</b><br />{wifi.content_data?.ssid}<br />Scan to join</div>
          </div>
        )}
        <div style={{ fontSize: '7pt', opacity: .6, marginTop: 'auto' }}>{SHORT_HOST}/{qr.slug}</div>
      </div>
    </div>
  );
}
