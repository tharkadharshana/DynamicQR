import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { resizeLogo } from '../lib/qrContent';
import { useUI } from '../shared/UIContext';

// Team plan settings: API keys, members (seats from the plan), one custom short domain, white-label report branding.
export default function TeamSettings({ planData }: { planData: any }) {
  const { showToast, showModal } = useUI();
  const limits = planData?.limits || {};
  const owner = !planData?.is_member;
  const [keys, setKeys] = useState<any[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [domain, setDomain] = useState<any>(null);
  const [hostname, setHostname] = useState('');
  const [agencyName, setAgencyName] = useState(planData?.profile?.agencyName || '');
  const [agencyLogo, setAgencyLogo] = useState(planData?.profile?.agencyLogo || '');

  const refresh = () => {
    if (!owner) return;
    if (limits.api_access) apiFetch('/api/keys').then(setKeys).catch(() => {});
    if (limits.seats > 1) apiFetch('/api/team').then(setMembers).catch(() => {});
    if (limits.custom_domains > 0) apiFetch('/api/domains').then(setDomain).catch(() => {});
  };
  useEffect(refresh, [planData]);

  if (!limits.api_access && limits.seats <= 1 && !(limits.custom_domains > 0)) return null;
  if (!owner) {
    return <div className="settings-section mb16"><div className="settings-body" style={{ fontSize: '13px', color: 'var(--text3)' }}>You are a member of a Team workspace. The owner manages keys, members, domains and billing.</div></div>;
  }

  const run = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); showToast('success', ok); refresh(); } catch (e: any) { showToast('error', e?.message || 'Something went wrong'); }
  };

  return (
    <>
      {limits.api_access && (
        <div className="settings-section mb16">
          <div className="settings-header"><span className="settings-title">API keys</span></div>
          <div className="settings-body" style={{ display: 'grid', gap: '10px' }}>
            {newKey && (
              <div style={{ background: 'var(--green-l)', padding: '10px', borderRadius: '8px', fontSize: '12px' }}>
                Copy this key now — it will not be shown again:<br />
                <code style={{ wordBreak: 'break-all' }}>{newKey}</code>{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(newKey).then(() => showToast('success', 'Copied'), () => {})}>Copy</button>
              </div>
            )}
            {keys.map(k => (
              <div key={k.id} className="setting-row">
                <div className="setting-info"><div className="setting-name">{k.name} <code>{k.prefix}…</code></div>
                  <div className="setting-desc">{k.revoked_at ? 'Revoked' : k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}` : 'Never used'}</div></div>
                {!k.revoked_at && <button className="btn btn-ghost btn-sm" onClick={() => run(() => apiFetch(`/api/keys/${k.id}`, { method: 'DELETE' }), 'Key revoked')}>Revoke</button>}
              </div>
            ))}
            <div><button className="btn btn-primary btn-sm" onClick={() => run(async () => { const r = await apiFetch('/api/keys', { method: 'POST', body: JSON.stringify({ name: 'API key' }) }); setNewKey(r.key); }, 'Key created')}>Create API key</button>{' '}
              <a href="/api-docs" style={{ fontSize: '12px' }}>API docs →</a></div>
          </div>
        </div>
      )}

      {limits.seats > 1 && (
        <div className="settings-section mb16">
          <div className="settings-header"><span className="settings-title">Team members</span><span style={{ fontSize: '12px', color: 'var(--text3)' }}>{members.length + 1} of {limits.seats} users</span></div>
          <div className="settings-body" style={{ display: 'grid', gap: '10px' }}>
            {members.map(m => (
              <div key={m.id} className="setting-row">
                <div className="setting-info"><div className="setting-name">{m.member_email}</div><div className="setting-desc">{m.joined ? 'Joined' : 'Invited — they join by signing in with Google using this email'}</div></div>
                <button className="btn btn-ghost btn-sm" onClick={() => showModal({ type: 'confirm', title: 'Remove member', message: `Remove ${m.member_email}?`, confirmText: 'Remove', isDestructive: true,
                  onConfirm: () => run(() => apiFetch(`/api/team/${m.id}`, { method: 'DELETE' }), 'Member removed') })}>Remove</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input className="form-input" type="email" aria-label="Member email" placeholder="colleague@business.lk" value={email} onChange={e => setEmail(e.target.value)} />
              <button className="btn btn-primary btn-sm" disabled={!email} onClick={() => run(async () => { await apiFetch('/api/team', { method: 'POST', body: JSON.stringify({ email }) }); setEmail(''); }, 'Invite saved')}>Invite</button>
            </div>
          </div>
        </div>
      )}

      {limits.custom_domains > 0 && (
        <div className="settings-section mb16">
          <div className="settings-header"><span className="settings-title">Custom short domain</span></div>
          <div className="settings-body" style={{ display: 'grid', gap: '10px', fontSize: '13px' }}>
            {domain ? (
              <>
                <div><b>{domain.hostname}</b> · {domain.status === 'active' ? '✅ active — new codes use this domain' : domain.status === 'failed' ? '❌ failed' : '⏳ waiting for DNS and certificate'}</div>
                {domain.status !== 'active' && <div style={{ color: 'var(--text3)' }}>Add a CNAME record: <code>{domain.hostname}</code> → <code>{domain.cname_target || 'your Scnr fallback hostname'}</code>. It usually takes a few minutes.</div>}
                <div><button className="btn btn-ghost btn-sm" onClick={() => showModal({ type: 'confirm', title: 'Remove domain', message: 'Codes printed with this domain stop working. Remove it?', confirmText: 'Remove', isDestructive: true,
                  onConfirm: () => run(() => apiFetch('/api/domains', { method: 'DELETE' }), 'Domain removed') })}>Remove domain</button></div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input className="form-input" aria-label="Custom hostname" placeholder="qr.yourbusiness.lk" value={hostname} onChange={e => setHostname(e.target.value)} />
                <button className="btn btn-primary btn-sm" disabled={!hostname} onClick={() => run(() => apiFetch('/api/domains', { method: 'POST', body: JSON.stringify({ hostname }) }), 'Domain added — now add the DNS record')}>Add</button>
              </div>
            )}
            <div style={{ color: 'var(--text3)', fontSize: '12px' }}>Only change this before printing. Codes already printed keep their old domain, which keeps working.</div>
          </div>
        </div>
      )}

      {limits.api_access && (
        <div className="settings-section mb16">
          <div className="settings-header"><span className="settings-title">Report branding (white-label)</span></div>
          <div className="settings-body" style={{ display: 'grid', gap: '10px' }}>
            <input className="form-input" aria-label="Agency name" placeholder="Your agency name on printed reports" value={agencyName} onChange={e => setAgencyName(e.target.value)} />
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {agencyLogo && <img src={agencyLogo} alt="Agency logo" style={{ height: '36px' }} />}
              <label className="btn btn-ghost btn-sm" htmlFor="agency-logo">Upload logo</label>
              <input id="agency-logo" type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => { const f = e.target.files?.[0]; if (f) setAgencyLogo(await resizeLogo(f, 200)); }} />
              <button className="btn btn-primary btn-sm" onClick={() => run(() => apiFetch('/api/user/profile', { method: 'PUT', body: JSON.stringify({ ...planData.profile, agencyName, agencyLogo }) }), 'Branding saved')}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
