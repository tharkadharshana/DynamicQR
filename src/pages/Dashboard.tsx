import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import {
  Plus, BarChart2, MoreVertical, ExternalLink, Activity, Users, QrCode,
  TrendingUp, Eye, Copy, Check, Power, Pencil
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';

export default function Dashboard() {
  const [qrCodes, setQrCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountStats, setAccountStats] = useState<any>(null);
  const [accountTimeseries, setAccountTimeseries] = useState<any[]>([]);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const token = auth.currentUser.getIdToken();

    token.then(t => {
      fetch('/api/analytics/account/summary', {
        headers: { Authorization: `Bearer ${t}` }
      })
        .then(res => res.json())
        .then(data => setAccountStats(data))
        .catch(err => console.error("Failed to fetch account stats", err));

      fetch('/api/analytics/account/timeseries?days=30', {
        headers: { Authorization: `Bearer ${t}` }
      })
        .then(res => res.json())
        .then(data => setAccountTimeseries(data))
        .catch(err => console.error("Failed to fetch account timeseries", err));
    });

    const q = query(
      collection(db, 'qr_codes'),
      where('user_uid', '==', auth.currentUser.uid),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const codes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setQrCodes(codes);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching QR codes:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth.currentUser]);

  const copySlug = (slug: string) => {
    navigator.clipboard.writeText(`scnr.app/${slug}`);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const toggleQR = async (id: string, currentState: boolean) => {
    const token = await auth.currentUser?.getIdToken();
    await fetch(`/api/qr/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ is_active: !currentState })
    });
    setMenuOpen(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-400 text-sm">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  const statCards = accountStats ? [
    { label: 'Total Scans', value: accountStats.total_scans?.toLocaleString() || '0', icon: Activity, color: 'violet', gradient: 'from-violet-500/20 to-violet-600/5' },
    { label: 'Unique Visitors', value: accountStats.unique_visitors?.toLocaleString() || '0', icon: Users, color: 'emerald', gradient: 'from-emerald-500/20 to-emerald-600/5' },
    { label: 'Active QR Codes', value: `${accountStats.active_qrs || 0}`, sub: `/ ${accountStats.total_qrs || 0} total`, icon: QrCode, color: 'amber', gradient: 'from-amber-500/20 to-amber-600/5' },
  ] : [];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">Overview of your QR codes and scan activity.</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link
            to="/create"
            className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:from-violet-500 hover:to-indigo-500 transition-all"
          >
            <Plus className="-ml-0.5 mr-2 h-4 w-4" />
            Create QR Code
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      {statCards.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${stat.gradient} border border-white/[0.06] p-5`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-zinc-400">{stat.label}</p>
                    <p className="text-3xl font-bold text-white mt-1.5 tracking-tight">
                      {stat.value}
                      {stat.sub && <span className="text-sm text-zinc-500 font-normal ml-1">{stat.sub}</span>}
                    </p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg bg-${stat.color}-500/10 flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 text-${stat.color}-400`} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Scan Chart */}
      {accountTimeseries.length > 0 && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-white">Scans over time</h3>
            <span className="text-xs text-zinc-500">Last 30 days</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={accountTimeseries}>
                <defs>
                  <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradUnique" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(val) => {
                    const d = new Date(val);
                    return `${d.getMonth()+1}/${d.getDate()}`;
                  }}
                  stroke="#52525b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: '#a1a1aa' }}
                />
                <Area type="monotone" dataKey="total_scans" name="Total" stroke="#8b5cf6" strokeWidth={2} fill="url(#gradTotal)" dot={false} />
                <Area type="monotone" dataKey="unique_scans" name="Unique" stroke="#10b981" strokeWidth={2} fill="url(#gradUnique)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* QR Codes List */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white">Your QR Codes</h2>
        <span className="text-xs text-zinc-500">{qrCodes.length} total</span>
      </div>

      {qrCodes.length === 0 ? (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] border-dashed p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
            <QrCode className="w-7 h-7 text-violet-400" />
          </div>
          <h3 className="text-white font-semibold mb-1">No QR codes yet</h3>
          <p className="text-sm text-zinc-500 mb-5">Create your first dynamic QR code to get started.</p>
          <Link
            to="/create"
            className="inline-flex items-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create QR Code
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {qrCodes.map((qr) => (
            <div
              key={qr.id}
              className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 hover:bg-white/[0.05] transition-all group"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <p className="text-sm font-semibold text-white truncate">{qr.title}</p>
                    {qr.is_active ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <a href={qr.destination_url} target="_blank" rel="noreferrer" className="truncate max-w-[300px] hover:text-zinc-300 transition-colors flex items-center gap-1">
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      {qr.destination_url}
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => copySlug(qr.slug)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-xs font-mono text-zinc-300 hover:bg-white/[0.1] transition-all"
                    title="Copy short URL"
                  >
                    {copiedSlug === qr.slug ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    scnr.app/{qr.slug}
                  </button>
                  <Link
                    to={`/analytics/${qr.slug}`}
                    className="p-2 rounded-lg text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 transition-all"
                    title="Analytics"
                  >
                    <BarChart2 className="h-4 w-4" />
                  </Link>
                  <Link
                    to={`/edit/${qr.id}`}
                    className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-all"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => toggleQR(qr.id, qr.is_active)}
                    className={`p-2 rounded-lg transition-all ${
                      qr.is_active
                        ? 'text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10'
                        : 'text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10'
                    }`}
                    title={qr.is_active ? 'Deactivate' : 'Activate'}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
