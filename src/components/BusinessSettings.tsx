import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useUI } from '../shared/UIContext';

// Business-tier settings sections: workspaces, custom domains, webhooks. Each owns its list and refreshes after a change.
// The five event names mirror src/lib/webhooks.ts, which is Node-only and must not be imported in the browser.
const EVENTS = ['scan.created', 'form.submitted', 'qr.created', 'qr.updated', 'qr.deleted'];

function useList(url: string, enabled: boolean) {
  const { showToast } = useUI();
  const [rows, setRows] = useState<any[]>([]);
  const refresh = () => { if (enabled) apiFetch(url).then(r => setRows(Array.isArray(r) ? r : [])).catch(() => {}); };
  useEffect(refresh, [url, enabled]);
  const run = async (fn: () => Promise<any>, ok: string) => {
    try { const r = await fn(); showToast('success', ok); refresh(); return r; } catch (e: any) { showToast('error', e?.message || 'Something went wrong'); }
  };
  return { rows, run };
}

function Upgrade({ what }: { what: string }) {
  const navigate = useNavigate();
  return (
    <div className="settings-body" style={{ fontSize: '13px', color: 'var(--text3)', display: 'grid', gap: '10px' }}>
      <div>{what} is part of the Business plan.</div>
      <div><button className="btn btn-primary btn-sm" onClick={() => navigate('/billing')}>See plans</button></div>
    </div>
  );
}

export function WorkspacesSection({ planData }: { planData: any }) {
  const { showModal } = useUI();
  const max = planData?.limits?.workspaces ?? 1;
  const { rows, run } = useList('/api/workspaces', !planData?.is_member);
  const [name, setName] = useState('');
  const extra = rows.filter(w => w.id !== 'default');
  return (
    <div className="settings-section mb16">
      <div className="settings-header"><span className="settings-title">Workspaces</span><span style={{ fontSize: '12px', color: 'var(--text3)' }}>{extra.length} of {max}</span></div>
      {max <= 1 && extra.length === 0 ? <Upgrade what="Extra workspaces" /> : (
        <div className="settings-body" style={{ display: 'grid', gap: '10px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Workspaces keep codes for different brands or clients apart. Your existing codes live in the Default workspace.</div>
          {extra.map(w => (
            <div key={w.id} className="setting-row">
              <div className="setting-info"><div className="setting-name">{w.name}</div></div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => showModal({ type: 'prompt', title: 'Rename workspace', message: 'New name', confirmText: 'Rename',
                  onConfirm: v => v?.trim() && run(() => apiFetch(`/api/workspaces/${w.id}`, { method: 'PATCH', body: JSON.stringify({ name: v.trim() }) }), 'Renamed') })}>Rename</button>
                <button className="btn btn-ghost btn-sm" onClick={() => showModal({ type: 'confirm', title: 'Delete workspace', message: `Delete ${w.name}? Its codes move to the Default workspace.`, confirmText: 'Delete', isDestructive: true,
                  onConfirm: () => run(() => apiFetch(`/api/workspaces/${w.id}`, { method: 'DELETE' }), 'Workspace deleted') })}>Delete</button>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input className="form-input" aria-label="Workspace name" placeholder="Brand or client name" maxLength={60} value={name} onChange={e => setName(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={!name.trim()} onClick={async () => { await run(() => apiFetch('/api/workspaces', { method: 'POST', body: JSON.stringify({ name: name.trim() }) }), 'Workspace created'); setName(''); }}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DomainsSection({ planData }: { planData: any }) {
  const { showModal } = useUI();
  const max = planData?.limits?.custom_domains ?? 0;
  const { rows, run } = useList('/api/domains', max > 0 && !planData?.is_member);
  const [hostname, setHostname] = useState('');
  return (
    <div className="settings-section mb16">
      <div className="settings-header"><span className="settings-title">Custom domains</span>{max > 0 && <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{rows.length} of {max}</span>}</div>
      {max <= 0 ? <Upgrade what="Custom short domains" /> : (
        <div className="settings-body" style={{ display: 'grid', gap: '10px', fontSize: '13px' }}>
          {rows.map(d => (
            <div key={d.id} className="setting-row">
              <div className="setting-info">
                <div className="setting-name">{d.hostname} · {d.status === 'active' ? '✅ active' : d.status === 'failed' ? '❌ failed' : '⏳ waiting for DNS and certificate'}</div>
                {d.status !== 'active' && <div className="setting-desc">Add a CNAME record: <code>{d.hostname}</code> → <code>{d.cname_target || 'your Scnr fallback hostname'}</code>. It usually takes a few minutes.</div>}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => showModal({ type: 'confirm', title: 'Remove domain', message: `Codes printed with ${d.hostname} stop working. Remove it?`, confirmText: 'Remove', isDestructive: true,
                onConfirm: () => run(() => apiFetch(`/api/domains/${d.id}`, { method: 'DELETE' }), 'Domain removed') })}>Remove</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input className="form-input" aria-label="Custom hostname" placeholder="qr.yourbusiness.lk" value={hostname} onChange={e => setHostname(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={!hostname} onClick={async () => { await run(() => apiFetch('/api/domains', { method: 'POST', body: JSON.stringify({ hostname }) }), 'Domain added — now add the DNS record'); setHostname(''); }}>Add</button>
          </div>
          <div style={{ color: 'var(--text3)', fontSize: '12px' }}>Pick a domain per code when you create it. The first active domain is the default for new codes. Codes already printed keep their domain, which keeps working.</div>
        </div>
      )}
    </div>
  );
}

export function WebhooksSection({ planData }: { planData: any }) {
  const { showModal, showToast } = useUI();
  const max = planData?.limits?.webhooks ?? 0;
  const { rows, run } = useList('/api/webhooks', max > 0 && !planData?.is_member);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['scan.created']);
  const [secret, setSecret] = useState<string | null>(null);
  const toggle = (e: string) => setEvents(v => v.includes(e) ? v.filter(x => x !== e) : [...v, e]);
  return (
    <div className="settings-section mb16">
      <div className="settings-header"><span className="settings-title">Webhooks</span>{max > 0 && <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{rows.length} of {max}</span>}</div>
      {max <= 0 ? <Upgrade what="Webhooks" /> : (
        <div className="settings-body" style={{ display: 'grid', gap: '10px', fontSize: '13px' }}>
          {secret && (
            <div style={{ background: 'var(--green-l)', padding: '10px', borderRadius: '8px', fontSize: '12px' }}>
              Copy this signing secret now. It will not be shown again:<br />
              <code style={{ wordBreak: 'break-all' }}>{secret}</code>{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(secret).then(() => showToast('success', 'Copied'), () => {})}>Copy</button>
            </div>
          )}
          {rows.map(w => (
            <div key={w.id} className="setting-row">
              <div className="setting-info">
                <div className="setting-name" style={{ wordBreak: 'break-all' }}>{w.url}</div>
                <div className="setting-desc">{(w.events || []).join(', ')} · {w.last_status ? `last delivery ${w.last_status}${w.last_delivery_at ? ` on ${new Date(w.last_delivery_at).toLocaleString()}` : ''}` : 'no deliveries yet'}</div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-ghost btn-sm" onClick={async () => {
                  try { const r = await apiFetch(`/api/webhooks/${w.id}/test`, { method: 'POST' }); showToast(r.ok ? 'success' : 'error', `Test ping: HTTP ${r.status}`); } catch (e: any) { showToast('error', e?.message || 'Test failed'); }
                }}>Test</button>
                <button className="btn btn-ghost btn-sm" onClick={() => showModal({ type: 'confirm', title: 'Delete webhook', message: 'Stop sending events to this URL?', confirmText: 'Delete', isDestructive: true,
                  onConfirm: () => run(() => apiFetch(`/api/webhooks/${w.id}`, { method: 'DELETE' }), 'Webhook deleted') })}>Delete</button>
              </div>
            </div>
          ))}
          <input className="form-input" aria-label="Webhook URL" placeholder="https://example.com/hooks/scnr" value={url} onChange={e => setUrl(e.target.value)} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {EVENTS.map(e => <label key={e} style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: '12px' }}><input type="checkbox" checked={events.includes(e)} onChange={() => toggle(e)} />{e}</label>)}
          </div>
          <div><button className="btn btn-primary btn-sm" disabled={!url || !events.length} onClick={async () => {
            const r = await run(() => apiFetch('/api/webhooks', { method: 'POST', body: JSON.stringify({ url, events }) }), 'Webhook added');
            if (r?.secret) { setSecret(r.secret); setUrl(''); }
          }}>Add webhook</button></div>
          <div style={{ color: 'var(--text3)', fontSize: '12px' }}>Each request is signed with the secret so you can check it came from Scnr.</div>
        </div>
      )}
    </div>
  );
}
