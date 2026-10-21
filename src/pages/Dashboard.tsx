import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import QRCode from 'qrcode';
import QRCodeStyling from 'qr-code-styling';
import { zipSync } from 'fflate';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { apiFetch } from '../lib/api';
import { useUI } from '../shared/UIContext';
import QRViewerModal from '../components/QRViewerModal';
import { pageEditPath } from './Pages';
import { getQRContent, SHORT_DOMAIN, shortHost, stylingOptions, framedSvg, slugProblem } from '../lib/qrContent';

// Dashboard tabs over the one loaded list.
const TABS: [string, string][] = [['qr', 'QR codes'], ['page', 'Pages'], ['link', 'Short links'], ['form', 'Forms']];
const tabOf = (q: any) => (q.kind === 'link' ? 'link' : q.qr_type === 'page' ? 'page' : q.qr_type === 'form' ? 'form' : 'qr');
const SORTS: Record<string, [string, (a: any, b: any) => number]> = {
  newest: ['Newest', (a, b) => String(b.created_at).localeCompare(String(a.created_at))],
  oldest: ['Oldest', (a, b) => String(a.created_at).localeCompare(String(b.created_at))],
  scans: ['Most scans', (a, b) => (b.stats?.total_scans || 0) - (a.stats?.total_scans || 0)],
  name: ['Name', (a, b) => String(a.title || a.slug).localeCompare(String(b.title || b.slug))],
};

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// "Swap today's offer": edit a guest page's offer in place; live on the next scan, no reprint.
function OfferSwap({ qr, onSaved }: { qr: any; onSaved: (qr: any) => void }) {
  const { showToast } = useUI();
  const [text, setText] = useState(qr.content_data?.offer?.text || '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const content_data = { ...qr.content_data, offer: text ? { ...(qr.content_data?.offer || {}), text } : undefined };
      if (content_data.kit) content_data.kit = { ...content_data.kit, offerText: text };
      await apiFetch(`/api/qr/${qr.slug}`, { method: 'PUT', body: JSON.stringify({ content_data }) });
      onSaved({ ...qr, content_data });
      showToast('success', 'Offer is live on the next scan. No reprint needed.');
    } catch (err: any) {
      showToast('error', err?.message || 'Could not save the offer');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 600, minWidth: '140px' }}>{qr.title}</span>
      <input aria-label={`Today's offer for ${qr.title}`} className="form-input" style={{ flex: 1, minWidth: '200px' }} value={text}
        placeholder="e.g. Kottu night: 20% off after 7pm" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} />
      <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Make live'}</button>
    </div>
  );
}

export default function Dashboard() {
  const [qrCodes, setQrCodes] = useState<any[]>([]);
  const [tab, setTab] = useState('qr');
  const [folder, setFolder] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string> | null>(null); // null = not in select mode
  const [pasteUrl, setPasteUrl] = useState('');
  const [backHalf, setBackHalf] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewQR, setViewQR] = useState<any | null>(null);
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
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { showModal, showToast } = useUI();
  
  // Safety timeout to prevent infinite loading if userId never arrives
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
  }, []);

  const fetchTimeseries = async () => {
    if (!userId) return;
    try {
      let url = `/api/analytics/account/${userId}/timeseries`;
      if (rangeMode === 'days') {
        url += `?days=${days}`;
      } else if (startDate && endDate) {
        url += `?start=${startDate}&end=${endDate}`;
      } else {
        return;
      }
      const data = await apiFetch(url);
      setTimeseries(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch timeseries', err);
    }
  };

  useEffect(() => {
    fetchTimeseries();
  }, [userId, days, rangeMode, startDate, endDate]);

  useEffect(() => {
    if (!userId) return;

    const fetchData = async () => {
      try {
        await loadCodes();

        // Fetch account level data
        const [devData, countryData, recentData] = await Promise.all([
          apiFetch(`/api/analytics/account/${userId}/devices`).catch(() => []),
          apiFetch(`/api/analytics/account/${userId}/countries`).catch(() => []),
          apiFetch(`/api/analytics/account/${userId}/recent`).catch(() => [])
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
  }, [userId]);

  // QR codes, pages and short links in one list, each with its stats from the server-side join.
  const loadCodes = async () => {
    const codes = await apiFetch('/api/qr');
    const codesArray = Array.isArray(codes) ? codes : [];
    setQrCodes(codesArray);
    const newStats: Record<string, any> = {};
    codesArray.forEach((qr: any) => {
      if (qr.stats) newStats[qr.id] = qr.stats;
    });
    setStats(newStats);
  };

  // "Paste a link": a short link straight from the Dashboard (kind 'link'; no QR image).
  const shorten = async () => {
    const url = pasteUrl.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(url)) return showToast('error', 'Paste a full link starting with https://');
    if (slugProblem(backHalf)) return showToast('error', slugProblem(backHalf));
    setBusy(true);
    try {
      const qr = await apiFetch('/api/qr', { method: 'POST', body: JSON.stringify({ kind: 'link', qr_type: 'url', destination_url: url, title: new URL(url).hostname.slice(0, 120), ...(backHalf ? { slug: backHalf } : {}) }) });
      const short = getQRContent(qr);
      navigator.clipboard?.writeText(short).catch(() => {});
      showToast('success', `${short} is ready and copied.`);
      setPasteUrl('');
      setBackHalf('');
      setTab('link');
      await loadCodes();
    } catch (err: any) {
      showToast('error', err?.message || 'Could not shorten that link');
    } finally {
      setBusy(false);
    }
  };

  // Select mode: one server call for many codes, then reload and report what happened.
  const bulk = async (action: string, value?: string) => {
    if (!selected?.size) return;
    try {
      const r = await apiFetch('/api/qr/bulk', { method: 'POST', body: JSON.stringify({ slugs: [...selected], action, value }) });
      const why = [...new Set((r.failed || []).map((f: any) => f.error))].join(', ');
      showToast(r.failed?.length ? 'warning' : 'success', `${r.done.length} done${r.failed?.length ? `, ${r.failed.length} failed (${why})` : ''}.`);
      setSelected(new Set());
      await loadCodes();
    } catch (err: any) {
      showToast('error', err?.message || 'That did not work. Try again.');
    }
  };
  const askBulk = (action: string, title: string, message: string, confirmText: string) =>
    showModal({ type: 'prompt', title, message, confirmText, onConfirm: v => bulk(action, (v || '').trim()) });

  // Download ZIP: one 1000 px SVG per selected QR code (short links have no image), named after the title.
  const downloadZip = async () => {
    const codes = qrCodes.filter(q => selected?.has(q.slug) && q.kind !== 'link');
    if (!codes.length) return showToast('info', 'Select at least one QR code. Short links have no image.');
    setBusy(true);
    try {
      const files: Record<string, Uint8Array> = {}, used = new Set<string>();
      for (const qr of codes) {
        const raw = await new QRCodeStyling({ ...stylingOptions(qr.style, getQRContent(qr), 1000), type: 'svg' }).getRawData('svg');
        let svg = await (raw as Blob).text();
        if (qr.style?.frame) svg = framedSvg(svg, 1000, qr.style.frame);
        const base = String(qr.title || qr.slug).replace(/[^a-z0-9-]+/gi, '_').slice(0, 60) || qr.slug;
        let name = base, i = 2;
        while (used.has(name.toLowerCase())) name = `${base}-${i++}`;
        used.add(name.toLowerCase());
        files[`${name}.svg`] = new TextEncoder().encode(svg);
      }
      saveBlob(new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }), 'scnr-codes.zip');
    } catch {
      showToast('error', 'Could not build the ZIP. Try fewer codes.');
    } finally {
      setBusy(false);
    }
  };

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

  // ponytail: tabs, filters, sort and search run client-side over the loaded list; move them server-side
  // (GET /api/qr already takes ?kind, ?tag, ?folder) if a list exceeds 2,000 rows.
  const needle = search.trim().toLowerCase();
  const shown = qrCodes
    .filter(q => tabOf(q) === tab && (!folder || q.client === folder) && (!tag || (q.tags || []).includes(tag))
      && (!needle || [q.title, q.slug, q.destination_url].some(v => String(v || '').toLowerCase().includes(needle))))
    .sort(SORTS[sort][1]);
  const shownKey = shown.map(q => q.id).join();
  const folders = [...new Set(qrCodes.map(q => q.client).filter(Boolean))].sort() as string[];
  const allTags = [...new Set(qrCodes.flatMap(q => q.tags || []))].sort() as string[];
  // A filter whose folder or tag no longer exists would hide everything with no control to clear it.
  useEffect(() => { if (folder && !folders.includes(folder)) setFolder(''); if (tag && !allTags.includes(tag)) setTag(''); }, [qrCodes]);
  // Bulk actions only ever touch what is on screen: a tab or filter change clears the selection.
  useEffect(() => { setSelected(s => (s ? new Set() : s)); }, [tab, folder, tag, search]);
  const noCustomSlug = !!planData && !planData.limits?.custom_slug;

  useEffect(() => {
    shown.forEach(qr => {
      if (qr.kind === 'link') return;
      const canvas = document.getElementById(`thumb-${qr.id}`) as HTMLCanvasElement;
      if (canvas) {
        const content = getQRContent(qr) || SHORT_DOMAIN;

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
  }, [shownKey, qrCodes]);

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  const totalScans = Number(Object.values(stats).reduce((sum: number, s: any) => sum + (s.total_scans || 0), 0));
  const uniqueVisitors = Number(Object.values(stats).reduce((sum: number, s: any) => sum + (s.unique_scans || 0), 0));

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">
        {/* Paste a link: shorten it here, or open the editor with it filled in */}
        <div className="card mb16">
          <div className="card-title">Paste a link</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="url" aria-label="Link to shorten" className="form-input" style={{ flex: '3 1 260px' }} placeholder="https://example.com/a-long-link"
              value={pasteUrl} onChange={e => setPasteUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') shorten(); }} />
            <input aria-label="Custom back-half" className={`form-input ${slugProblem(backHalf) ? 'error' : ''}`} style={{ flex: '1 1 150px' }} maxLength={40}
              placeholder={noCustomSlug ? 'Back-half (Pro)' : 'Back-half (optional)'} disabled={noCustomSlug}
              value={backHalf} onChange={e => setBackHalf(e.target.value.trim())} />
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={shorten}>Shorten</button>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/create?url=${encodeURIComponent(pasteUrl.trim())}`)}>Make QR code</button>
          </div>
          {slugProblem(backHalf) ? <div className="error-msg">{slugProblem(backHalf)}</div>
            : noCustomSlug && <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '6px' }}>Pick your own back-half ({shortHost()}/your-name) on <Link to="/billing" style={{ color: 'var(--coral)' }}>Pro</Link>.</div>}
        </div>

        {/* Today's offer on guest pages (Restaurant Kit) */}
        {qrCodes.some(q => q.qr_type === 'page') ? (
          <div className="card mb16">
            <div className="card-title">Today's offer</div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {qrCodes.filter(q => q.qr_type === 'page').map(q => (
                <OfferSwap key={q.slug} qr={q} onSaved={u => setQrCodes(prev => prev.map(p => p.slug === u.slug ? u : p))} />
              ))}
            </div>
          </div>
        ) : (
          <div className="card mb16" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div className="card-title" style={{ marginBottom: '4px' }}>Restaurant Kit</div>
              <div style={{ fontSize: '13px', color: 'var(--text3)' }}>One table QR for your menu, reviews, WhatsApp, Wi-Fi and today's offer — in English, Sinhala and Tamil.</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/kit')}>Set up the kit →</button>
          </div>
        )}

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">
              <svg className="stat-icon" viewBox="0 0 16 16" fill="var(--coral)"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3zm0 2a3 3 0 100 6 3 3 0 000-6z"/></svg>
              Total Scans
            </div>
            <div className="stat-val">{totalScans.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              <svg className="stat-icon" viewBox="0 0 16 16" fill="var(--blue)"><circle cx="8" cy="6" r="3"/><path d="M3 14c0-2.761 2.239-5 5-5s5 2.239 5 5"/></svg>
              Unique Visitors
            </div>
            <div className="stat-val">{uniqueVisitors.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              <svg className="stat-icon" viewBox="0 0 16 16" fill="var(--purple)"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
              QR Codes
            </div>
            <div className="stat-val">{qrCodes.filter(q => q.kind !== 'link').length}</div>
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
                  aria-label="Date range type"
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
                    aria-label="Number of days"
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
                      aria-label="Start date"
                      type="date" 
                      className="btn btn-ghost btn-sm" 
                      value={startDate} 
                      onChange={(e) => setStartDate(e.target.value)}
                      style={{ fontSize: '11px', padding: '2px 4px' }}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--text3)' }}>-</span>
                    <input 
                      aria-label="End date"
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
              <ResponsiveContainer width="100%" height={100}>
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
            <div className="section-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <div className="dash-tabs" role="tablist">
                {TABS.map(([t, label]) => (
                  <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                    {label} ({qrCodes.filter(q => tabOf(q) === t).length})
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(selected ? null : new Set())}>{selected ? 'Done' : 'Select'}</button>
                {planData?.limits?.bulk_create && <button className="btn btn-ghost btn-sm" onClick={() => navigate('/bulk')}>Bulk</button>}
                {tab !== 'link' && <button className="btn btn-ghost btn-sm" onClick={() => navigate(tab === 'page' ? '/pages' : tab === 'form' ? '/forms/new' : '/create')}>+ New</button>}
              </div>
            </div>

            <div className="list-tools">
              <input type="search" aria-label="Search" className="form-input" style={{ flex: '1 1 160px' }} placeholder="Search name, link or back-half" value={search} onChange={e => setSearch(e.target.value)} />
              <select aria-label="Sort" className="form-input" value={sort} onChange={e => setSort(e.target.value)}>
                {Object.entries(SORTS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
              </select>
              {folders.length > 0 && (
                <select aria-label="Filter by folder" className="form-input" value={folder} onChange={e => setFolder(e.target.value)}>
                  <option value="">All folders</option>
                  {folders.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {allTags.length > 0 && (
                <select aria-label="Filter by tag" className="form-input" value={tag} onChange={e => setTag(e.target.value)}>
                  <option value="">All tags</option>
                  {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
              {folder && (
                <Link className="btn btn-ghost btn-sm" to={`/analytics?folder=${encodeURIComponent(folder)}&slugs=${qrCodes.filter(q => q.client === folder).map(q => q.slug).join(',')}`}>
                  Folder analytics →
                </Link>
              )}
            </div>

            {selected && (
              <div className="select-bar">
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '6px' }}>
                  <input type="checkbox" aria-label="Select all shown" checked={shown.length > 0 && shown.every(q => selected.has(q.slug))}
                    onChange={e => setSelected(new Set(e.target.checked ? shown.map(q => q.slug) : []))} />
                  {selected.size} selected
                </label>
                {selected.size > 0 && <>
                  <button className="btn btn-ghost btn-sm" onClick={() => askBulk('folder', 'Move to folder', 'Type a folder name (new or existing). Leave it empty to take the codes out of their folder.', 'Move')}>Move to folder</button>
                  {(planData?.limits?.workspaces ?? 1) > 1 && !planData?.is_member && <button className="btn btn-ghost btn-sm" onClick={() => askBulk('workspace', 'Move to workspace', 'Type the workspace name, or "default" for the default workspace.', 'Move')}>Move to workspace</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => askBulk('tag', 'Add a tag', 'Type a tag to add to the selected codes.', 'Add tag')}>Add tag</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => bulk('activate')}>Activate</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => bulk('deactivate')}>Deactivate</button>
                  {tab !== 'link' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={downloadZip}>{busy ? 'Building ZIP…' : 'Download ZIP'}</button>}
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--coral)' }} onClick={() => showModal({
                    type: 'confirm', title: `Delete ${selected.size} code${selected.size === 1 ? '' : 's'}`, isDestructive: true, confirmText: 'Delete permanently',
                    message: 'The selected codes and all their scan history will be deleted. Printed codes will stop working. This cannot be undone.',
                    onConfirm: () => bulk('delete'),
                  })}>Delete</button>
                </>}
              </div>
            )}

            {shown.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text3)' }}>
                {needle || folder || tag ? 'Nothing matches these filters.'
                  : tab === 'link' ? 'No short links yet. Paste a link above and press Shorten.'
                  : tab === 'form' ? <>No forms yet. <Link to="/forms/new" style={{ color: 'var(--coral)', textDecoration: 'none' }}>Build your first form</Link>.</>
                  : tab === 'page' ? <>No pages yet. <Link to="/pages" style={{ color: 'var(--coral)', textDecoration: 'none' }}>Build your first page</Link>.</>
                  : <>No QR codes yet. <Link to="/create" style={{ color: 'var(--coral)', textDecoration: 'none' }}>Create your first one</Link>.</>}
              </div>
            ) : (
              <div className="qr-table-wrap">
                <table className="qr-table stack">
                  <thead>
                    <tr>
                      {selected && <th></th>}
                      <th>{tab === 'link' ? 'Short link' : tab === 'page' ? 'Page' : tab === 'form' ? 'Form' : 'QR Code'}</th>
                      <th>Scans</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(qr => {
                      const qrStats = stats[qr.id] || {};
                      const isLink = qr.kind === 'link';
                      let inactiveReason = 'Paused';
                      if (qr.expiry_date && new Date(qr.expiry_date) < new Date()) inactiveReason = 'Expired';
                      if (qr.rate_limit?.enabled && qrStats.total_scans > qr.rate_limit.max_scans) inactiveReason = 'Scan Limit Reached';

                      return (
                        <tr key={qr.id}>
                          {selected && (
                            <td>
                              <input type="checkbox" aria-label={`Select ${qr.title || qr.slug}`} checked={selected.has(qr.slug)}
                                onChange={e => setSelected(prev => { const next = new Set(prev); if (e.target.checked) next.add(qr.slug); else next.delete(qr.slug); return next; })} />
                            </td>
                          )}
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {!isLink && (
                                <div
                                  className="qr-thumb"
                                  style={{ cursor: 'pointer' }}
                                  title="View QR code"
                                  onClick={() => setViewQR(qr)}
                                >
                                  <canvas id={`thumb-${qr.id}`} width="32" height="32"></canvas>
                                </div>
                              )}
                              <div style={{ minWidth: 0 }}>
                                <div className="qr-row-name">{qr.title || 'Untitled'}</div>
                                <div className="qr-row-slug">
                                  {isLink ? getQRContent(qr).replace(/^https?:\/\//, '') : `${shortHost()}/${qr.slug}`}
                                  {isLink && (
                                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: '6px', padding: '0 6px', fontSize: '11px' }}
                                      onClick={() => navigator.clipboard.writeText(getQRContent(qr)).then(() => showToast('success', 'Link copied!'))}>Copy</button>
                                  )}
                                </div>
                                {isLink && <div style={{ fontSize: '11px', color: 'var(--text3)', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>→ {qr.destination_url}</div>}
                                {(qr.client || qr.tags?.length > 0) && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                    {qr.client && <span className="chip tag-chip" title="Folder">📁 {qr.client}</span>}
                                    {(qr.tags || []).map((t: string) => <span key={t} className="chip tag-chip" style={{ cursor: 'pointer' }} onClick={() => setTag(t)}>{t}</span>)}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td data-label="Scans">
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
                              {!isLink && (
                                <button className="btn btn-ghost btn-sm" onClick={() => setViewQR(qr)} title="View & download QR">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/>
                                  </svg>
                                </button>
                              )}
                              <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/analytics/${qr.slug}`)}>Stats →</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => navigate(qr.qr_type === 'page' ? pageEditPath(qr) : qr.qr_type === 'form' ? `/forms/${qr.slug}/edit` : `/edit/${qr.id}`)}>Edit</button>
                              {qr.qr_type === 'form' && <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/forms/${qr.slug}/responses`)}>Responses</button>}
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
            <span className="section-title">Recent scans</span>
            <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Updated when you open this page</span>
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

      {viewQR && <QRViewerModal qr={viewQR} onClose={() => setViewQR(null)} />}
    </div>
  );
}
