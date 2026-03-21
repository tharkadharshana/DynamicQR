import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Users, Smartphone, Globe, Calendar, Link as LinkIcon, Clock } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const [sumRes, tsRes, devRes, ctryRes, browserRes, osRes, refRes, recentRes] = await Promise.all([
          fetch(`/api/analytics/${slug}/summary`).then(r => r.json()),
          fetch(`/api/analytics/${slug}/timeseries?days=30`).then(r => r.json()),
          fetch(`/api/analytics/${slug}/devices`).then(r => r.json()),
          fetch(`/api/analytics/${slug}/countries`).then(r => r.json()),
          fetch(`/api/analytics/${slug}/browsers`).then(r => r.json()),
          fetch(`/api/analytics/${slug}/os`).then(r => r.json()),
          fetch(`/api/analytics/${slug}/referrers`).then(r => r.json()),
          fetch(`/api/analytics/${slug}/recent`).then(r => r.json()),
        ]);

        setSummary(sumRes);
        setTimeseries(tsRes);
        setDevices(devRes);
        setCountries(ctryRes);
        setBrowsers(browserRes);
        setOsData(osRes);
        setReferrers(refRes);
        setRecentScans(recentRes);
      } catch (error) {
        console.error("Error fetching analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [slug]);

  if (loading) return <div className="flex justify-center items-center h-64">Loading analytics...</div>;
  if (!summary) return <div className="text-center py-12 text-zinc-500">No data available.</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/" className="text-zinc-400 hover:text-zinc-600">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Analytics for {slug}</h1>
            <p className="text-sm text-zinc-500">Last 30 days</p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Users className="h-6 w-6 text-zinc-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-zinc-500 truncate">Total Scans</dt>
                  <dd className="text-3xl font-semibold text-zinc-900">{summary.total_scans}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Users className="h-6 w-6 text-indigo-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-zinc-500 truncate">Unique Visitors</dt>
                  <dd className="text-3xl font-semibold text-zinc-900">{summary.unique_visitors}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Smartphone className="h-6 w-6 text-emerald-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-zinc-500 truncate">Mobile Scans</dt>
                  <dd className="text-3xl font-semibold text-zinc-900">{summary.mobile_pct}%</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Calendar className="h-6 w-6 text-amber-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-zinc-500 truncate">First Scan</dt>
                  <dd className="text-sm font-semibold text-zinc-900 mt-1">
                    {summary.first_scan ? new Date(summary.first_scan).toLocaleDateString() : 'N/A'}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Time Series */}
        <div className="lg:col-span-2 bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-zinc-900 mb-6">Scans over time</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeseries}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => {
                    const d = new Date(val);
                    return `${d.getMonth()+1}/${d.getDate()}`;
                  }}
                  stroke="#a1a1aa"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#a1a1aa" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  allowDecimals={false}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="total_scans" name="Total" stroke="#4f46e5" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="unique_scans" name="Unique" stroke="#10b981" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Device Breakdown */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-zinc-900 mb-6">Devices</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={devices}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
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
          <div className="mt-4 grid grid-cols-2 gap-4">
            {devices.map((d, i) => (
              <div key={d.device_type} className="flex items-center">
                <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-sm text-zinc-600 capitalize">{d.device_type} ({d.pct}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Countries */}
        <div className="lg:col-span-2 bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-zinc-900 mb-6">Top Countries</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={countries} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e4e4e7" />
                <XAxis type="number" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis dataKey="country" type="category" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: '#f4f4f5'}} />
                <Bar dataKey="scans" name="Total Scans" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Referrers */}
        <div className="lg:col-span-1 bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-zinc-900 mb-6">Top Referrers</h3>
          <div className="space-y-4">
            {referrers.length === 0 ? (
              <p className="text-sm text-zinc-500">No referrer data available.</p>
            ) : (
              referrers.map((ref, i) => (
                <div key={ref.referrer} className="flex items-center justify-between">
                  <div className="flex items-center overflow-hidden">
                    <LinkIcon className="h-4 w-4 text-zinc-400 mr-2 flex-shrink-0" />
                    <span className="text-sm text-zinc-700 truncate" title={ref.referrer}>{ref.referrer}</span>
                  </div>
                  <div className="flex items-center ml-4">
                    <span className="text-sm font-medium text-zinc-900">{ref.count}</span>
                    <span className="text-xs text-zinc-500 ml-2 w-8 text-right">{ref.pct}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Browser Breakdown */}
        <div className="lg:col-span-1 bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-zinc-900 mb-6">Browsers</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={browsers}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="count"
                  nameKey="browser"
                >
                  {browsers.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 max-h-32 overflow-y-auto">
            {browsers.map((b, i) => (
              <div key={b.browser} className="flex items-center">
                <div className="w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-sm text-zinc-600 truncate" title={b.browser}>{b.browser} ({b.pct}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* OS Breakdown */}
        <div className="lg:col-span-2 bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-zinc-900 mb-6">Operating Systems</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={osData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                <XAxis dataKey="os" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{fill: '#f4f4f5'}} />
                <Bar dataKey="count" name="Total Scans" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Scans Table */}
        <div className="lg:col-span-3 bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-zinc-900 mb-6">Recent Scans</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 bg-zinc-50 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Time</th>
                  <th className="px-6 py-3 bg-zinc-50 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 bg-zinc-50 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Device</th>
                  <th className="px-6 py-3 bg-zinc-50 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Browser/OS</th>
                  <th className="px-6 py-3 bg-zinc-50 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Referrer</th>
                  <th className="px-6 py-3 bg-zinc-50 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Unique</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-zinc-200">
                {recentScans.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-sm text-zinc-500">
                      No recent scans found.
                    </td>
                  </tr>
                ) : (
                  recentScans.map((scan) => (
                    <tr key={scan.id} className="hover:bg-zinc-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 text-zinc-400 mr-2" />
                          {new Date(scan.scanned_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {scan.city !== 'Unknown' ? `${scan.city}, ` : ''}{scan.country}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 capitalize">
                        {scan.device_type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {scan.browser} / {scan.os}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 truncate max-w-xs">
                        {scan.referrer}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {scan.is_unique ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-800">
                            No
                          </span>
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
