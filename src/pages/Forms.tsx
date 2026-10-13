import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useUI } from '../shared/UIContext';
import QRViewerModal, { getQRContent } from '../components/QRViewerModal';
import { formFields } from '../lib/forms';
import { toCsv } from '../lib/csv';

const page = (children: React.ReactNode) => (
  <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
    <div className="page active" style={{ maxWidth: '1100px' }}>{children}</div>
  </div>
);

export default function Forms() {
  const navigate = useNavigate();
  const { showToast } = useUI();
  const [forms, setForms] = useState<any[] | null>(null);
  const [viewQR, setViewQR] = useState<any | null>(null);

  useEffect(() => {
    apiFetch('/api/qr').then(d => setForms((Array.isArray(d) ? d : []).filter(q => q.qr_type === 'form')))
      .catch(() => { setForms([]); showToast('error', 'Could not load your forms'); });
  }, []);

  return page(<>
    <div className="section-row">
      <span className="section-title">Your forms</span>
      <button className="btn btn-primary btn-sm" onClick={() => navigate('/forms/new')}>+ New form</button>
    </div>
    {forms === null ? <div className="card">Loading…</div> : forms.length === 0 ? (
      <div className="card" style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
        No forms yet. A form collects feedback, bookings or sign-ups from a QR scan, and you can download the answers as a CSV.
        <div style={{ marginTop: '12px' }}><button className="btn btn-primary btn-sm" onClick={() => navigate('/forms/new')}>Build a form →</button></div>
      </div>
    ) : (
      <div className="card qr-table-wrap">
        <table className="qr-table">
          <thead><tr><th>Title</th><th>Short link</th><th></th></tr></thead>
          <tbody>
            {forms.map(q => (
              <tr key={q.slug}>
                <td>{q.title || q.slug}</td>
                <td><a href={getQRContent(q)} target="_blank" rel="noreferrer">{getQRContent(q).replace(/^https?:\/\//, '')}</a></td>
                <td>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setViewQR(q)}>Show QR</button>
                    <Link className="btn btn-ghost btn-sm" to={`/forms/${q.slug}/responses`}>Responses</Link>
                    <Link className="btn btn-ghost btn-sm" to={`/forms/${q.slug}/edit`}>Edit</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    {viewQR && <QRViewerModal qr={viewQR} onClose={() => setViewQR(null)} />}
  </>);
}

const show = (v: unknown) => (v === true ? 'Yes' : v === undefined || v === null ? '' : String(v));

export function FormResponses() {
  const { slug } = useParams();
  const { showToast, showModal } = useUI();
  const [form, setForm] = useState<any>(null);
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    Promise.all([apiFetch(`/api/qr/${slug}`), apiFetch(`/api/forms/${slug}/submissions`)])
      .then(([qr, subs]) => { setForm(qr); setRows(Array.isArray(subs) ? subs : []); })
      .catch(() => { setRows([]); showToast('error', 'Could not load the responses'); });
  }, [slug]);

  const fields = formFields(form?.content_data);
  const ids = new Set(fields.map(f => f.id));
  // Answers to fields that were since removed from the form.
  const other = (r: any) => {
    const rest = Object.fromEntries(Object.entries(r.data || {}).filter(([k]) => !ids.has(k)));
    return Object.keys(rest).length ? JSON.stringify(rest) : '';
  };
  const hasOther = (rows || []).some(other);
  const date = (r: any) => new Date(r.created_at).toLocaleString();

  const download = () => {
    const csv = toCsv([
      ['Date', ...fields.map(f => f.label), ...(hasOther ? ['Other'] : [])],
      ...(rows || []).map(r => [date(r), ...fields.map(f => show(r.data?.[f.id])), ...(hasOther ? [other(r)] : [])]),
    ]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${slug}-responses.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const remove = (id: string) => showModal({
    type: 'confirm',
    title: 'Delete response',
    message: 'Delete this response? This cannot be undone.',
    confirmText: 'Delete',
    isDestructive: true,
    onConfirm: async () => {
      try {
        await apiFetch(`/api/forms/${slug}/submissions/${id}`, { method: 'DELETE' });
        setRows(rs => (rs || []).filter(r => r.id !== id));
        showToast('success', 'Response deleted');
      } catch {
        showToast('error', 'Could not delete the response');
      }
    },
  });

  return page(<>
    <div className="section-row">
      <span className="section-title">{form?.title || 'Responses'}{rows ? ` · ${rows.length} response${rows.length === 1 ? '' : 's'}` : ''}</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Link className="btn btn-ghost btn-sm" to="/forms">Back to forms</Link>
        <button className="btn btn-primary btn-sm" disabled={!rows?.length} onClick={download}>Download CSV</button>
      </div>
    </div>
    {rows === null ? <div className="card">Loading…</div> : rows.length === 0 ? (
      <div className="card" style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>No responses yet. Print the QR or share the short link to start collecting them.</div>
    ) : (
      <div className="card qr-table-wrap">
        <table className="qr-table">
          <thead><tr><th>Date</th>{fields.map(f => <th key={f.id}>{f.label}</th>)}{hasOther && <th>Other</th>}<th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{date(r)}</td>
                {fields.map(f => <td key={f.id} style={{ whiteSpace: 'pre-wrap' }}>{show(r.data?.[f.id])}</td>)}
                {hasOther && <td style={{ fontSize: '11px', color: 'var(--text3)' }}>{other(r)}</td>}
                <td><button className="btn btn-ghost btn-sm" style={{ color: 'var(--coral)' }} onClick={() => remove(r.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </>);
}
