import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import { auth } from '../firebase';

const COLORS = ['#1A1916', '#E85D3A', '#4D9EFF', '#3DCC7E', '#9B7FFF', '#F5A623', '#D0021B'];

export default function Analytics() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<any>(null);
  const [timeseries, setTimeseries] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [browsers, setBrowsers] = useState<any[]>([]);
  const [osData, setOsData] = useState<any[]>([]);
  const [referrers, setReferrers] = useState<any[]>([]);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [advanced, setAdvanced] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          console.log("No user found, waiting...");
          return;
        }

        const token = await user.getIdToken();
        const headers = { 'Authorization': `Bearer ${token}` };

        const [sumRes, tsRes, devRes, ctryRes, browserRes, osRes, refRes, recentRes, advRes] = await Promise.all([
          fetch(`/api/analytics/${slug}/summary`, { headers }).then(r => r.json()),
          fetch(`/api/analytics/${slug}/timeseries?days=30`, { headers }).then(r => r.json()),
          fetch(`/api/analytics/${slug}/devices`, { headers }).then(r => r.json()),
          fetch(`/api/analytics/${slug}/countries`, { headers }).then(r => r.json()),
          fetch(`/api/analytics/${slug}/browsers`, { headers }).then(r => r.json()),
          fetch(`/api/analytics/${slug}/os`, { headers }).then(r => r.json()),
          fetch(`/api/analytics/${slug}/referrers`, { headers }).then(r => r.json()),
          fetch(`/api/analytics/${slug}/recent`, { headers }).then(r => r.json()),
          fetch(`/api/analytics/${slug}/advanced`, { headers }).then(r => r.json()),
        ]);

        setSummary(sumRes);
        setTimeseries(tsRes);
        setDevices(devRes);
        setCountries(ctryRes);
        setBrowsers(browserRes);
        setOsData(osRes);
        setReferrers(refRes);
        setRecentScans(recentRes);
        setAdvanced(advRes);
      } catch (error) {
        console.error("Error fetching analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [slug, auth.currentUser]);

  if (loading) return <div className="flex justify-center items-center h-64">Loading analytics...</div>;
  if (!summary) return <div className="text-center py-12 text-zinc-500">No data available.</div>;

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back</button>
        </div>

        {/* Big stats */}
        <div className="stats-row mb24">
          <div className="stat-card">
            <div className="stat-label">Total scans</div>
            <div className="stat-val">{summary.total_scans?.toLocaleString() || 0}</div>
            <span className="stat-change up">↑ 0%</span>
          </div>
          <div className="stat-card">
            <div className="stat-label">Unique visitors</div>
            <div className="stat-val">{summary.unique_visitors?.toLocaleString() || 0}</div>
            <span className="stat-change up">↑ 0%</span>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avg scans / day</div>
            <div className="stat-val">{Math.round((summary.total_scans || 0) / 30).toLocaleString()}</div>
            <span className="stat-change up">↑ 0%</span>
          </div>
          <div className="stat-card">
            <div className="stat-label">Mobile Scans</div>
            <div className="stat-val">{summary.mobile_pct || 0}%</div>
            <span className="stat-change neutral">--</span>
          </div>
        </div>

        {/* Line chart + Countries */}
        <div className="grid-21 mb16">
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
                <LineChart data={timeseries}>
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
          <div className="card">
            <div className="card-title">Top countries</div>
            <div style={{ height: '200px', marginTop: '16px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={countries} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border)" />
                  <XAxis type="number" stroke="var(--text3)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis dataKey="country" type="category" stroke="var(--text3)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{fill: 'var(--surface2)'}} />
                  <Bar dataKey="scans" name="Total Scans" fill="var(--blue)" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Heatmap + Browsers */}
        <div className="grid-2 mb16">
          <div className="card">
            <div className="section-title mb16">Devices & Referrers</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div className="card-title">Device</div>
                <div style={{ height: '160px', marginTop: '16px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={devices}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={5}
                        dataKey="count"
                        nameKey="device_type"
                      >
                        {devices.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {devices.map((d, i) => (
                    <div key={d.device_type} style={{ display: 'flex', alignItems: 'center', fontSize: '12px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', marginRight: '8px', backgroundColor: COLORS[i % COLORS.length] }} />
                      <span style={{ color: 'var(--text2)', textTransform: 'capitalize' }}>{d.device_type} ({d.pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="card-title">Referrer</div>
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {referrers.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--text3)' }}>No referrer data available.</p>
                  ) : (
                    referrers.slice(0, 5).map((ref, i) => (
                      <div key={ref.referrer} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }} title={ref.referrer}>{ref.referrer}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 500 }}>{ref.count}</span>
                          <span style={{ color: 'var(--text3)', width: '30px', textAlign: 'right' }}>{ref.pct}%</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="section-title mb16">Browser & OS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div className="card-title">Browser</div>
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {browsers.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--text3)' }}>No browser data available.</p>
                  ) : (
                    browsers.slice(0, 5).map((b, i) => (
                      <div key={b.browser} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: COLORS[i % COLORS.length] }}></div>
                          <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }} title={b.browser}>{b.browser}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 500 }}>{b.count}</span>
                          <span style={{ color: 'var(--text3)', width: '30px', textAlign: 'right' }}>{b.pct}%</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="card-title">OS</div>
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {osData.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--text3)' }}>No OS data available.</p>
                  ) : (
                    osData.slice(0, 5).map((os, i) => (
                      <div key={os.os} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: COLORS[(i+3) % COLORS.length] }}></div>
                          <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }} title={os.os}>{os.os}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 500 }}>{os.count}</span>
                          <span style={{ color: 'var(--text3)', width: '30px', textAlign: 'right' }}>{os.pct}%</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Scans Table */}
        <div className="card">
          <div className="section-row">
            <span className="section-title">Recent Scans</span>
          </div>
          <table className="qr-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Location</th>
                <th>Device</th>
                <th>Browser/OS</th>
                <th>Referrer</th>
                <th>Unique</th>
              </tr>
            </thead>
            <tbody>
              {recentScans.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)' }}>
                    No recent scans found.
                  </td>
                </tr>
              ) : (
                recentScans.map((scan) => (
                  <tr key={scan.id}>
                    <td>{new Date(scan.scanned_at).toLocaleString()}</td>
                    <td>{scan.city !== 'Unknown' ? `${scan.city}, ` : ''}{scan.country}</td>
                    <td style={{ textTransform: 'capitalize' }}>{scan.device_type}</td>
                    <td>{scan.browser} / {scan.os}</td>
                    <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scan.referrer}</td>
                    <td>
                      <span className={`status-pill ${scan.is_unique ? 'status-active' : 'status-inactive'}`}>
                        {scan.is_unique ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
