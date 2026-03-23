import React, { useEffect, useState } from 'react';
import { auth } from '../firebase';
import { Link, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';

const COLORS = ['#1A1916', '#E85D3A', '#4D9EFF', '#3DCC7E', '#9B7FFF', '#F5A623', '#D0021B'];

export default function AccountAnalytics() {
  const [accountStats, setAccountStats] = useState<any>(null);
  const [accountTimeseries, setAccountTimeseries] = useState<any[]>([]);
  const [qrPerformance, setQrPerformance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.currentUser) return;

    const fetchStats = async () => {
      try {
        const token = await auth.currentUser.getIdToken();
        const headers = { 'Authorization': `Bearer ${token}` };

        const [stats, timeseries, performance] = await Promise.all([
          fetch(`/api/analytics/account/${auth.currentUser.uid}`, { headers }).then(res => res.json()),
          fetch(`/api/analytics/account/${auth.currentUser.uid}/timeseries?days=30`, { headers }).then(res => res.json()),
          fetch(`/api/analytics/account/${auth.currentUser.uid}/performance`, { headers }).then(res => res.json())
        ]);

        setAccountStats(stats);
        setAccountTimeseries(timeseries);
        setQrPerformance(performance || []);
      } catch (err) {
        console.error("Failed to fetch account analytics", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [auth.currentUser]);

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
            <div className="stat-val">{Math.round((accountStats?.total_scans || 0) / 30).toLocaleString()}</div>
            <span className="stat-change neutral">--</span>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active QR Codes</div>
            <div className="stat-val">{accountStats?.active_qrs || 0}</div>
            <span className="stat-change neutral">{accountStats?.total_qrs || 0} total</span>
          </div>
        </div>

        {/* Line chart */}
        <div className="grid-21 mb16" style={{ gridTemplateColumns: '1fr' }}>
          <div className="card">
            <div className="section-row">
              <span className="section-title">Scan trend — 30 days</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text3)' }}>
                  <span style={{ width: '10px', height: '2px', background: 'var(--coral)', display: 'inline-block', borderRadius: '1px' }}></span>Total
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text3)' }}>
                  <span style={{ width: '10px', height: '2px', background: 'var(--blue)', display: 'inline-block', borderRadius: '1px' }}></span>Unique
                </span>
              </div>
            </div>
            <div style={{ height: '200px', position: 'relative', marginTop: '16px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={accountTimeseries}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => {
                      const d = new Date(val);
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
          )}
        </div>
      </div>
    </div>
  );
}
