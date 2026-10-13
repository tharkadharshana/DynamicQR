import React, { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { csvToObjects } from '../lib/csv';
import { useUI } from '../shared/UIContext';
import { StyledQR } from './KitPrint';

// Team: create many dynamic URL codes from a CSV (title, destination_url, client), then print them as a sheet.
type Row = { title: string; destination_url: string; client?: string; slug?: string; error?: string };

const SAMPLE = 'title,destination_url,client\nTable 1 menu,https://cafelagoon.lk/menu,Café Lagoon\nWindow poster,https://cafelagoon.lk/offers,Café Lagoon\n';

export default function Bulk() {
  const { planData } = useOutletContext<{ planData: any }>();
  const navigate = useNavigate();
  const { showToast } = useUI();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const allowed = !!planData?.limits?.bulk_create;

  const load = (csv: string) => {
    setText(csv);
    setRows(csvToObjects(csv)
      .map(o => ({ title: o.title || o.name || '', destination_url: o.destination_url || o.url || '', client: o.client || undefined }))
      .filter(r => r.title || r.destination_url));
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) load(await f.text());
  };

  const create = async () => {
    setBusy(true);
    const out: Row[] = [];
    for (const r of rows) {
      try {
        const qr = await apiFetch('/api/qr', { method: 'POST', body: JSON.stringify({ title: r.title.slice(0, 120), destination_url: r.destination_url, client: r.client, qr_type: 'url', is_dynamic: true }) });
        out.push({ ...r, slug: qr.slug });
      } catch (err: any) {
        out.push({ ...r, error: err?.message || 'Failed' });
        if (err?.status === 403) { showToast('error', err.message); break; } // plan cap reached — stop
      }
      setRows([...out, ...rows.slice(out.length)]);
    }
    setBusy(false);
    const ok = out.filter(r => r.slug).length;
    showToast(ok === rows.length ? 'success' : 'warning', `${ok} of ${rows.length} codes created`);
  };

  if (!allowed) {
    return (
      <div className="content" style={{ padding: '28px' }}>
        <div className="card" style={{ maxWidth: '560px' }}>
          <div className="card-title">Bulk create</div>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Create many codes from a CSV file and print them as one sheet. Available on the Team and Business plans.</p>
          <button className="btn btn-primary btn-sm" style={{ marginTop: '12px' }} onClick={() => navigate('/billing')}>See plans →</button>
        </div>
      </div>
    );
  }

  const created = rows.filter(r => r.slug);
  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">
        <div className="card mb16 no-print">
          <div className="card-title">Bulk create from CSV</div>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '12px' }}>Columns: <code>title</code>, <code>destination_url</code>, optional <code>client</code> (a folder name). Each row becomes a dynamic code; plan limits apply.</p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <label className="btn btn-ghost btn-sm" htmlFor="bulk-file">Choose CSV file</label>
            <input id="bulk-file" type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onFile} />
            <button className="btn btn-ghost btn-sm" onClick={() => load(SAMPLE)}>Use sample</button>
          </div>
          <label className="form-label" htmlFor="bulk-text">Or paste CSV</label>
          <textarea id="bulk-text" className="form-input" rows={6} value={text} onChange={e => load(e.target.value)} placeholder={SAMPLE} />
          <div style={{ display: 'flex', gap: '10px', marginTop: '12px', alignItems: 'center' }}>
            <button className="btn btn-primary" disabled={!rows.length || busy} onClick={create}>{busy ? 'Creating…' : `Create ${rows.length} code${rows.length === 1 ? '' : 's'}`}</button>
            {created.length > 0 && <button className="btn btn-ghost" onClick={() => { setPrinting(true); setTimeout(() => window.print(), 300); }}>Print sheet ({created.length})</button>}
          </div>
        </div>

        {rows.length > 0 && !printing && (
          <div className="card no-print">
            <table className="plan-compare" style={{ width: '100%' }}>
              <thead><tr><th style={{ textAlign: 'left' }}>Title</th><th style={{ textAlign: 'left' }}>Destination</th><th>Client</th><th>Result</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: 'left' }}>{r.title}</td>
                    <td style={{ textAlign: 'left', wordBreak: 'break-all' }}>{r.destination_url}</td>
                    <td>{r.client || '—'}</td>
                    <td style={{ color: r.error ? 'var(--red)' : r.slug ? 'var(--green)' : 'var(--text3)' }}>{r.error || (r.slug ? `✓ ${r.slug}` : 'waiting')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {printing && (
          <div>
            <button className="btn btn-ghost btn-sm no-print" style={{ marginBottom: '12px' }} onClick={() => setPrinting(false)}>← Back</button>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60mm, 1fr))', gap: '6mm', background: '#fff', padding: '6mm' }}>
              {created.map(r => (
                <div key={r.slug} style={{ display: 'grid', justifyItems: 'center', gap: '2mm', breakInside: 'avoid', color: '#16171b', fontSize: '10pt' }}>
                  <StyledQR qr={{ slug: r.slug, is_dynamic: true, qr_type: 'url', style: { dot_color: '#000000', bg_color: '#FFFFFF', error_correction: 'M' } }} size={180} />
                  <b>{r.title}</b>
                  {r.client && <span style={{ fontSize: '8pt', opacity: .7 }}>{r.client}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
