import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../supabase';
import { apiFetch } from '../lib/api';
import { useUI } from '../shared/UIContext';
import { formatPrice, planFeatures, PLANS, PAID_PLANS, Currency, PlanId, PaidPlan, PlanLimits } from '../lib/plans';
import { startCheckout } from '../lib/checkout';
import { SITE, waLink } from '../lib/site';

const ORDER: PlanId[] = ['free', ...PAID_PLANS];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ROWS: [string, keyof PlanLimits][] = [
  ['QR codes in total', 'qr_codes'], ['Dynamic codes', 'dynamic_qr_codes'], ['Short links', 'short_links'], ['Pages', 'pages'], ['Forms', 'forms'],
  ['Scans per month', 'monthly_scans'], ['History (days)', 'analytics_days'], ['Custom domains', 'custom_domains'], ['Seats', 'seats'],
];

export default function Billing() {
  const { planData } = useOutletContext<{ planData: any }>();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [isAnnual, setIsAnnual] = useState(false);
  const [currency, setCurrency] = useState<Currency>('LKR');
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [planTimeout, setPlanTimeout] = useState(false);
  const { showToast } = useUI();

  useEffect(() => {
    if (!planData) {
      const t = setTimeout(() => setPlanTimeout(true), 4000);
      return () => clearTimeout(t);
    }
  }, [planData]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null);
    });

    apiFetch('/api/billing/invoices')
      .then(data => {
        setInvoices(data);
        setLoadingInvoices(false);
      })
      .catch(err => {
        console.error("Failed to load invoices", err);
        setInvoices([]);
        setLoadingInvoices(false);
      });
  }, []);

  if (!planData) {
    return (
      <div className="content" style={{ padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', height: '100%' }}>
        {planTimeout ? (
          <>
            <p style={{ color: 'var(--text3)' }}>Failed to load plan data.</p>
            <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>Reload</button>
          </>
        ) : (
          <p style={{ color: 'var(--text3)' }}>Loading...</p>
        )}
      </div>
    );
  }

  const { plan, plan_expires_at, monthly_scans_used, limits, is_trial, is_expired, plan_since, email } = planData;
  const trialEnded = plan === 'free' && !is_trial && !is_expired;
  // LKR → PayHere; USD → Polar card checkout (or PayHere in USD when Polar is off).
  const cur: Currency = currency;
  const expiryDate = plan_expires_at ? new Date(plan_expires_at).toLocaleDateString() : 'N/A';
  const planSince = plan_since
    ? new Date(plan_since).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';
  const billingEmail = email || userEmail || '—';

  const handleCheckout = async (targetPlan: PaidPlan) => {
    try {
      await startCheckout(targetPlan, isAnnual ? 'annual' : 'monthly', cur, planData);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to start checkout');
    }
  };

  const nextPlan = ORDER[ORDER.indexOf(plan) + 1] as PaidPlan | undefined;  // undefined on business
  const scanLimit = limits.monthly_scans;
  const scanPct = Math.min(100, (monthly_scans_used / scanLimit) * 100);
  const isUnlimitedQr = planData.limits.qr_codes === -1;
  const qrUsed = isUnlimitedQr ? planData.total_qrs : (planData.limits.qr_codes - planData.remaining_qr);
  const qrPct = isUnlimitedQr ? 0 : Math.min(100, (qrUsed / planData.limits.qr_codes) * 100);

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">

        {/* Trial ended callout — shown prominently at top of billing page */}
        {trialEnded && (
          <div style={{
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid var(--amber, #f59e0b)',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--amber, #f59e0b)', fontSize: '14px', marginBottom: '4px' }}>
                Your free trial has ended
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text3)' }}>
                You're now on the free plan — dynamic QR codes, password protection, expiry dates, and advanced analytics are locked. Upgrade to Pro to restore full access.
              </div>
            </div>
            <button
              className="btn btn-primary btn-sm"
              style={{ flexShrink: 0 }}
              onClick={() => document.getElementById('upgrade-section')?.scrollIntoView({ behavior: 'smooth' })}
            >
              See upgrade options ↓
            </button>
          </div>
        )}

        {is_expired && (
          <div style={{
            background: 'var(--red-l, rgba(239,68,68,0.08))',
            border: '1px solid var(--red, #ef4444)',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
          }}>
            <div style={{ fontWeight: 700, color: 'var(--red, #ef4444)', fontSize: '14px', marginBottom: '4px' }}>
              Your subscription has expired
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text3)' }}>
              Your Pro or Team subscription lapsed and you've been moved to the free plan. Renew below to restore access.
            </div>
          </div>
        )}

        {/* Billing Cycle + currency toggles */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <div style={{ background: 'var(--surface2)', padding: '4px', borderRadius: '30px', display: 'flex', gap: '4px', border: '1px solid var(--border)' }}>
            {(['LKR', 'USD'] as Currency[]).map(c => (
              <button key={c} onClick={() => setCurrency(c)} aria-pressed={currency === c}
                style={{ padding: '8px 16px', borderRadius: '26px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  background: currency === c ? 'white' : 'transparent', color: currency === c ? '#111' : 'var(--text3)' }}>
                {c === 'LKR' ? 'LKR · PayHere' : 'USD · card'}
              </button>
            ))}
          </div>
          <div style={{ background: 'var(--surface2)', padding: '4px', borderRadius: '30px', display: 'flex', gap: '4px', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setIsAnnual(false)}
              style={{
                padding: '8px 20px', borderRadius: '26px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                background: !isAnnual ? 'white' : 'transparent', color: !isAnnual ? '#111' : 'var(--text3)',
                boxShadow: !isAnnual ? '0 2px 8px rgba(0,0,0,0.05)' : 'none'
              }}
            >Monthly</button>
            <button
              onClick={() => setIsAnnual(true)}
              style={{
                padding: '8px 20px', borderRadius: '26px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                background: isAnnual ? 'white' : 'transparent', color: isAnnual ? '#111' : 'var(--text3)',
                boxShadow: isAnnual ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              Annual <span style={{ background: 'var(--green-l)', color: 'var(--green)', fontSize: '10px', padding: '2px 6px', borderRadius: '10px' }}>Save 17%</span>
            </button>
          </div>
        </div>

        {/* Hero: current plan */}
        <div className="billing-hero">
          <div className="billing-hero-left">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span className="chip" style={{ background: 'var(--amber-l)', color: 'var(--amber)', fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: 700 }}>
                ⭐ {plan.charAt(0).toUpperCase() + plan.slice(1)} Plan
              </span>
              <span style={{
                background: is_expired ? 'var(--red-l, rgba(239,68,68,0.1))' : trialEnded ? 'rgba(245,158,11,0.1)' : 'var(--green-l)',
                color: is_expired ? 'var(--red, #ef4444)' : trialEnded ? 'var(--amber, #f59e0b)' : 'var(--green)',
                fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: 600
              }}>
                ● {is_expired ? 'Expired' : trialEnded ? 'Trial Ended' : is_trial ? 'Trial Active' : 'Active'}
              </span>
            </div>
            <div className="billing-plan-name">{plan.charAt(0).toUpperCase() + plan.slice(1)} — {plan === 'free' ? 'Free' : `${formatPrice(plan, cur, 'monthly')} / month`}</div>
            <div className="billing-plan-desc">
              {PLANS[plan as PlanId] && planFeatures(plan).slice(0, 4).join(' · ')}
            </div>
            <div className="billing-next">
              <span className="billing-next-dot"></span>
              Active since: <strong style={{ color: 'var(--text)' }}>{planSince}</strong> · Billing email: <strong style={{ color: 'var(--text)' }}>{billingEmail}</strong>
            </div>
            {plan !== 'free' && plan_expires_at && (
              <div className="billing-next" style={{ marginTop: '4px' }}>
                <span className="billing-next-dot" style={{ background: 'var(--blue)' }}></span>
                Paid until: <strong style={{ color: 'var(--text)' }}>{expiryDate}</strong> · renews automatically unless cancelled
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
            {planData.polar_portal_url
              ? <a className="btn btn-primary" href={planData.polar_portal_url} target="_blank" rel="noreferrer">Manage card subscription →</a>
              : <button className="btn btn-primary" onClick={() => showToast('info', 'PayHere subscriptions are managed from the link in your receipt email.')}>Manage billing →</button>}
            <span style={{ color: 'var(--text3)', fontSize: '11px' }}>To cancel: {SITE.email}</span>
          </div>
        </div>

        {/* Usage this cycle */}
        <div className="section-row mb16">
          <span className="section-title">This billing cycle</span>
        </div>
        <div className="usage-grid mb24">
          <div className="usage-card">
            <div className="usage-icon">📡</div>
            <div className="usage-label">Scans tracked</div>
            <div className="usage-val">{monthly_scans_used.toLocaleString()}</div>
            <div className="usage-sub">{scanLimit.toLocaleString()} limit</div>
            <div className="progress-bar" style={{ marginTop: '8px' }}>
              <div className="progress-fill" style={{ width: `${scanPct}%`, background: scanPct > 90 ? 'var(--red)' : 'var(--green)' }}></div>
            </div>
          </div>
          <div className="usage-card">
            <div className="usage-icon">🔳</div>
            <div className="usage-label">Active QR codes</div>
            <div className="usage-val">{isUnlimitedQr ? `${qrUsed} active` : `${qrUsed} active`}</div>
            <div className="usage-sub">{isUnlimitedQr ? 'Unlimited' : `${planData.limits.qr_codes} limit`}</div>
            <div className="progress-bar" style={{ marginTop: '8px' }}>
              <div className="progress-fill" style={{ width: isUnlimitedQr ? '0%' : `${qrPct}%`, background: 'var(--blue)' }}></div>
            </div>
          </div>
        </div>

        {/* Plan comparison + upgrade */}
        <div id="upgrade-section" className="grid-21 mb24">
          <div className="card">
            <div className="section-row">
              <span className="section-title">Plan comparison</span>
            </div>
            <table className="plan-compare">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Feature</th>
                  {ORDER.map(p => <th key={p} className={plan === p ? 'current' : ''}>{cap(p)}</th>)}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([label, k]) => (
                  <tr key={k}><td>{label}</td>{ORDER.map(p => <td key={p}>{Number(PLANS[p][k]).toLocaleString('en-US')}</td>)}</tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 600, color: 'var(--text)' }}>Price</td>
                  {ORDER.map(p => (
                    <td key={p} style={{ fontWeight: 600, color: p === plan ? 'var(--coral)' : undefined }}>
                      {p === 'free' ? 'Free' : `${formatPrice(p, cur, isAnnual ? 'annual' : 'monthly')}${isAnnual ? '/yr' : '/mo'}`}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {nextPlan && (
              <div className="card" style={{ borderColor: 'rgba(155,127,255,0.25)', background: 'rgba(155,127,255,0.04)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                  {cap(nextPlan)} Plan
                </div>
                <div style={{ fontFamily: 'var(--font-h)', fontSize: '32px', fontWeight: 600, color: 'var(--text)', letterSpacing: '-1px', marginBottom: '4px' }}>
                  {formatPrice(nextPlan, cur, isAnnual ? 'annual' : 'monthly')}
                  <span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--text3)' }}>{isAnnual ? '/yr' : '/mo'}</span>
                </div>
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '11px' }} onClick={() => handleCheckout(nextPlan)}>
                  Upgrade Now →
                </button>
              </div>
            )}
            <div className="card card-sm">
              <div className="card-title">Payment method</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', padding: '8px 0' }}>
                LKR payments go through PayHere; USD payments by international card. You can manage a PayHere subscription from the link in your receipt email.
                {SITE.whatsapp && (
                  <div style={{ marginTop: '10px' }}>
                    Want us to design, set up and help print your codes?{' '}
                    <a href={waLink(SITE.whatsapp, `Hi, I'd like setup help for my QR codes (${billingEmail}).`)} target="_blank" rel="noreferrer">Book setup on WhatsApp →</a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Invoice history */}
        <div className="card">
          <div className="section-row">
            <span className="section-title">Invoice history</span>
          </div>
          {loadingInvoices ? (
            <p style={{ padding: '20px', color: 'var(--text3)' }}>Loading invoices...</p>
          ) : invoices.length === 0 ? (
            <p style={{ padding: '20px', color: 'var(--text3)' }}>No invoices found.</p>
          ) : (
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text)' }}>{inv.order_id}</span></td>
                    <td style={{ color: 'var(--text2)' }}>{inv.date}</td>
                    <td><span className="chip" style={{ background: 'var(--amber-l)', color: 'var(--amber)', fontSize: '11px', padding: '3px 8px', borderRadius: '4px' }}>{inv.plan}</span></td>
                    <td style={{ fontWeight: 600, color: 'var(--text)' }}>{inv.currency} {inv.amount}</td>
                    <td><span className="invoice-status inv-paid">● {inv.status || 'Paid'}</span></td>
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
