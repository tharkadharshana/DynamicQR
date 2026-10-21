import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useUI } from '../shared/UIContext';
import QRViewerModal, { getQRContent } from '../components/QRViewerModal';

/** Where a page code is edited: block pages in the Pages builder, older Kit pages in the Restaurant Kit. */
export const pageEditPath = (qr: any) => (qr.content_data?.blocks ? `/pages/${qr.slug}/edit` : `/kit?edit=${qr.id}`);

export default function Pages() {
  const navigate = useNavigate();
  const { showToast } = useUI();
  const [pages, setPages] = useState<any[] | null>(null);
  const [viewQR, setViewQR] = useState<any | null>(null);

  useEffect(() => {
    apiFetch('/api/qr').then(d => setPages((Array.isArray(d) ? d : []).filter(q => q.qr_type === 'page')))
      .catch(() => { setPages([]); showToast('error', 'Could not load your pages'); });
  }, []);

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active" style={{ maxWidth: '900px' }}>
        <div className="section-row">
          <span className="section-title">Your pages</span>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/pages/new')}>+ New page</button>
        </div>
        {pages === null ? <div className="card">Loading…</div> : pages.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
            No pages yet. A page is a mobile landing page behind one QR: links, products, contact details, offers and Wi-Fi.
            <div style={{ marginTop: '12px' }}><button className="btn btn-primary btn-sm" onClick={() => navigate('/pages/new')}>Pick a template →</button></div>
          </div>
        ) : (
          <div className="card qr-table-wrap">
            <table className="qr-table stack">
              <thead><tr><th>Title</th><th>Short link</th><th></th></tr></thead>
              <tbody>
                {pages.map(q => (
                  <tr key={q.slug}>
                    <td>{q.title || q.slug}{!q.content_data?.blocks && <span style={{ fontSize: '11px', color: 'var(--text3)' }}> · Restaurant Kit</span>}</td>
                    <td><a href={getQRContent(q)} target="_blank" rel="noreferrer">{getQRContent(q).replace(/^https?:\/\//, '')}</a></td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setViewQR(q)}>Show QR</button>
                        <Link className="btn btn-ghost btn-sm" to={`/analytics/${q.slug}`}>Analytics</Link>
                        <Link className="btn btn-ghost btn-sm" to={pageEditPath(q)}>Edit</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {viewQR && <QRViewerModal qr={viewQR} onClose={() => setViewQR(null)} />}
    </div>
  );
}
