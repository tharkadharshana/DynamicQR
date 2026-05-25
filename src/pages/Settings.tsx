import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { supabase, logout } from '../supabase';
import { apiFetch, formatNumber } from '../lib/api';
import { useUI } from '../shared/UIContext';

export default function Settings() {
  const navigate = useNavigate();
  const { planData } = useOutletContext<{ planData: any }>();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
  }, []);
  
  const [planTimeout, setPlanTimeout] = useState(false);
  useEffect(() => {
    if (!planData) {
      const t = setTimeout(() => setPlanTimeout(true), 4000);
      return () => clearTimeout(t);
    }
  }, [planData]);
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [country, setCountry] = useState('LK');
  const [timezone, setTimezone] = useState('Asia/Colombo');
  
  const [savingProfile, setSavingProfile] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
    if (displayName) {
      const parts = displayName.split(' ');
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
    }
    
    if (planData?.profile) {
      setCompany(planData.profile.company || '');
      setJobTitle(planData.profile.jobTitle || '');
      setCountry(planData.profile.country || 'LK');
      setTimezone(planData.profile.timezone || 'Asia/Colombo');
    }
  }, [user, planData]);

  const { showModal, showToast } = useUI();

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      if (user) {
        await supabase.auth.updateUser({
          data: { full_name: `${firstName} ${lastName}`.trim() }
        });

        await apiFetch('/api/user/profile', {
          method: 'PUT',
          body: JSON.stringify({ company, jobTitle, country, timezone })
        });
      }
      showToast('success', 'Profile updated');
    } catch (error) {
      console.error(error);
      showToast('error', 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const revokeAllSessions = () => {
    showModal({
      type: 'confirm',
      title: 'Revoke sessions',
      message: 'Revoke all other sessions? This will invalidate all active tokens and log you out for security.',
      confirmText: 'Revoke all',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await apiFetch('/api/user/revoke-sessions', { method: 'POST' });
          showToast('success', 'All sessions revoked. Please sign in again.');
          setTimeout(async () => {
            await logout();
            navigate('/login');
          }, 1500);
        } catch (err) {
          showToast('error', 'Failed to revoke sessions');
        }
      }
    });
  };

  const exportData = async () => {
    try {
      const data = await apiFetch('/api/user/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dynamicqr-export-${user?.id}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      showToast('success', 'Data exported as dynamicqr-export.json');
    } catch (err) {
      showToast('error', 'Failed to export data');
    }
  };

  const deactivateAll = () => {
    showModal({
      type: 'confirm',
      title: 'Deactivate all QRs',
      message: 'Deactivate all QR codes? Scans will return 410 until you reactivate them.',
      confirmText: 'Deactivate all',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await apiFetch('/api/user/deactivate-all', { method: 'PUT' });
          showToast('success', 'All QR codes deactivated');
        } catch (err) {
          showToast('error', 'Failed to deactivate QR codes');
        }
      }
    });
  };

  const deleteAccount = () => {
    showModal({
      type: 'prompt',
      title: 'Delete account',
      message: 'Type DELETE to confirm account deletion. This cannot be undone and will delete all your QR codes and analytics.',
      confirmText: 'Delete account',
      isDestructive: true,
      validationString: 'DELETE',
      onConfirm: async () => {
        try {
          await apiFetch('/api/user/account', { method: 'DELETE' });
          showToast('success', 'Account deleted. Redirecting...');
          setTimeout(async () => {
            await logout();
            navigate('/login');
          }, 2000);
        } catch (err) {
          showToast('error', 'Failed to delete account');
        }
      }
    });
  };


  if (!planData) {
    return (
      <div className="content" style={{ padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', height: '100%' }}>
        {planTimeout ? (
          <>
            <p style={{ color: 'var(--text3)' }}>Failed to load plan data.</p>
            <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>Reload</button>
          </>
        ) : (
          <p style={{ color: 'var(--text3)' }}>Loading...</p>
        )}
      </div>
    );
  }

  const currentPlan = planData.plan || 'free';
  const planLabel = currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1);
  const scanLimit = planData.limits.monthly_scans;
  const scanUsed = planData.monthly_scans_used || 0;
  const scanPct = Math.min(100, (scanUsed / scanLimit) * 100);
  const qrLimit = planData.limits.qr_codes; // -1 means unlimited
  const isUnlimitedQr = qrLimit === -1;
  const qrUsed = isUnlimitedQr ? planData.total_qrs : (qrLimit - planData.remaining_qr);
  const qrPct = isUnlimitedQr ? 0 : Math.min(100, (qrUsed / qrLimit) * 100);

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">
        <div className="profile-layout">
          {/* LEFT COLUMN */}
          <div>
            <div className="profile-card mb16">
              <div className="profile-av" id="profile-av-wrap" style={user?.user_metadata?.avatar_url ? { backgroundImage: `url(${user.user_metadata.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
                {!user?.user_metadata?.avatar_url && <span id="av-initials">{(firstName[0] || '') + (lastName[0] || '')}</span>}
                <div className="profile-av-overlay">📷</div>
              </div>
              <div className="profile-name" id="profile-display-name">{firstName} {lastName}</div>
              <div className="profile-email" id="profile-display-email">{user?.email}</div>
              <div className="profile-plan-chip">⭐ {planLabel} Plan · {planData.is_expired ? 'Expired' : 'Active'}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px', textAlign: 'center' }}>
                Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
              </div>
              <div className="profile-stats">
                <div className="p-stat"><div className="p-stat-val">{qrUsed}</div><div className="p-stat-key">QR Codes</div></div>
                <div className="p-stat"><div className="p-stat-val">{formatNumber(planData.total_scans || 0)}</div><div className="p-stat-key">Scans</div></div>
                <div className="p-stat"><div className="p-stat-val">{planData.days_active || '—'}</div><div className="p-stat-key">Days active</div></div>
                <div className="p-stat"><div className="p-stat-val">{planData.countries_count || '—'}</div><div className="p-stat-key">Countries</div></div>
              </div>
              <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: '12px' }}>Change photo</button>
                <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: '12px', color: 'var(--red)' }}>Remove</button>
              </div>
            </div>

            <div className="card mb16">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div className="card-title" style={{ marginBottom: 0 }}>Plan usage</div>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: '11px' }} onClick={() => navigate('/billing')}>Manage →</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}><span style={{ color: 'var(--text2)' }}>QR codes</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>{qrUsed} / {isUnlimitedQr ? '∞' : qrLimit}</span></div><div className="progress-bar"><div className="progress-fill" style={{ width: `${qrPct}%` }}></div></div></div>
                <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}><span style={{ color: 'var(--text2)' }}>Storage</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>0.4 MB</span></div><div className="progress-bar"><div className="progress-fill" style={{ width: '1%', background: 'var(--blue)' }}></div></div></div>
                <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}><span style={{ color: 'var(--text2)' }}>Analytics window</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>{planData.limits.analytics_days} days</span></div><div className="progress-bar"><div className="progress-fill" style={{ width: '100%', background: 'var(--green)' }}></div></div></div>
                <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}><span style={{ color: 'var(--text2)' }}>Scans this month</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>{formatNumber(scanUsed)} / {formatNumber(scanLimit)}</span></div><div className="progress-bar"><div className="progress-fill" style={{ width: `${scanPct}%`, background: scanPct > 90 ? 'var(--red)' : 'var(--coral)' }}></div></div></div>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Quick links</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div className="nav-item" style={{ borderRadius: '6px' }} onClick={() => navigate('/billing')}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="2" /><path d="M2 6h12" /><path d="M5 10h2" /></svg> Billing &amp; invoices</div>
                <div className="nav-item" style={{ borderRadius: '6px' }} onClick={() => navigate('/api-docs')}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 4l-3 4 3 4M11 4l3 4-3 4M9 3l-2 10" /></svg> API documentation</div>
                <div className="nav-item" style={{ borderRadius: '6px' }} onClick={() => showToast('success', 'Opening support page…')}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M8 5v3" /><circle cx="8" cy="12" r=".5" fill="currentColor" /></svg> Help &amp; support</div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div>
            <div className="settings-section mb16">
              <div className="settings-header">
                <span className="settings-title">Profile information</span>
                <button className="btn btn-ghost btn-sm" onClick={handleSaveProfile}>{savingProfile ? 'Saving...' : 'Save changes'}</button>
              </div>
              <div className="settings-body">
                <div className="grid-2 mb16">
                  <div><label className="form-label">First name</label><input type="text" className="form-input" value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
                  <div><label className="form-label">Last name</label><input type="text" className="form-input" value={lastName} onChange={e => setLastName(e.target.value)} /></div>
                </div>
                <div className="form-section mb16">
                  <label className="form-label">Email address</label>
                  <div style={{ position: 'relative' }}>
                    <input type="email" className="form-input" value={user?.email || ''} readOnly style={{ paddingRight: '90px' }} />
                    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', background: 'var(--green-l)', color: 'var(--green)', padding: '2px 7px', borderRadius: '4px', fontWeight: 600 }}>Verified</span>
                  </div>
                </div>
                <div className="grid-2 mb16">
                  <div><label className="form-label">Company / org</label><input type="text" className="form-input" placeholder="Your business name" value={company} onChange={e => setCompany(e.target.value)} /></div>
                  <div><label className="form-label">Job title</label><input type="text" className="form-input" placeholder="e.g. Marketing Manager" value={jobTitle} onChange={e => setJobTitle(e.target.value)} /></div>
                </div>
                <div className="grid-2">
                  <div>
                    <label className="form-label">Country</label>
                    <select className="form-input" value={country} onChange={e => setCountry(e.target.value)}>
                      <option value="LK">Sri Lanka</option>
                      <option value="US">United States</option>
                      <option value="GB">United Kingdom</option>
                      <option value="SG">Singapore</option>
                      <option value="IN">India</option>
                      <option value="AU">Australia</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Timezone</label>
                    <select className="form-input" value={timezone} onChange={e => setTimezone(e.target.value)}>
                      <option value="Asia/Colombo">Asia/Colombo (UTC+5:30)</option>
                      <option value="America/New_York">America/New_York (UTC-5)</option>
                      <option value="Europe/London">Europe/London (UTC+0)</option>
                      <option value="Asia/Singapore">Asia/Singapore (UTC+8)</option>
                      <option value="Australia/Sydney">Australia/Sydney (UTC+11)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-section mb16">
              <div className="settings-header"><span className="settings-title">Security</span></div>
              <div className="settings-body">
                <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                  <div className="setting-info">
                    <div className="setting-name">Login method</div>
                    <div className="setting-desc">Managed by Google Authentication</div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)', background: 'var(--surface2)', padding: '10px 14px', borderRadius: '8px', width: '100%', marginTop: '6px' }}>
                    Your account uses Google Sign-In. Password management, 2FA, and account recovery are handled securely by Google.
                  </div>
                </div>
                
                <div className="setting-row">
                  <div className="setting-info">
                    <div className="setting-name">Global Sign-out</div>
                    <div className="setting-desc">Revoke all active sessions and log out from all devices</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={revokeAllSessions}>Sign out everywhere</button>
                </div>
              </div>
            </div>

            {/* Notifications, Preferences, Connected Apps, Webhooks - Commented out for production readiness until implemented */}
            {/* 
            <div className="settings-section mb16">
              <div className="settings-header">
                <span className="settings-title">Notifications</span>
              </div>
              <div className="settings-body">
                <div className="setting-row"><div className="setting-info"><div className="setting-name">Weekly scan digest</div><div className="setting-desc">Summary email every Monday morning</div></div><button className="toggle on"></button></div>
              </div>
            </div>
            */}

            <div className="settings-section" style={{ borderColor: 'rgba(255,87,87,0.2)' }}>
              <div className="settings-header" style={{ borderColor: 'rgba(255,87,87,0.2)' }}><span className="settings-title" style={{ color: 'var(--red)' }}>Danger zone</span></div>
              <div className="settings-body">
                <div className="setting-row"><div className="setting-info"><div className="setting-name">Export all data</div><div className="setting-desc">QR codes, styles, and analytics as JSON</div></div><button className="btn btn-ghost btn-sm" onClick={exportData}>Export JSON</button></div>
                <div className="setting-row"><div className="setting-info"><div className="setting-name">Deactivate all QR codes</div><div className="setting-desc">All scans return 410 — useful before account transfer</div></div><button className="btn btn-ghost btn-sm" style={{ color: 'var(--amber)' }} onClick={deactivateAll}>Deactivate all</button></div>
                <div className="setting-row"><div className="setting-info"><div className="setting-name">Delete account</div><div className="setting-desc">Permanently deletes account, all QR codes, and all analytics</div></div><button className="btn btn-ghost btn-sm" style={{ borderColor: 'rgba(255,87,87,0.4)', color: 'var(--red)' }} onClick={deleteAccount}>Delete my account</button></div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
