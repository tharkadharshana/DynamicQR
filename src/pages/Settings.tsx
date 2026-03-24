import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { updateProfile } from 'firebase/auth';
import { formatLimit, formatBytes, isUnlimited } from '../shared/plans';

const apiFetch = async (url: string, opts?: any) => {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(url, { ...opts, headers: { ...opts?.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
};
const formatNumber = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

export default function Settings() {
  const navigate = useNavigate();
  const user = auth.currentUser;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [country, setCountry] = useState('LK');
  const [timezone, setTimezone] = useState('Asia/Colombo');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [showPwForm, setShowPwForm] = useState(false);
  const [tfaEnabled, setTfaEnabled] = useState(false);
  const [showTfaSetup, setShowTfaSetup] = useState(false);
  const [planData, setPlanData] = useState<any>(null);

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const data = await apiFetch('/api/user/plan');
        setPlanData(data);
      } catch (e) { console.error('Plan fetch error', e); }
    };
    fetchPlan();
  }, []);

  useEffect(() => {
    if (user?.displayName) {
      const parts = user.displayName.split(' ');
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
    }
  }, [user]);

  const showToast = (type: string, message: string) => {
    alert(`${type.toUpperCase()}: ${message}`);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      if (user) {
        await updateProfile(user, {
          displayName: `${firstName} ${lastName}`.trim()
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

  const handleSavePassword = () => {
    if (!pwCurrent || !pwNew) { showToast('error', 'Please fill all password fields'); return; }
    if (pwNew !== pwConfirm) { showToast('error', 'New passwords do not match'); return; }
    if (pwNew.length < 8) { showToast('error', 'Password must be at least 8 characters'); return; }
    showToast('success', 'Password updated successfully');
    setShowPwForm(false);
    setPwCurrent(''); setPwNew(''); setPwConfirm('');
  };

  const toggle2FA = () => {
    if (tfaEnabled) {
      setTfaEnabled(false);
      setShowTfaSetup(false);
      showToast('success', '2FA disabled');
    } else {
      setShowTfaSetup(true);
    }
  };

  const confirm2FA = () => {
    setTfaEnabled(true);
    setShowTfaSetup(false);
    showToast('success', 'Two-factor authentication enabled');
  };

  const revokeAllSessions = () => {
    if (window.confirm('Revoke all other sessions? You will stay signed in on this device only.')) {
      showToast('success', 'All other sessions revoked');
    }
  };

  const revokeSession = () => {
    if (window.confirm('Revoke this session?')) {
      showToast('success', 'Session revoked');
    }
  };

  const handleSaveSettings = (type: 'notifications' | 'preferences') => {
    if (type === 'notifications') {
      setSavingSettings(true);
      setTimeout(() => { setSavingSettings(false); showToast('success', 'Preferences saved'); }, 800);
    } else {
      setSavingPrefs(true);
      setTimeout(() => { setSavingPrefs(false); showToast('success', 'Preferences saved'); }, 800);
    }
  };

  const handleSaveWebhook = () => {
    if (!webhookUrl) { showToast('error', 'Enter a webhook URL first'); return; }
    setSavingWebhook(true);
    setTimeout(() => { setSavingWebhook(false); showToast('success', 'Webhook endpoint saved'); }, 600);
  };

  const testWebhook = () => {
    if (!webhookUrl) { showToast('error', 'Save a webhook URL first'); return; }
    showToast('success', 'Test event sent to ' + webhookUrl.slice(0, 40));
  };

  const exportData = () => {
    showToast('success', 'Data exported as scnr-export.json');
  };

  const deactivateAll = () => {
    if (window.confirm('Deactivate all QR codes? Scans will return 410 until you reactivate them.')) {
      showToast('success', 'All QR codes deactivated');
    }
  };

  const deleteAccount = () => {
    const confirm1 = window.prompt('Type DELETE to confirm account deletion. This cannot be undone.');
    if (confirm1 === 'DELETE') {
      showToast('error', 'Account deletion scheduled. You will receive a confirmation email.');
    } else if (confirm1 !== null) {
      showToast('error', 'Confirmation text did not match — type DELETE exactly');
    }
  };

  const checkPasswordStrength = (pw: string) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };

  const pwScore = checkPasswordStrength(pwNew);
  const pwColors = ['var(--red)', 'var(--red)', 'var(--amber)', 'var(--amber)', 'var(--green)'];
  const pwLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">
        <div className="profile-layout">
          {/* LEFT COLUMN */}
          <div>
            <div className="profile-card mb16">
              <div className="profile-av" id="profile-av-wrap" style={user?.photoURL ? { backgroundImage: `url(${user.photoURL})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
                {!user?.photoURL && <span id="av-initials">{(firstName[0] || '') + (lastName[0] || '')}</span>}
                <div className="profile-av-overlay">📷</div>
              </div>
              <div className="profile-name" id="profile-display-name">{firstName} {lastName}</div>
              <div className="profile-email" id="profile-display-email">{user?.email}</div>
              <div className="profile-plan-chip">⭐ {planData ? `${planData.plan_name} Plan` : 'Loading…'} · Active</div>
              <div className="profile-stats">
                <div className="p-stat"><div className="p-stat-val">{planData?.usage?.active_qr_codes ?? '—'}</div><div className="p-stat-key">QR Codes</div></div>
                <div className="p-stat"><div className="p-stat-val">{planData ? formatNumber(planData.usage?.scans_this_month || 0) : '—'}</div><div className="p-stat-key">Scans</div></div>
                <div className="p-stat"><div className="p-stat-val">{planData?.limits?.analytics_days || '—'}</div><div className="p-stat-key">Analytics days</div></div>
                <div className="p-stat"><div className="p-stat-val">{planData ? formatBytes(planData.usage?.storage_bytes || 0) : '—'}</div><div className="p-stat-key">Storage</div></div>
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
                <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}><span style={{ color: 'var(--text2)' }}>QR codes</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>{planData ? `${planData.usage.active_qr_codes} / ${formatLimit(planData.limits.max_qr_codes)}` : '—'}</span></div><div className="progress-bar"><div className="progress-fill" style={{ width: planData && !isUnlimited(planData.limits.max_qr_codes) ? `${Math.min(100, Math.round((planData.usage.active_qr_codes / planData.limits.max_qr_codes) * 100))}%` : '10%' }}></div></div></div>
                <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}><span style={{ color: 'var(--text2)' }}>Storage</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>{planData ? formatBytes(planData.usage.storage_bytes) : '—'}</span></div><div className="progress-bar"><div className="progress-fill" style={{ width: planData ? `${Math.min(100, Math.round((planData.usage.storage_bytes / planData.limits.max_storage_bytes) * 100))}%` : '3%', background: 'var(--blue)' }}></div></div></div>
                <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}><span style={{ color: 'var(--text2)' }}>Analytics window</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>{planData ? `${planData.limits.analytics_days} days` : '—'}</span></div><div className="progress-bar"><div className="progress-fill" style={{ width: '100%', background: 'var(--green)' }}></div></div></div>
                <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}><span style={{ color: 'var(--text2)' }}>Scans this month</span><span style={{ color: 'var(--text)', fontWeight: 600 }}>{planData ? `${formatNumber(planData.usage.scans_this_month)} / ${formatLimit(planData.limits.max_scans_per_month)}` : '—'}</span></div><div className="progress-bar"><div className="progress-fill" style={{ width: planData && !isUnlimited(planData.limits.max_scans_per_month) ? `${Math.min(100, Math.round((planData.usage.scans_this_month / planData.limits.max_scans_per_month) * 100))}%` : '100%', background: 'var(--coral)' }}></div></div></div>
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
                <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div className="setting-info"><div className="setting-name">Password</div><div className="setting-desc">Last changed 30 days ago</div></div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowPwForm(!showPwForm)}>Change password</button>
                  </div>
                  {showPwForm && (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div className="grid-2">
                        <div><label className="form-label">Current password</label><input type="password" className="form-input" placeholder="••••••••" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} /></div>
                        <div></div>
                      </div>
                      <div className="grid-2">
                        <div><label className="form-label">New password</label><input type="password" className="form-input" placeholder="Min 8 characters" value={pwNew} onChange={e => setPwNew(e.target.value)} /></div>
                        <div><label className="form-label">Confirm new password</label><input type="password" className="form-input" placeholder="Repeat new password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} /></div>
                      </div>
                      {pwNew && (
                        <div>
                          <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                            {[1, 2, 3, 4].map(i => (
                              <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i <= pwScore ? pwColors[pwScore] : 'var(--surface3)' }}></div>
                            ))}
                          </div>
                          <div style={{ fontSize: '11px', color: pwColors[pwScore] }}>Strength: {pwLabels[pwScore] || 'Weak'}</div>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-primary btn-sm" onClick={handleSavePassword}>Update password</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowPwForm(false)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div className="setting-info"><div className="setting-name">Two-factor authentication</div><div className="setting-desc">{tfaEnabled ? 'Enabled · Authenticator app active' : showTfaSetup ? 'Setting up… scan QR or enter code below' : 'Not enabled · Adds a second layer of security'}</div></div>
                    <button className={`toggle ${tfaEnabled || showTfaSetup ? 'on' : ''}`} onClick={toggle2FA}></button>
                  </div>
                  {showTfaSetup && (
                    <div style={{ width: '100%', background: 'var(--surface2)', borderRadius: '10px', padding: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '10px' }}>Scan with Google Authenticator or Authy</div>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                        <div style={{ width: '80px', height: '80px', background: '#fff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '10px', color: '#aaa', textAlign: 'center', padding: '4px' }}>QR Code here</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Manual code:</div>
                          <code style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--amber)', background: 'var(--surface3)', padding: '4px 8px', borderRadius: '4px', letterSpacing: '2px' }}>JBSW Y3DP EHPK 3PXP</code>
                          <div style={{ marginTop: '10px' }}>
                            <label className="form-label">Enter 6-digit code to activate</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input type="text" className="form-input" placeholder="000 000" maxLength={7} style={{ flex: 1, letterSpacing: '4px', textAlign: 'center', fontFamily: 'monospace' }} />
                              <button className="btn btn-primary btn-sm" onClick={confirm2FA}>Confirm</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div className="setting-info"><div className="setting-name">Active sessions</div><div className="setting-desc">2 devices signed in</div></div>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={revokeAllSessions}>Revoke all others</button>
                  </div>
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface2)', borderRadius: '8px', padding: '10px 12px' }}>
                      <span style={{ fontSize: '18px' }}>💻</span>
                      <div style={{ flex: 1 }}><div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>Chrome · macOS · Colombo, LK</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>Current session · Active now</div></div>
                      <span style={{ fontSize: '11px', background: 'var(--green-l)', color: 'var(--green)', padding: '2px 7px', borderRadius: '4px', fontWeight: 600 }}>This device</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface2)', borderRadius: '8px', padding: '10px 12px' }}>
                      <span style={{ fontSize: '18px' }}>📱</span>
                      <div style={{ flex: 1 }}><div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>Safari · iPhone · Colombo, LK</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>Last active 2 hours ago</div></div>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: '11px', color: 'var(--red)' }} onClick={revokeSession}>Revoke</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-section mb16">
              <div className="settings-header">
                <span className="settings-title">Notifications</span>
                <button className="btn btn-ghost btn-sm" onClick={() => handleSaveSettings('notifications')}>{savingSettings ? 'Saving...' : 'Save'}</button>
              </div>
              <div className="settings-body">
                <div className="setting-row"><div className="setting-info"><div className="setting-name">Weekly scan digest</div><div className="setting-desc">Summary email every Monday morning</div></div><button className="toggle on" onClick={e => e.currentTarget.classList.toggle('on')}></button></div>
                <div className="setting-row"><div className="setting-info"><div className="setting-name">Scan milestone alerts</div><div className="setting-desc">Email at 100, 1K, 10K, 100K scans per QR</div></div><button className="toggle on" onClick={e => e.currentTarget.classList.toggle('on')}></button></div>
                <div className="setting-row"><div className="setting-info"><div className="setting-name">Anomaly alerts</div><div className="setting-desc">Notify on sudden scan spikes or drops</div></div><button className="toggle" onClick={e => e.currentTarget.classList.toggle('on')}></button></div>
                <div className="setting-row"><div className="setting-info"><div className="setting-name">New device sign-in</div><div className="setting-desc">Email when your account signs in from a new device</div></div><button className="toggle on" onClick={e => e.currentTarget.classList.toggle('on')}></button></div>
                <div className="setting-row"><div className="setting-info"><div className="setting-name">Product updates</div><div className="setting-desc">Feature announcements and changelogs</div></div><button className="toggle on" onClick={e => e.currentTarget.classList.toggle('on')}></button></div>
                <div className="setting-row"><div className="setting-info"><div className="setting-name">Billing reminders</div><div className="setting-desc">5 days before your subscription renews</div></div><button className="toggle on" onClick={e => e.currentTarget.classList.toggle('on')}></button></div>
              </div>
            </div>

            <div className="settings-section mb16">
              <div className="settings-header">
                <span className="settings-title">Preferences</span>
                <button className="btn btn-ghost btn-sm" onClick={() => handleSaveSettings('preferences')}>{savingPrefs ? 'Saving...' : 'Save'}</button>
              </div>
              <div className="settings-body">
                <div className="setting-row"><div className="setting-info"><div className="setting-name">Default QR mode</div><div className="setting-desc">Mode when creating new QR codes</div></div><select className="form-input" style={{ width: '130px', padding: '6px 10px', fontSize: '12px' }}><option>Dynamic</option><option>Static</option></select></div>
                <div className="setting-row"><div className="setting-info"><div className="setting-name">Analytics date range</div><div className="setting-desc">Default time window in analytics</div></div><select className="form-input" style={{ width: '130px', padding: '6px 10px', fontSize: '12px' }}><option>7 days</option><option>30 days</option><option>90 days</option></select></div>
                <div className="setting-row"><div className="setting-info"><div className="setting-name">Dashboard language</div><div className="setting-desc">Interface language</div></div><select className="form-input" style={{ width: '130px', padding: '6px 10px', fontSize: '12px' }}><option>English</option><option>Sinhala</option><option>Tamil</option></select></div>
                <div className="setting-row"><div className="setting-info"><div className="setting-name">Bot scan filtering</div><div className="setting-desc">Exclude bots from all analytics</div></div><button className="toggle on" onClick={e => e.currentTarget.classList.toggle('on')}></button></div>
              </div>
            </div>

            <div className="settings-section mb16">
              <div className="settings-header"><span className="settings-title">Connected apps</span></div>
              <div className="settings-body">
                <div className="setting-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div style={{ width: '36px', height: '36px', background: '#fff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border2)', fontSize: '18px', flexShrink: 0 }}>📊</div><div className="setting-info"><div className="setting-name">Google Analytics</div><div className="setting-desc">Forward scan events to GA4</div></div></div>
                  <button className="btn btn-ghost btn-sm" onClick={() => showToast('success', 'Google Analytics connection started')}>Connect</button>
                </div>
                <div className="setting-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div style={{ width: '36px', height: '36px', background: '#5865F2', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>💬</div><div className="setting-info"><div className="setting-name">Slack</div><div className="setting-desc">Post milestone alerts to a Slack channel</div></div></div>
                  <button className="btn btn-ghost btn-sm" onClick={() => showToast('success', 'Slack connection started')}>Connect</button>
                </div>
                <div className="setting-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div style={{ width: '36px', height: '36px', background: '#FF6B35', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>🔗</div><div className="setting-info"><div className="setting-name">Zapier</div><div className="setting-desc">Trigger workflows on scan events</div></div></div>
                  <button className="btn btn-ghost btn-sm" onClick={() => showToast('success', 'Zapier connection started')}>Connect</button>
                </div>
              </div>
            </div>

            <div className="settings-section mb16">
              <div className="settings-header">
                <span className="settings-title">Webhook endpoint</span>
                <button className="btn btn-ghost btn-sm" onClick={handleSaveWebhook}>{savingWebhook ? 'Saving...' : 'Save'}</button>
              </div>
              <div className="settings-body">
                <div className="form-section mb16">
                  <label className="form-label">POST endpoint URL</label>
                  <input type="url" className="form-input" placeholder="https://yourapp.com/webhooks/scnr" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} />
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>Scnr will POST scan events in real time. Requires Team plan for full access.</div>
                </div>
                <div>
                  <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>Events to send</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}><input type="checkbox" defaultChecked style={{ accentColor: 'var(--coral)' }} /> qr.scanned</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}><input type="checkbox" defaultChecked style={{ accentColor: 'var(--coral)' }} /> qr.created</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}><input type="checkbox" style={{ accentColor: 'var(--coral)' }} /> qr.updated</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}><input type="checkbox" style={{ accentColor: 'var(--coral)' }} /> scan.milestone</label>
                  </div>
                </div>
                <div style={{ marginTop: '14px' }}><button className="btn btn-ghost btn-sm" onClick={testWebhook}>Send test event</button></div>
              </div>
            </div>

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
