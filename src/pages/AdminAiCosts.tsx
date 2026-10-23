import React, { useEffect, useState } from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { supabase } from '../supabase';
import { useUI } from '../shared/UIContext';

// Admin: what AI costs us, per user, per kind and per image, against what each plan brings in.
// The numbers come from the ai_usage ledger (one row per provider call); see server/index.ts and src/lib/aiPricing.ts.
const usd = (n: number, d = 2) => `${(n || 0) < 0 ? "-" : ""}$${Math.abs(n || 0).toFixed(d)}`;
const KINDS: Record<string, string> = { menu_generate: 'Menu from a prompt', menu_import: 'Menu from a file', image: 'Image', template_generate: 'Template' };

export default function AdminAiCosts() {
  const { planData } = useOutletContext<{ planData?: any }>();
  const { showToast } = useUI();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [d, setD] = useState<any | null>(null);
  const [open, setOpen] = useState('');
  const [calls, setCalls] = useState<any[] | null>(null);
  const [grant, setGrant] = useState('');
  const [item, setItem] = useState({ label: '', amount: '' });

  const load = () => apiFetch(`/api/admin/ai-usage?month=${month}`).then(setD).catch(() => { setD(null); showToast('error', 'Could not load AI usage'); });
  useEffect(() => { if (planData?.is_admin) load(); }, [planData?.is_admin, month]);
  if (planData && !planData.is_admin) return <Navigate to="/" replace />;

  const toggle = async (uid: string) => {
    if (open === uid) return setOpen('');
    setOpen(uid); setCalls(null); setGrant('');
    apiFetch(`/api/admin/ai-usage/user/${uid}?month=${month}`).then(r => setCalls(r.calls)).catch(() => setCalls([]));
  };
  const saveGrant = async (uid: string) => {
    try { await apiFetch(`/api/admin/users/${uid}/ai-grant`, { method: 'PUT', body: JSON.stringify({ usd: Number(grant) }) }); showToast('success', 'Grant saved'); }
    catch (e: any) { showToast('error', e?.message || 'Could not save'); }
  };
  const addItem = async () => {
    try {
      await apiFetch('/api/admin/cost-items', { method: 'POST', body: JSON.stringify({ month, label: item.label, amount_usd: Number(item.amount) }) });
      setItem({ label: '', amount: '' }); load();
    } catch (e: any) { showToast('error', e?.message || 'Could not save'); }
  };
  const delItem = (id: string) => apiFetch(`/api/admin/cost-items/${id}`, { method: 'DELETE' }).then(load).catch(() => showToast('error', 'Could not delete'));
  // The CSV needs the sign-in header, so it is fetched and saved as a file instead of being a plain link.
  const csv = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/ai-usage.csv?month=${month}`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
    if (!res.ok) return showToast('error', 'Could not export');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob()); a.download = `ai-usage-${month}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const t = d?.totals;
  const kpi = (label: string, value: string, sub = '') => <div className="stat-card"><div className="stat-label">{label}</div><div className="stat-value" style={{ fontSize: '24px' }}>{value}</div>{sub && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{sub}</div>}</div>;
  const maxDay = Math.max(0.000001, ...(d?.by_day || []).map((x: any) => x.cost_usd));
  const fixed = d?.cost_items_usd || 0;

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active" style={{ maxWidth: '1200px' }}>
        <div className="section-row">
          <span className="section-title">AI costs</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="month" className="form-input" style={{ width: '160px' }} value={month} onChange={e => e.target.value && setMonth(e.target.value)} aria-label="Month" />
            <button className="btn btn-ghost btn-sm" onClick={csv}>Download CSV</button>
          </div>
        </div>
        {!d ? <div className="card">Loading…</div> : (<>
          <div className="stats-row" style={{ marginBottom: '16px' }}>
            {kpi('AI cost', usd(t.cost_usd), `${t.calls} calls, ${t.errors} failed`)}
            {kpi('Images', String(t.images), t.images ? `${usd(t.avg_image_cost_usd, 4)} each on average` : 'none yet')}
            {kpi('Active users', String(t.active_users), t.active_users ? `${usd(t.cost_usd / t.active_users)} each` : '')}
            {kpi('Projected month', usd(t.projected_month_usd), `prices as of ${d.prices_as_of}`)}
          </div>

          <div className="card mb16">
            <div className="card-title">Revenue against cost ({month})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '12px', fontSize: '13px' }}>
              <div>Plan revenue (users with AI use)<b style={{ display: 'block', fontSize: '20px' }}>{usd(d.revenue_usd)}</b></div>
              <div>AI cost<b style={{ display: 'block', fontSize: '20px' }}>{usd(t.cost_usd)}</b></div>
              <div>Fixed costs entered below<b style={{ display: 'block', fontSize: '20px' }}>{usd(fixed)}</b></div>
              <div>Left over<b style={{ display: 'block', fontSize: '20px', color: d.revenue_usd - t.cost_usd - fixed >= 0 ? 'var(--green)' : 'var(--red)' }}>{usd(d.revenue_usd - t.cost_usd - fixed)}</b></div>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '10px' }}>Revenue counts each paid plan at its monthly USD list price, for users who used AI this month. It is a guide, not an invoice.</p>
          </div>

          <div className="card mb16 qr-table-wrap">
            <div className="card-title">By user (click a row for the calls and to give more credits)</div>
            <table className="qr-table stack">
              <thead><tr><th>User</th><th>Plan</th><th>Calls</th><th>Images</th><th>Tokens in / out</th><th>Cost</th><th>Plan price</th><th>Margin</th></tr></thead>
              <tbody>
                {d.by_user.map((u: any) => (<React.Fragment key={u.uid}>
                  <tr onClick={() => toggle(u.uid)} style={{ cursor: 'pointer' }}>
                    <td>{u.email || u.uid.slice(0, 8)}</td><td>{u.plan}</td><td>{u.calls}{u.errors ? ` (${u.errors} failed)` : ''}</td><td>{u.images}</td>
                    <td>{u.input_tokens.toLocaleString()} / {u.output_tokens.toLocaleString()}</td><td><b>{usd(u.cost_usd, 4)}</b></td><td>{usd(u.revenue_usd)}</td>
                    <td style={{ color: u.margin_usd >= 0 ? 'var(--green)' : 'var(--red)' }}>{usd(u.margin_usd)}</td>
                  </tr>
                  {open === u.uid && (
                    <tr><td colSpan={8}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px' }}>Extra monthly AI allowance (USD of cost):</span>
                        <input className="form-input" style={{ width: '110px' }} type="number" min="0" step="0.5" value={grant} onChange={e => setGrant(e.target.value)} placeholder="e.g. 5" />
                        <button className="btn btn-ghost btn-sm" disabled={grant === ''} onClick={() => saveGrant(u.uid)}>Save grant</button>
                      </div>
                      {calls === null ? 'Loading…' : (
                        <table className="qr-table stack"><thead><tr><th>Time</th><th>What</th><th>Model</th><th>Quality / size</th><th>Tokens in / out</th><th>Cost</th><th>Status</th></tr></thead>
                          <tbody>{calls.slice(0, 100).map(c => (
                            <tr key={c.id}><td>{new Date(c.created_at).toLocaleString()}</td><td>{KINDS[c.kind] || c.kind}{c.ref ? ` (${c.ref})` : ''}</td><td>{c.model}</td><td>{c.quality ? `${c.quality} ${c.size || ''}` : ''}</td>
                              <td>{c.input_tokens} / {c.output_tokens}</td><td>{usd(Number(c.cost_usd), 4)}</td><td>{c.status}</td></tr>
                          ))}</tbody></table>
                      )}
                    </td></tr>
                  )}
                </React.Fragment>))}
                {!d.by_user.length && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text3)' }}>No AI use this month.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="grid-2 mb16" style={{ alignItems: 'start' }}>
            <div className="card qr-table-wrap">
              <div className="card-title">Images: cost of each kind</div>
              <table className="qr-table stack"><thead><tr><th>Model</th><th>Quality</th><th>Size</th><th>Count</th><th>Total</th><th>Each</th></tr></thead>
                <tbody>{d.images.map((i: any) => <tr key={`${i.model}${i.quality}${i.size}`}><td>{i.model}</td><td>{i.quality}</td><td>{i.size}</td><td>{i.calls}</td><td>{usd(i.cost_usd, 4)}</td><td>{usd(i.avg_cost_usd, 4)}</td></tr>)}
                  {!d.images.length && <tr><td colSpan={6} style={{ color: 'var(--text3)' }}>No images yet.</td></tr>}</tbody></table>
            </div>
            <div className="card qr-table-wrap">
              <div className="card-title">By kind and model</div>
              <table className="qr-table stack"><thead><tr><th>What</th><th>Calls</th><th>Cost</th></tr></thead>
                <tbody>{d.by_kind.map((k: any) => <tr key={k.kind}><td>{KINDS[k.kind] || k.kind}</td><td>{k.calls}</td><td>{usd(k.cost_usd, 4)}</td></tr>)}
                  {d.by_model.map((m: any) => <tr key={m.model}><td style={{ color: 'var(--text3)' }}>{m.model}</td><td>{m.calls}</td><td>{usd(m.cost_usd, 4)}</td></tr>)}</tbody></table>
            </div>
          </div>

          <div className="card mb16">
            <div className="card-title">Cost per day</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '110px' }}>
              {d.by_day.map((x: any) => <div key={x.day} title={`${x.day}: ${usd(x.cost_usd, 4)}`} style={{ flex: 1, minWidth: '3px', height: `${Math.max(3, (x.cost_usd / maxDay) * 100)}%`, background: 'var(--coral)', borderRadius: '3px 3px 0 0' }} />)}
              {!d.by_day.length && <span style={{ color: 'var(--text3)', fontSize: '13px' }}>No data.</span>}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Other monthly costs ({month})</div>
            <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>Hosting, database, email, domain, payment fees: costs that are not counted per call. Enter them by hand so the totals above show what is left.</p>
            {d.cost_items.map((c: any) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                <span>{c.label}</span><span>{usd(Number(c.amount_usd))} <button className="btn btn-ghost btn-sm" onClick={() => delItem(c.id)}>Remove</button></span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
              <input className="form-input" style={{ flex: 1, minWidth: '180px' }} placeholder="e.g. Vercel Pro" value={item.label} onChange={e => setItem({ ...item, label: e.target.value })} aria-label="Cost label" />
              <input className="form-input" style={{ width: '120px' }} type="number" min="0" step="0.01" placeholder="USD" value={item.amount} onChange={e => setItem({ ...item, amount: e.target.value })} aria-label="Amount in USD" />
              <button className="btn btn-primary btn-sm" disabled={!item.label.trim() || item.amount === ''} onClick={addItem}>Add</button>
            </div>
          </div>
        </>)}
      </div>
    </div>
  );
}
