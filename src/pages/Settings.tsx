import React, { useState, useEffect } from 'react';
import { auth, logout } from '../firebase';
import { apiFetch } from '../lib/api';
import { User, Shield, CreditCard, LogOut, Mail, Calendar, Crown, ExternalLink } from 'lucide-react';

export default function Settings() {
  const [planInfo, setPlanInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const data = await apiFetch('/api/user/plan');
        setPlanInfo(data);
      } catch (err) {
        console.error('Failed to fetch plan:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPlan();
  }, []);

  const planColors: Record<string, string> = {
    free: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
    pro: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    team: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Manage your account and billing.</p>
      </div>

      {/* Profile */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
        <h2 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
          <User className="w-4 h-4 text-violet-400" />
          Profile
        </h2>
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-white/[0.08] flex items-center justify-center text-xl font-bold text-violet-300 flex-shrink-0">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="w-full h-full rounded-2xl object-cover" />
            ) : (
              user?.displayName?.charAt(0) || user?.email?.charAt(0) || '?'
            )}
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <label className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider">Name</label>
              <p className="text-sm text-white">{user?.displayName || 'Not set'}</p>
            </div>
            <div>
              <label className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider">Email</label>
              <p className="text-sm text-white flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-zinc-500" />
                {user?.email}
              </p>
            </div>
            <div>
              <label className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider">Member since</label>
              <p className="text-sm text-zinc-400 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                {user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'Unknown'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Plan & Billing */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
        <h2 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-violet-400" />
          Plan & Billing
        </h2>

        {loading ? (
          <div className="flex items-center gap-2 py-4">
            <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-zinc-500">Loading plan info...</span>
          </div>
        ) : planInfo ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Current plan</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${planColors[planInfo.plan] || planColors.free}`}>
                    <Crown className="w-3 h-3 mr-1.5" />
                    {planInfo.plan}
                  </span>
                </div>
              </div>
              <a
                href="/pricing"
                className="px-3 py-1.5 rounded-lg bg-violet-500/10 text-xs font-medium text-violet-400 hover:bg-violet-500/20 transition-all"
              >
                {planInfo.plan === 'free' ? 'Upgrade' : 'Change Plan'}
              </a>
            </div>

            <div className="border-t border-white/[0.06] pt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">QR Code Limit</p>
                <p className="text-sm text-white mt-1">
                  {planInfo.limits?.qr_codes === Infinity ? 'Unlimited' : planInfo.limits?.qr_codes || 3}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">Analytics Window</p>
                <p className="text-sm text-white mt-1">{planInfo.limits?.analytics_days || 7} days</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">Custom Domain</p>
                <p className="text-sm text-white mt-1">{planInfo.limits?.custom_domain ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">Logo Embedding</p>
                <p className="text-sm text-white mt-1">{planInfo.limits?.logo ? 'Yes' : 'No'}</p>
              </div>
            </div>

            {planInfo.remaining_qr !== undefined && planInfo.remaining_qr !== null && (
              <div className="border-t border-white/[0.06] pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-zinc-500">QR codes used</p>
                  <p className="text-xs text-zinc-400">
                    {planInfo.limits?.qr_codes === Infinity
                      ? 'Unlimited'
                      : `${planInfo.limits?.qr_codes - planInfo.remaining_qr} / ${planInfo.limits?.qr_codes}`
                    }
                  </p>
                </div>
                {planInfo.limits?.qr_codes !== Infinity && (
                  <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all"
                      style={{ width: `${Math.min(100, ((planInfo.limits?.qr_codes - planInfo.remaining_qr) / planInfo.limits?.qr_codes) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Unable to load plan info.</p>
        )}
      </div>

      {/* Security */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
        <h2 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
          <Shield className="w-4 h-4 text-violet-400" />
          Security
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-300">Authentication method</p>
              <p className="text-xs text-zinc-500 mt-0.5">Signed in with Google</p>
            </div>
            <div className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-semibold text-emerald-400">
              Protected
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl bg-red-500/[0.03] border border-red-500/10 p-6">
        <h2 className="text-sm font-semibold text-red-400 mb-4">Danger Zone</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-300">Sign out</p>
            <p className="text-xs text-zinc-500 mt-0.5">Sign out of your account on this device.</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
