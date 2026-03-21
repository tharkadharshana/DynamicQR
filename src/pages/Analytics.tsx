import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Users, Smartphone, Globe, Calendar, Link as LinkIcon,
  Clock, TrendingUp, TrendingDown, Minus, BarChart3, AlertCircle
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area
} from 'recharts';
import { apiFetch, formatNumber, clampPct } from '../lib/api';

const COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#a855f7'];
const COUNTRY_FLAGS: Record<string, string> = {
  US: '🇺🇸', LK: '🇱🇰', GB: '🇬🇧', DE: '🇩🇪', FR: '🇫🇷', JP: '🇯🇵', IN: '🇮🇳',
  AU: '🇦🇺', CA: '🇨🇦', SG: '🇸🇬', AE: '🇦🇪', NL: '🇳🇱', IT: '🇮🇹', ES: '🇪🇸',
  BR: '🇧🇷', KR: '🇰🇷', SE: '🇸🇪', CH: '🇨🇭', Unknown: '🌍'
};

export default function Analytics() {
  const { slug } = useParams();
  const [summary, setSummary] = useState<any>(null);
  const [timeseries, setTimeseries] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [browsers, setBrowsers] = useState<any[]>([]);
  const [osData, setOsData] = useState<any[]>([]);
  const [referrers, setReferrers] = useState<any[]>([]);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [peakHours, setPeakHours] = useState<any[]>([]);
  const [velocity, setVelocity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState(30);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setError(null);
        const [sumRes, tsRes, devRes, ctryRes, browserRes, osRes, refRes, recentRes, hoursRes, velRes] = await Promise.all([
          apiFetch(`/api/analytics/${slug}/summary`),
          apiFetch(`/api/analytics/${slug}/timeseries?days=${selectedDays}`),
          apiFetch(`/api/analytics/${slug}/devices`),
          apiFetch(`/api/analytics/${slug}/countries`),
          apiFetch(`/api/analytics/${slug}/browsers`),
          apiFetch(`/api/analytics/${slug}/os`),
          apiFetch(`/api/analytics/${slug}/referrers`),
          apiFetch(`/api/analytics/${slug}/recent`),
          apiFetch(`/api/analytics/${slug}/hours`),
          apiFetch(`/api/analytics/${slug}/velocity`),
        ]);

        setSummary(sumRes);
        setTimeseries(tsRes);
        setDevices(devRes);
        setCountries(ctryRes);
        setBrowsers(browserRes);
        setOsData(osRes);
        setReferrers(refRes);
        setRecentScans(recentRes);
        setPeakHours(hoursRes);
        setVelocity(velRes);
      } catch (err: any) {
        setError(err.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [slug, selectedDays]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-400 text-sm">Loading analytics...</span>
        </div>
      </div>
    );
  }

  if (!summary) return <div className="text-center py-12 text-zinc-500">No data available.</div>;

  const VelocityIcon = velocity?.velocity > 0 ? TrendingUp : velocity?.velocity < 0 ? TrendingDown : Minus;
  const velocityColor = velocity?.velocity > 0 ? 'text-emerald-400' : velocity?.velocity < 0 ? 'text-red-400' : 'text-zinc-400';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">Analytics — {slug}</h1>
            <p className="text-xs text-zinc-500 mt-0.5">scnr.app/{slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setSelectedDays(d)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                selectedDays === d
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Scans', value: summary.total_scans, icon: BarChart3, color: 'violet' },
          { label: 'Unique Visitors', value: summary.unique_visitors, icon: Users, color: 'indigo' },
          { label: 'Mobile %', value: `${summary.mobile_pct}%`, icon: Smartphone, color: 'emerald' },
          { label: 'Today', value: velocity?.today || 0, icon: Calendar, color: 'amber' },
          { label: 'Velocity', value: `${velocity?.velocity > 0 ? '+' : ''}${velocity?.velocity || 0}%`, icon: VelocityIcon, color: velocity?.velocity > 0 ? 'emerald' : velocity?.velocity < 0 ? 'red' : 'zinc' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">{stat.label}</span>
                <Icon className={`w-4 h-4 text-${stat.color}-400`} />
              </div>
              <p className="text-2xl font-bold text-white tracking-tight">{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Time Series */}
        <div className="lg:col-span-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
          <h3 className="text-sm font-semibold text-white mb-5">Scans over time</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeseries}>
                <defs>
                  <linearGradient id="gradTotal2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradUnique2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tickFormatter={v => { const d = new Date(v); return `${d.getMonth()+1}/${d.getDate()}`; }} stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', fontSize: '12px' }} labelStyle={{ color: '#a1a1aa' }} />
                <Area type="monotone" dataKey="total_scans" name="Total" stroke="#8b5cf6" strokeWidth={2} fill="url(#gradTotal2)" dot={false} />
                <Area type="monotone" dataKey="unique_scans" name="Unique" stroke="#10b981" strokeWidth={2} fill="url(#gradUnique2)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Device Breakdown */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
          <h3 className="text-sm font-semibold text-white mb-5">Devices</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={devices} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="count" nameKey="device_type" stroke="none">
                  {devices.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-1.5">
            {devices.map((d, i) => (
              <div key={d.device_type} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-zinc-300 capitalize">{d.device_type}</span>
                </div>
                <span className="text-zinc-500">{d.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Countries */}
        <div className="lg:col-span-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
          <h3 className="text-sm font-semibold text-white mb-5">Top Countries</h3>
          <div className="space-y-2.5">
            {countries.length === 0 ? (
              <p className="text-sm text-zinc-500">No location data yet.</p>
            ) : (
              countries.map((c, i) => {
                const maxScans = countries[0]?.scans || 1;
                return (
                  <div key={c.country} className="flex items-center gap-3">
                    <span className="text-base w-6 text-center">{COUNTRY_FLAGS[c.country] || '🌍'}</span>
                    <span className="text-xs text-zinc-300 w-20 truncate">{c.country}</span>
                    <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
                        style={{ width: `${(c.scans / maxScans * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-zinc-400 w-12 text-right font-mono">{c.scans}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Referrers */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
          <h3 className="text-sm font-semibold text-white mb-5">Referrers</h3>
          <div className="space-y-3">
            {referrers.length === 0 ? (
              <p className="text-sm text-zinc-500">No referrer data yet.</p>
            ) : (
              referrers.map(ref => (
                <div key={ref.referrer} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <LinkIcon className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
                    <span className="text-xs text-zinc-300 truncate">{ref.referrer}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-xs font-medium text-zinc-200">{ref.count}</span>
                    <span className="text-[10px] text-zinc-500">{ref.pct}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Peak Hours Heatmap */}
        <div className="lg:col-span-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
          <h3 className="text-sm font-semibold text-white mb-5">Peak Hours</h3>
          <div className="grid grid-cols-12 gap-1">
            {peakHours.map(h => {
              const maxScans = Math.max(...peakHours.map(x => x.scans), 1);
              const intensity = h.scans / maxScans;
              return (
                <div key={h.hour} className="text-center">
                  <div
                    className="w-full aspect-square rounded-md transition-colors"
                    style={{
                      backgroundColor: intensity > 0
                        ? `rgba(139, 92, 246, ${0.1 + intensity * 0.8})`
                        : 'rgba(255,255,255,0.02)'
                    }}
                    title={`${h.hour}:00 — ${h.scans} scans`}
                  />
                  <span className="text-[9px] text-zinc-600 mt-0.5 block">{h.hour}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-end gap-2 mt-3">
            <span className="text-[10px] text-zinc-600">Less</span>
            <div className="flex gap-0.5">
              {[0.1, 0.3, 0.5, 0.7, 0.9].map(o => (
                <div key={o} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `rgba(139, 92, 246, ${o})` }} />
              ))}
            </div>
            <span className="text-[10px] text-zinc-600">More</span>
          </div>
        </div>

        {/* Browser Breakdown */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
          <h3 className="text-sm font-semibold text-white mb-5">Browsers</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={browsers} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="count" nameKey="browser" stroke="none">
                  {browsers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-1.5">
            {browsers.map((b, i) => (
              <div key={b.browser} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-zinc-300">{b.browser}</span>
                </div>
                <span className="text-zinc-500">{b.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* OS Breakdown */}
        <div className="lg:col-span-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
          <h3 className="text-sm font-semibold text-white mb-5">Operating Systems</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={osData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="os" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff', fontSize: '12px' }} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                <Bar dataKey="count" name="Scans" fill="#10b981" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Scans */}
        <div className="lg:col-span-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
          <h3 className="text-sm font-semibold text-white mb-5">Recent Scans</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Time', 'Location', 'Device', 'Browser / OS', 'Unique'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {recentScans.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-zinc-600">No scans recorded yet.</td>
                  </tr>
                ) : (
                  recentScans.map((scan) => (
                    <tr key={scan.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-xs text-zinc-300">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-zinc-600" />
                          {new Date(scan.scanned_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400">
                        {COUNTRY_FLAGS[scan.country] || '🌍'} {scan.city !== 'Unknown' ? `${scan.city}, ` : ''}{scan.country}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400 capitalize">{scan.device_type}</td>
                      <td className="px-4 py-3 text-xs text-zinc-400">{scan.browser} / {scan.os}</td>
                      <td className="px-4 py-3">
                        {scan.is_unique ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">Yes</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-500/10 text-zinc-500">No</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
