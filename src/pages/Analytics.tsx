import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Users, Smartphone, Globe, Calendar } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function Analytics() {
  const { slug } = useParams();
  const [summary, setSummary] = useState<any>(null);
  const [timeseries, setTimeseries] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const [sumRes, tsRes, devRes, ctryRes] = await Promise.all([
          fetch(`/api/analytics/${slug}/summary`).then(r => r.json()),
          fetch(`/api/analytics/${slug}/timeseries?days=30`).then(r => r.json()),
          fetch(`/api/analytics/${slug}/devices`).then(r => r.json()),
          fetch(`/api/analytics/${slug}/countries`).then(r => r.json()),
        ]);

        setSummary(sumRes);
        setTimeseries(tsRes);
        setDevices(devRes);
        setCountries(ctryRes);
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
        <div className="lg:col-span-3 bg-white shadow rounded-lg p-6">
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
      </div>
    </div>
  );
}
