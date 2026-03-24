import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, formatNumber } from '../lib/api';
import { Loader2, Trash2, ArrowUpRight } from 'lucide-react';
import {
  PLANS, ADDONS, getPlan, getAddon, formatLimit, formatBytes, isUnlimited,
  type PlanId, type ActiveAddon,
} from '../shared/plans';

interface PlanData {
  plan: PlanId;
  plan_name: string;
  price_usd: number;
  cycle: string;
  limits: any;
  base_limits: any;
  features: any;
  addons: ActiveAddon[];
  usage: {
    active_qr_codes: number;
    total_qr_codes: number;
    scans_this_month: number;
    storage_bytes: number;
  };
  cancel_at_period_end: boolean;
  billing_cycle_end: string | null;
}

interface Invoice {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  created_at: any;
}

export default function Billing() {
  const navigate = useNavigate();
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [plan, invs] = await Promise.all([
          apiFetch('/api/user/plan'),
          apiFetch('/api/billing/invoices').catch(() => []),
        ]);
        setPlanData(plan);
        setInvoices(Array.isArray(invs) ? invs : []);
      } catch (err) {
        console.error('Failed to fetch billing data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleRemoveAddon = async (addonId: string) => {
    if (!window.confirm('Remove this add-on? Your limits will decrease.')) return;
    setActionLoading(`remove_${addonId}`);
    try {
      await apiFetch(`/api/billing/addon/${addonId}`, { method: 'DELETE' });
      // Refresh data
      const plan = await apiFetch('/api/user/plan');
      setPlanData(plan);
    } catch (err) {
      console.error('Failed to remove addon:', err);
      alert('Failed to remove add-on');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel your subscription? Your plan stays active until the end of the current billing period.')) return;
    setActionLoading('cancel');
    try {
      await apiFetch('/api/billing/cancel', { method: 'POST' });
      const plan = await apiFetch('/api/user/plan');
      setPlanData(plan);
    } catch (err) {
      console.error('Cancel error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDowngrade = async () => {
    if (!window.confirm('Downgrade to Free immediately? You will lose access to paid features and your add-ons.')) return;
    setActionLoading('downgrade');
    try {
      await apiFetch('/api/billing/downgrade-free', { method: 'POST' });
      const plan = await apiFetch('/api/user/plan');
      setPlanData(plan);
    } catch (err) {
      console.error('Downgrade error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
        <div className="page active" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      </div>
    );
  }

  if (!planData) return null;
  const { plan, plan_name, price_usd, limits, usage, addons, features, cancel_at_period_end, billing_cycle_end } = planData;
  const planConfig = getPlan(plan);

  const usagePct = (val: number, max: number) => {
    if (max === -1) return 100; // unlimited shows full
    if (max === 0) return 0;
    return Math.min(100, Math.round((val / max) * 100));
  };

  const usageColor = (val: number, max: number) => {
    if (max === -1) return 'var(--green)';
    const pct = (val / max) * 100;
    if (pct >= 90) return 'var(--red)';
    if (pct >= 70) return 'var(--amber)';
    return 'var(--coral)';
  };

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">
        {/* Hero: current plan */}
        <div className="billing-hero">
          <div className="billing-hero-left">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span className="chip" style={{ background: plan === 'free' ? 'var(--surface3)' : 'var(--amber-l)', color: plan === 'free' ? 'var(--text3)' : 'var(--amber)', fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: 700 }}>
                ⭐ {plan_name} Plan
              </span>
              <span className="chip" style={{ background: cancel_at_period_end ? 'var(--red-l)' : 'var(--green-l)', color: cancel_at_period_end ? 'var(--red)' : 'var(--green)', fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: 600 }}>
                {cancel_at_period_end ? '● Cancelling' : '● Active'}
              </span>
            </div>
            <div className="billing-plan-name">{plan_name} — ${price_usd}{price_usd > 0 ? ' / month' : ''}</div>
            <div className="billing-plan-desc">
              {formatLimit(limits.max_qr_codes)} QR codes · {formatLimit(limits.max_scans_per_month)} scans/mo · {limits.analytics_days}-day analytics
            </div>
            {billing_cycle_end && (
              <div className="billing-next">
                <span className="billing-next-dot"></span>
                {cancel_at_period_end ? 'Expires: ' : 'Next billing: '}
                <strong style={{ color: 'var(--text)' }}>{new Date(billing_cycle_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" onClick={() => navigate('/pricing')}>
              {plan === 'free' ? 'Upgrade →' : 'Change plan →'}
            </button>
            {plan !== 'free' && !cancel_at_period_end && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--text3)', fontSize: '11px' }}
                onClick={handleCancel}
                disabled={actionLoading === 'cancel'}
              >
                {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel subscription'}
              </button>
            )}
            {plan !== 'free' && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--red)', fontSize: '11px' }}
                onClick={handleDowngrade}
                disabled={actionLoading === 'downgrade'}
              >
                {actionLoading === 'downgrade' ? 'Downgrading...' : 'Downgrade to Free now'}
              </button>
            )}
          </div>
        </div>

        {/* Usage this cycle */}
        <div className="section-row mb16">
          <span className="section-title">Current usage</span>
        </div>
        <div className="usage-grid mb24">
          <div className="usage-card">
            <div className="usage-icon">📡</div>
            <div className="usage-label">Scans this month</div>
            <div className="usage-val">{formatNumber(usage.scans_this_month)}</div>
            <div className="usage-sub">
              {isUnlimited(limits.max_scans_per_month) ? 'Unlimited' : `of ${formatLimit(limits.max_scans_per_month)}`}
            </div>
            <div className="progress-bar" style={{ marginTop: '8px' }}>
              <div className="progress-fill" style={{
                width: `${usagePct(usage.scans_this_month, limits.max_scans_per_month)}%`,
                background: usageColor(usage.scans_this_month, limits.max_scans_per_month),
              }}></div>
            </div>
          </div>
          <div className="usage-card">
            <div className="usage-icon">🔳</div>
            <div className="usage-label">Active QR codes</div>
            <div className="usage-val">{usage.active_qr_codes}</div>
            <div className="usage-sub">
              {isUnlimited(limits.max_qr_codes) ? 'Unlimited' : `of ${formatLimit(limits.max_qr_codes)}`}
            </div>
            <div className="progress-bar" style={{ marginTop: '8px' }}>
              <div className="progress-fill" style={{
                width: `${usagePct(usage.active_qr_codes, limits.max_qr_codes)}%`,
                background: usageColor(usage.active_qr_codes, limits.max_qr_codes),
              }}></div>
            </div>
          </div>
          <div className="usage-card">
            <div className="usage-icon">💾</div>
            <div className="usage-label">Storage used</div>
            <div className="usage-val">{formatBytes(usage.storage_bytes)}</div>
            <div className="usage-sub">
              of {formatBytes(limits.max_storage_bytes)}
            </div>
            <div className="progress-bar" style={{ marginTop: '8px' }}>
              <div className="progress-fill" style={{
                width: `${usagePct(usage.storage_bytes, limits.max_storage_bytes)}%`,
                background: 'var(--purple)',
              }}></div>
            </div>
          </div>
        </div>

        {/* Active Add-ons */}
        {addons.length > 0 && (
          <>
            <div className="section-row mb16">
              <span className="section-title">Active add-ons</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/pricing')}>+ Buy more</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              {addons.map((a, i) => {
                const addon = getAddon(a.addon_id);
                if (!addon) return null;
                return (
                  <div key={`${a.addon_id}_${i}`} className="card card-sm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{addon.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                        ${addon.price_usd * a.quantity}/mo · x{a.quantity}
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--red)', padding: '4px 8px' }}
                      onClick={() => handleRemoveAddon(a.addon_id)}
                      disabled={actionLoading === `remove_${a.addon_id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Invoice history */}
        <div className="card">
          <div className="section-row">
            <span className="section-title">Invoice history</span>
          </div>
          {invoices.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
              No invoices yet. Invoices will appear here after your first payment.
            </div>
          ) : (
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text)' }}>{inv.order_id?.slice(0, 20)}</span></td>
                    <td style={{ color: 'var(--text2)' }}>
                      {inv.created_at?._seconds
                        ? new Date(inv.created_at._seconds * 1000).toLocaleDateString()
                        : inv.created_at
                        ? new Date(inv.created_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td style={{ color: 'var(--text2)', fontSize: '12px' }}>{inv.description}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text)' }}>${inv.amount?.toFixed(2)}</td>
                    <td>
                      <span className={`invoice-status ${inv.status === 'paid' ? 'inv-paid' : inv.status === 'pending' ? 'inv-pending' : 'inv-failed'}`}>
                        {inv.status === 'paid' ? '● Paid' : inv.status === 'pending' ? '● Pending' : '✕ Failed'}
                      </span>
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
