import React, { useEffect, useState } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useUI } from '../shared/UIContext';

// Admin: manage the page templates shown in the gallery (rows of `page_templates`). Admins are the emails in ADMIN_EMAILS.
export default function AdminTemplates() {
  const { planData } = useOutletContext<{ planData?: any }>();
  const { showToast, showModal } = useUI();
  const [rows, setRows] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'draft' | 'published' | 'ai'>('all');
  const [busy, setBusy] = useState(false);

  const load = () => apiFetch('/api/admin/page-templates').then(setRows).catch(() => { setRows([]); showToast('error', 'Could not load templates'); });
  useEffect(() => { if (planData?.is_admin) load(); }, [planData?.is_admin]);
  if (planData && !planData.is_admin) return <Navigate to="/" replace />;

  const act = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try { await fn(); showToast('success', ok); await load(); } catch (e: any) { showToast('error', e?.message || 'That did not work'); } finally { setBusy(false); }
  };
  const toggle = (t: any) => act(() => apiFetch(`/api/admin/page-templates/${t.id}`, { method: 'PUT', body: JSON.stringify({ status: t.status === 'published' ? 'draft' : 'published' }) }), t.status === 'published' ? 'Unpublished' : 'Published');
  const dup = (t: any) => act(() => apiFetch(`/api/admin/page-templates/${t.id}/duplicate`, { method: 'POST' }), 'Duplicated as a draft');
  const del = (t: any) => showModal({
    type: 'confirm', title: 'Delete template', message: `Delete "${t.name}"? Pages already made from it are not affected.`, confirmText: 'Delete', isDestructive: true,
    onConfirm: () => { act(() => apiFetch(`/api/admin/page-templates/${t.id}`, { method: 'DELETE' }), 'Deleted'); },
  });
  const shown = (rows || []).filter(t => filter === 'all' || (filter === 'ai' ? t.source === 'ai' : t.status === filter));
  const pill = (txt: string, color: string) => <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', background: `${color}22`, color }}>{txt}</span>;

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active" style={{ maxWidth: '1100px' }}>
        <div className="section-row">
          <span className="section-title">Page templates</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link className="btn btn-primary btn-sm" to="/admin/templates/new">+ New template</Link>
          </div>
        </div>
        <div className="dash-tabs" role="tablist" style={{ marginBottom: '14px' }}>
          {(['all', 'published', 'draft', 'ai'] as const).map(f => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{f === 'ai' ? 'AI made' : f.charAt(0).toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
        {rows === null ? <div className="card">Loading…</div> : (
          <div className="card qr-table-wrap">
            <table className="qr-table stack">
              <thead><tr><th>Name</th><th>Category</th><th>Status</th><th>Source</th><th>Sort</th><th>Updated</th><th></th></tr></thead>
              <tbody>
                {shown.map(t => (
                  <tr key={t.id}>
                    <td><b>{t.name}</b><div style={{ fontSize: '11px', color: 'var(--text3)' }}>{t.id}</div></td>
                    <td>{t.category}</td>
                    <td>{pill(t.status, t.status === 'published' ? '#1F9D55' : '#C47F10')}</td>
                    <td>{pill(t.source === 'ai' ? 'AI' : 'Manual', t.source === 'ai' ? '#6A52D4' : '#6B7688')}</td>
                    <td>{t.sort}</td>
                    <td>{new Date(t.updated_at).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <Link className="btn btn-ghost btn-sm" to={`/admin/templates/${t.id}/edit`}>Edit</Link>
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => toggle(t)}>{t.status === 'published' ? 'Unpublish' : 'Publish'}</button>
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => dup(t)}>Duplicate</button>
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => del(t)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text3)' }}>No templates here.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
