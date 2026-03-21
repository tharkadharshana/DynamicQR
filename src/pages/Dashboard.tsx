import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Plus, BarChart2, MoreVertical, ExternalLink, Activity, Users, QrCode } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

export default function Dashboard() {
  const [qrCodes, setQrCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountStats, setAccountStats] = useState<any>(null);
  const [accountTimeseries, setAccountTimeseries] = useState<any[]>([]);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Fetch account stats
    fetch(`/api/analytics/account/${auth.currentUser.uid}`)
      .then(res => res.json())
      .then(data => setAccountStats(data))
      .catch(err => console.error("Failed to fetch account stats", err));

    // Fetch account timeseries
    fetch(`/api/analytics/account/${auth.currentUser.uid}/timeseries?days=30`)
      .then(res => res.json())
      .then(data => setAccountTimeseries(data))
      .catch(err => console.error("Failed to fetch account timeseries", err));

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

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Overview of your QR codes and scan activity.
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link
            to="/create"
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
          >
            <Plus className="-ml-1 mr-2 h-5 w-5" />
            Create QR Code
          </Link>
        </div>
      </div>

      {/* Account Stats */}
      {accountStats && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Activity className="h-6 w-6 text-indigo-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-zinc-500 truncate">Total Scans</dt>
                    <dd className="text-3xl font-semibold text-zinc-900">{accountStats.total_scans}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Users className="h-6 w-6 text-emerald-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-zinc-500 truncate">Unique Visitors</dt>
                    <dd className="text-3xl font-semibold text-zinc-900">{accountStats.unique_visitors}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <QrCode className="h-6 w-6 text-amber-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-zinc-500 truncate">Active QR Codes</dt>
                    <dd className="text-3xl font-semibold text-zinc-900">{accountStats.active_qrs} <span className="text-sm text-zinc-500 font-normal">/ {accountStats.total_qrs}</span></dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Timeseries */}
      {accountTimeseries.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <h3 className="text-lg font-medium text-zinc-900 mb-6">Scans over time (All QR Codes)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={accountTimeseries}>
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
      )}

      <h2 className="text-lg font-medium text-zinc-900 mb-4">Your QR Codes</h2>
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul role="list" className="divide-y divide-zinc-200">
          {qrCodes.length === 0 ? (
            <li className="px-6 py-12 text-center text-zinc-500">
              No QR codes found. Create one to get started!
            </li>
          ) : (
            qrCodes.map((qr) => (
              <li key={qr.id}>
                <div className="px-4 py-4 sm:px-6 hover:bg-zinc-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <p className="text-sm font-medium text-indigo-600 truncate">{qr.title}</p>
                      <div className="mt-2 flex items-center text-sm text-zinc-500">
                        <ExternalLink className="flex-shrink-0 mr-1.5 h-4 w-4 text-zinc-400" />
                        <a href={qr.destination_url} target="_blank" rel="noreferrer" className="truncate max-w-xs hover:underline">
                          {qr.destination_url}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="flex flex-col items-end">
                        <p className="text-sm text-zinc-900 font-medium">qik.app/{qr.slug}</p>
                        <p className="mt-1 flex items-center text-sm text-zinc-500">
                          {qr.is_active ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-800">
                              Inactive
                            </span>
                          )}
                        </p>
                      </div>
                      <Link
                        to={`/analytics/${qr.slug}`}
                        className="p-2 text-zinc-400 hover:text-indigo-600 transition-colors"
                        title="Analytics"
                      >
                        <BarChart2 className="h-5 w-5" />
                      </Link>
                      <Link
                        to={`/edit/${qr.id}`}
                        className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors"
                      >
                        <MoreVertical className="h-5 w-5" />
                      </Link>
                    </div>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
