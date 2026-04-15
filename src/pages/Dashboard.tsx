import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import QRCode from 'qrcode';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { apiFetch } from '../lib/api';
import { useUI } from '../shared/UIContext';

export default function Dashboard() {
  const [qrCodes, setQrCodes] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, any>>({});
  const [timeseries, setTimeseries] = useState<any[]>([]);
  const [rangeMode, setRangeMode] = useState<'days' | 'range'>('days');
  const [days, setDays] = useState(30);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [devices, setDevices] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [planData, setPlanData] = useState<any>(null);
  const navigate = useNavigate();
  const { showModal, showToast } = useUI();

  const fetchTimeseries = async () => {
    if (!auth.currentUser) return;
    try {
      let url = `/api/analytics/account/${auth.currentUser.uid}/timeseries`;
      if (rangeMode === 'days') {
        url += `?days=${days}`;
      } else if (startDate && endDate) {
        url += `?start=${startDate}&end=${endDate}`;
      } else {
        return; // Don't fetch if range is incomplete
      }
      const data = await apiFetch(url);
      setTimeseries(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch timeseries", err);
    }
  };

  useEffect(() => {
    fetchTimeseries();
  }, [auth.currentUser, days, rangeMode, startDate, endDate]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const fetchData = async () => {
      try {
        // Fetch QR Codes (now includes stats from server-side join)
        const codes = await apiFetch('/api/qr');
        const codesArray = Array.isArray(codes) ? codes : [];
        setQrCodes(codesArray);
        
        // Map stats from the response
        const newStats: Record<string, any> = {};
        codesArray.forEach((qr: any) => {
          if (qr.stats) newStats[qr.id] = qr.stats;
        });
        setStats(newStats);

        // Fetch account level data
        const [devData, countryData, recentData] = await Promise.all([
          apiFetch(`/api/analytics/account/${auth.currentUser?.uid}/devices`).catch(() => []),
          apiFetch(`/api/analytics/account/${auth.currentUser?.uid}/countries`).catch(() => []),
          apiFetch(`/api/analytics/account/${auth.currentUser?.uid}/recent`).catch(() => [])
        ]);
        
        setDevices(Array.isArray(devData) ? devData : []);
        setCountries(Array.isArray(countryData) ? countryData : []);
        setRecentScans(Array.isArray(recentData) ? recentData : []);

        const pData = await apiFetch('/api/user/plan').catch(() => null);
        setPlanData(pData);

        setLoading(false);
      } catch (err) {
        console.error("Dashboard data fetch error", err);
        setLoading(false);
      }
    };

    fetchData();
  }, [auth.currentUser]);

  const handleDelete = (qrId: string, slug: string) => {
    showModal({
      type: 'confirm',
      title: 'Delete QR Code',
      message: 'Are you sure you want to delete this QR code? This action cannot be undone and all historical scan data, analytics, and stats related to this QR code will be permanently deleted.',
      confirmText: 'Delete Permanently',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await apiFetch(`/api/qr/${slug}`, {
            method: 'DELETE'
          });
          
          setQrCodes(prev => prev.filter(qr => qr.id !== qrId));
          setStats(prev => {
            const next = { ...prev };
            delete next[qrId];
            return next;
          });
          showToast('success', 'QR code deleted successfully');
        } catch (err) {
          console.error(err);
          showToast('error', 'Error deleting QR code.');
        }
      }
    });
  };

  useEffect(() => {
    qrCodes.forEach(qr => {
      const canvas = document.getElementById(`thumb-${qr.id}`) as HTMLCanvasElement;
      if (canvas) {
        let content = '';
        if (qr.is_dynamic !== false) {
          content = `${window.location.origin}/${qr.slug}`;
        } else {
          if (qr.qr_type === 'url') {
            content = qr.destination_url || 'https://scnr.app';
          } else if (qr.qr_type === 'vcard') {
            content = `BEGIN:VCARD\nVERSION:3.0\nN:${qr.content_data?.last_name || ''};${qr.content_data?.first_name || ''}\nFN:${qr.content_data?.first_name || ''} ${qr.content_data?.last_name || ''}\nTEL:${qr.content_data?.phone || ''}\nEMAIL:${qr.content_data?.email || ''}\nORG:${qr.content_data?.company || ''}\nURL:${qr.content_data?.website || ''}\nEND:VCARD`;
          } else if (qr.qr_type === 'wifi') {
            content = `WIFI:S:${qr.content_data?.ssid || ''};T:${qr.content_data?.encryption || 'WPA'};P:${qr.content_data?.password || ''};;`;
          } else if (qr.qr_type === 'text') {
            content = qr.content_data?.text || 'Enter text';
          } else if (qr.qr_type === 'email') {
            content = `mailto:${qr.content_data?.email || ''}?subject=${encodeURIComponent(qr.content_data?.subject || '')}&body=${encodeURIComponent(qr.content_data?.body || '')}`;
          } else {
            content = qr.destination_url || 'https://scnr.app';
          }
        }

        QRCode.toCanvas(canvas, content, {
          width: 32,
          margin: 0,
          color: {
            dark: qr.style?.dot_color || '#000000',
            light: qr.style?.bg_color || '#FFFFFF'
          }
        }).catch(err => console.error(err));
      }
    });
  }, [qrCodes]);

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  const totalScans = Number(Object.values(stats).reduce((sum: number, s: any) => sum + (s.total_scans || 0), 0));
  const uniqueVisitors = Number(Object.values(stats).reduce((sum: number, s: any) => sum + (s.unique_scans || 0), 0));
  const activeCodes = qrCodes.filter(qr => qr.is_active !== false).length;

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">
        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">
              <svg className="stat-icon" viewBox="0 0 16 16" fill="var(--coral)"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3zm0 2a3 3 0 100 6 3 3 0 000-6z"/></svg>
              Total Scans
            </div>
            <div className="stat-val">{totalScans.toLocaleString()}</div>
            <span className="stat-change up">↑ 0% vs last month</span>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              <svg className="stat-icon" viewBox="0 0 16 16" fill="var(--blue)"><circle cx="8" cy="6" r="3"/><path d="M3 14c0-2.761 2.239-5 5-5s5 2.239 5 5"/></svg>
              Unique Visitors
            </div>
            <div className="stat-val">{uniqueVisitors.toLocaleString()}</div>
            <span className="stat-change up">↑ 0% vs last month</span>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              <svg className="stat-icon" viewBox="0 0 16 16" fill="var(--purple)"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
              QR Codes
            </div>
            <div className="stat-val">{qrCodes.length}</div>
            <span className="stat-change neutral">
              {planData ? `${planData.limits.qr_codes === -1 ? 'Unlimited' : planData.limits.qr_codes} limit` : 'Loading...'}
            </span>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              <svg className="stat-icon" viewBox="0 0 16 16" fill="var(--amber)"><path d="M8 1l2 4 5 .7-3.5 3.4.8 5L8 12l-4.3 2.1.8-5L1 5.7 6 5z"/></svg>
              Account Plan
            </div>
            <div className="stat-val" style={{ fontSize: '20px', textTransform: 'uppercase' }}>
              {planData?.plan || 'Free'}
            </div>
            <span className="stat-change neutral" style={{ cursor: 'pointer', color: 'var(--coral)' }} onClick={() => navigate('/billing')}>
              Upgrade →
            </span>
          </div>
        </div>

        {/* Chart + Device Split */}
        <div className="grid-21 mb24">
          <div className="card">
            <div className="section-row">
              <span className="card-title">Scans over time</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <select 
                  className="btn btn-ghost btn-sm" 
                  value={rangeMode} 
                  onChange={(e) => setRangeMode(e.target.value as any)}
                  style={{ fontSize: '11px', padding: '2px 6px' }}
                >
                  <option value="days">Last X Days</option>
                  <option value="range">Custom Range</option>
                </select>

                {rangeMode === 'days' ? (
                  <select 
                    className="btn btn-ghost btn-sm" 
                    value={days} 
                    onChange={(e) => setDays(Number(e.target.value))}
                    style={{ fontSize: '11px', padding: '2px 6px' }}
                  >
                    <option value={7}>7d</option>
                    <option value={14}>14d</option>
                    <option value={30}>30d</option>
                    <option value={90}>90d</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input 
                      type="date" 
                      className="btn btn-ghost btn-sm" 
                      value={startDate} 
                      onChange={(e) => setStartDate(e.target.value)}
                      style={{ fontSize: '11px', padding: '2px 4px' }}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--text3)' }}>-</span>
                    <input 
                      type="date" 
                      className="btn btn-ghost btn-sm" 
                      value={endDate} 
                      onChange={(e) => setEndDate(e.target.value)}
                      style={{ fontSize: '11px', padding: '2px 4px' }}
                    />
                  </div>
                )}
              </div>
            </div>
            <div style={{ height: '100px', width: '100%', marginTop: '10px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeseries}>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                  />
                  <Line type="monotone" dataKey="total_scans" stroke="var(--coral)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text3)' }}>
                {rangeMode === 'days' ? `${days} days ago` : startDate || 'Start'}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text3)' }}>
                {rangeMode === 'days' ? 'Today' : endDate || 'End'}
              </span>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Device split</div>
            {devices.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)' }}>No data</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <svg width="90" height="90" viewBox="0 0 90 90">
                  <circle cx="45" cy="45" r="35" fill="none" stroke="var(--surface3)" strokeWidth="10"/>
                  {devices.map((d, i) => {
                    const total = devices.reduce((sum, item) => sum + item.count, 0);
                    const pct = d.count / total;
                    const dasharray = `${pct * 220} 220`;
                    let dashoffset = 0;
                    for (let j = 0; j < i; j++) {
                      dashoffset -= (devices[j].count / total) * 220;
                    }
                    const color = d.device_type === 'mobile' ? 'var(--coral)' : d.device_type === 'desktop' ? 'var(--blue)' : 'var(--purple)';
                    return (
                      <circle key={d.device_type} cx="45" cy="45" r="35" fill="none" stroke={color} strokeWidth="10"
                        strokeDasharray={dasharray} strokeDashoffset={dashoffset} strokeLinecap="round" className="donut-ring" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}/>
                    );
                  })}
                  <text x="45" y="42" textAnchor="middle" fill="var(--text)" fontSize="14" fontWeight="700" fontFamily="Fraunces,serif">{devices[0]?.pct || 0}%</text>
                  <text x="45" y="54" textAnchor="middle" fill="var(--text3)" fontSize="8">{devices[0]?.device_type || 'mobile'}</text>
                </svg>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {devices.map(d => {
                    const color = d.device_type === 'mobile' ? 'var(--coral)' : d.device_type === 'desktop' ? 'var(--blue)' : 'var(--purple)';
                    const icon = d.device_type === 'mobile' ? '📱' : d.device_type === 'desktop' ? '💻' : '📟';
                    return (
                      <div key={d.device_type}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                          <span style={{ color: 'var(--text2)' }}>{icon} {d.device_type.charAt(0).toUpperCase() + d.device_type.slice(1)}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{d.pct}%</span>
                        </div>
                        <div className="progress-bar"><div className="progress-fill" style={{ width: `${d.pct}%`, background: color }}></div></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* QR Codes table + Top Countries */}
        <div className="grid-21 mb24">
          <div className="card">
            <div className="section-row">
              <span className="section-title">Your QR codes</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/create')}>+ New</button>
            </div>
            
            {qrCodes.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text3)' }}>
                No QR codes yet. <Link to="/create" style={{ color: 'var(--coral)', textDecoration: 'none' }}>Create your first one</Link>.
              </div>
            ) : (
              <div className="qr-table-wrap">
                <table className="qr-table">
                  <thead>
                    <tr>
                      <th>QR Code</th>
                      <th>Scans</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {qrCodes.map(qr => {
                      const qrStats = stats[qr.id] || {};
                      let inactiveReason = 'Paused';
                      if (qr.expiry_date && new Date(qr.expiry_date) < new Date()) inactiveReason = 'Expired';
                      if (qr.rate_limit?.enabled && qrStats.total_scans > qr.rate_limit.max_scans) inactiveReason = 'Scan Limit Reached';

                      return (
                        <tr key={qr.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div className="qr-thumb">
                                <canvas id={`thumb-${qr.id}`} width="32" height="32"></canvas>
                              </div>
                              <div>
                                <div className="qr-row-name">{qr.title || 'Untitled'}</div>
                                <div className="qr-row-slug">{window.location.host}/{qr.slug}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{(qrStats.total_scans || 0).toLocaleString()}</div>
                            {qrStats.failed_scans > 0 && (
                              <div style={{ fontSize: '11px', color: 'var(--coral)', marginTop: '2px' }}>
                                {qrStats.failed_scans.toLocaleString()} failed
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span className={`status-pill ${qr.is_active !== false ? 'status-active' : 'status-inactive'}`}>
                                {qr.is_active !== false ? '● Active' : '● Inactive'}
                              </span>
                              {qr.is_active === false && (
                                <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{inactiveReason}</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/analytics/${qr.slug}`)}>Stats →</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/edit/${qr.id}`)}>Edit</button>
                              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--coral)' }} onClick={() => handleDelete(qr.id, qr.slug)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-title">Top countries</div>
            {countries.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)' }}>No data</div>
            ) : (
              <div id="country-list-main">
                {countries.map(c => {
                  const maxScans = countries[0].scans;
                  const pct = (c.scans / maxScans) * 100;
                  return (
                    <div key={c.country} className="country-row">
                      <div className="c-name" style={{ flex: 1, fontSize: '13px', color: 'var(--text2)' }}>{c.country}</div>
                      <div className="c-bar-track" style={{ flex: 2, height: '3px', background: 'var(--surface3)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div className="c-bar-fill" style={{ height: '100%', background: 'var(--coral)', borderRadius: '2px', width: `${pct}%` }}></div>
                      </div>
                      <div className="c-count" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', minWidth: '36px', textAlign: 'right' }}>{c.scans}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div className="card">
          <div className="section-row">
            <span className="section-title">Live scan feed</span>
            <span style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '6px' }}><span className="live-dot"></span> Real-time</span>
          </div>
          {recentScans.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)' }}>No recent scans</div>
          ) : (
            <div id="live-feed" style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {recentScans.map(scan => (
                <div key={scan.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px', marginBottom: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: scan.is_unique ? 'var(--blue)' : 'var(--surface3)' }}></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '2px' }}>{scan.slug}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{scan.city}, {scan.country} · {scan.device_type} · {scan.browser}</div>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                    {new Date(scan.scanned_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
