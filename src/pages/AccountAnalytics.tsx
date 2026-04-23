import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { apiFetch } from '../lib/api';
import { Link, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';

const COLORS = ['#1A1916', '#E85D3A', '#4D9EFF', '#3DCC7E', '#9B7FFF', '#F5A623', '#D0021B'];

export default function AccountAnalytics() {
  const [accountStats, setAccountStats] = useState<any>(null);
  const [accountTimeseries, setAccountTimeseries] = useState<any[]>([]);
  const [rangeMode, setRangeMode] = useState<'days' | 'range'>('days');
  const [days, setDays] = useState(30);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [qrPerformance, setQrPerformance] = useState<any[]>([]);
  const [accountCountries, setAccountCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();
  
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
      let tsUrl = `/api/analytics/account/${userId}/timeseries`;
      if (rangeMode === 'days') {
        tsUrl += `?days=${days}`;
      } else if (startDate && endDate) {
        tsUrl += `?start=${startDate}&end=${endDate}`;
      } else {
        return;
      }
      const data = await apiFetch(tsUrl);
      setAccountTimeseries(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch timeseries", err);
    }
  };

  useEffect(() => {
    fetchTimeseries();
  }, [userId, days, rangeMode, startDate, endDate]);

  useEffect(() => {
    if (!userId) return;

    const fetchStats = async () => {
      try {
        const [stats, performance, countries] = await Promise.all([
          apiFetch(`/api/analytics/account/${userId}`),
          apiFetch(`/api/analytics/account/${userId}/performance`),
          apiFetch(`/api/analytics/account/${userId}/countries`),
        ]);

        setAccountStats(stats);
        setQrPerformance(Array.isArray(performance) ? performance : []);
        setAccountCountries(Array.isArray(countries) ? countries : []);
      } catch (err) {
        console.error("Failed to fetch account analytics", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [userId]);

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading analytics...</div>;
  }

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">
        {/* Big stats */}
        <div className="stats-row mb24">
          <div className="stat-card">
            <div className="stat-label">Total scans</div>
            <div className="stat-val">{accountStats?.total_scans?.toLocaleString() || 0}</div>
            <span className="stat-change up">↑ 0%</span>
          </div>
          <div className="stat-card">
            <div className="stat-label">Unique visitors</div>
            <div className="stat-val">{accountStats?.unique_visitors?.toLocaleString() || 0}</div>
            <span className="stat-change up">↑ 0%</span>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avg scans / day</div>
            <div className="stat-val">{(() => {
              const total = accountStats?.total_scans || 0;
              if (!total) return 0;
              const daysCount = (accountStats && accountStats.first_scan)
                ? Math.max(1, Math.ceil((Date.now() - new Date(accountStats.first_scan + 'T00:00').getTime()) / 86400000))
                : 1;
              return Math.round(total / daysCount).toLocaleString();
            })()}</div>
            <span className="stat-change neutral">--</span>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active QR Codes</div>
            <div className="stat-val">{accountStats?.active_qrs || 0}</div>
            <span className="stat-change neutral">
              {accountStats?.total_qrs || 0} total
            </span>
          </div>
        </div>

        {/* Line chart + Countries */}
        <div className="grid-21 mb16">
          <div className="card">
            <div className="section-row">
              <span className="section-title">Scan trend</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select 
                  className="btn btn-ghost btn-sm" 
                  value={rangeMode} 
                  onChange={(e) => setRangeMode(e.target.value as any)}
                  style={{ fontSize: '11px' }}
                >
                  <option value="days">Last X Days</option>
                  <option value="range">Custom Range</option>
                </select>

                {rangeMode === 'days' ? (
                  <select 
                    className="btn btn-ghost btn-sm" 
                    value={days} 
                    onChange={(e) => setDays(Number(e.target.value))}
                    style={{ fontSize: '11px' }}
                  >
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input 
                      type="date" 
                      className="btn btn-ghost btn-sm" 
                      value={startDate} 
                      onChange={(e) => setStartDate(e.target.value)}
                      style={{ fontSize: '11px', padding: '2px 6px' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text3)' }}>to</span>
                    <input 
                      type="date" 
                      className="btn btn-ghost btn-sm" 
                      value={endDate} 
                      onChange={(e) => setEndDate(e.target.value)}
                      style={{ fontSize: '11px', padding: '2px 6px' }}
                    />
                  </div>
                )}
                <div style={{ display: 'flex', gap: '6px', marginLeft: '10px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text3)' }}>
                    <span style={{ width: '10px', height: '2px', background: 'var(--coral)', display: 'inline-block', borderRadius: '1px' }}></span>Total
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text3)' }}>
                    <span style={{ width: '10px', height: '2px', background: 'var(--blue)', display: 'inline-block', borderRadius: '1px' }}></span>Unique
                  </span>
                </div>
              </div>
            </div>
            <div style={{ height: '200px', position: 'relative', minHeight: '200px', minWidth: 0, marginTop: '16px' }}>
              {accountTimeseries.length === 0 ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '13px', background: 'var(--surface2)', borderRadius: '4px' }}>
                  No scan data found for this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={accountTimeseries}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => {
                        const d = new Date(val + 'T00:00');
                        return `${d.getMonth()+1}/${d.getDate()}`;
                      }}
                      stroke="var(--text3)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="var(--text3)" 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={false} 
                      allowDecimals={false}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                    />
                    <Line type="monotone" dataKey="total_scans" name="Total" stroke="var(--coral)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="unique_scans" name="Unique" stroke="var(--blue)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-title">Top countries</div>
            <div style={{ height: '200px', minHeight: '200px', minWidth: 0, marginTop: '16px' }}>
              {accountCountries.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '13px', background: 'var(--surface2)', borderRadius: '4px' }}>
                  No geographic data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={accountCountries} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border)" />
                    <XAxis type="number" stroke="var(--text3)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis dataKey="country" type="category" stroke="var(--text3)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{fill: 'var(--surface2)'}} />
                    <Bar dataKey="scans" name="Total Scans" fill="var(--blue)" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Per-QR breakdown */}
        <div className="card">
          <div className="section-row">
            <span className="section-title">Per QR performance</span>
          </div>
          {qrPerformance.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text3)' }}>
              No performance data yet.
            </div>
          ) : (
            <div className="qr-table-wrap">
              <table className="qr-table">
                <thead>
                  <tr>
                    <th>QR Code</th>
                    <th>Total Scans</th>
                    <th>Unique</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {qrPerformance.map((qr: any) => (
                    <tr key={qr.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div>
                            <div className="qr-row-name">{qr.title || 'Untitled'}</div>
                            <div className="qr-row-slug">{window.location.host}/{qr.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{(qr.total_scans || 0).toLocaleString()}</div>
                      </td>
                      <td>
                        <div style={{ color: 'var(--text2)' }}>{(qr.unique_scans || 0).toLocaleString()}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/analytics/${qr.slug}`)}>Details →</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
