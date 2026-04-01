import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { auth } from '../firebase';
import { apiFetch } from '../lib/api';

export default function Billing() {
  const { planData } = useOutletContext<{ planData: any }>();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [isAnnual, setIsAnnual] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
      <div className="content" style={{ padding: '28px', display: 'flex', alignItems: 'center', justifyItems: 'center' }}>
        <p>Loading plan information...</p>
      </div>
    );
  }

  const { plan, plan_expires_at, monthly_scans_used, limits, is_trial, is_expired, plan_since, email } = planData;
  // plan_expires_at arrives as a Firestore Timestamp serialised to {_seconds, _nanoseconds}
  const expiryDate = plan_expires_at?._seconds
    ? new Date(plan_expires_at._seconds * 1000).toLocaleDateString()
    : 'N/A';
  const planSince = plan_since
    ? new Date(plan_since).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';
  const billingEmail = email || auth.currentUser?.email || '—';
  
  const showToast = (type: string, message: string) => {
    alert(`${type.toUpperCase()}: ${message}`);
  };

  const handleCheckout = async (targetPlan: string) => {
    try {
      const data = await apiFetch('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: targetPlan, interval: isAnnual ? 'annual' : 'monthly' })
      });
      if (data.hash) {
        // Submit hidden form to PayHere
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = planData.is_sandbox ? 'https://sandbox.payhere.lk/pay/checkout' : 'https://www.payhere.lk/pay/checkout';
        
        Object.entries(data).forEach(([key, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value as string;
          form.appendChild(input);
        });
        
        document.body.appendChild(form);
        form.submit();
      }
    } catch (err) {
      showToast('error', 'Failed to initiate checkout');
    }
  };

  const scanLimit = limits.monthly_scans;
  const scanPct = Math.min(100, (monthly_scans_used / scanLimit) * 100);
  const isUnlimitedQr = planData.limits.qr_codes === -1;
  const qrUsed = isUnlimitedQr ? planData.total_qrs : (planData.limits.qr_codes - planData.remaining_qr);
  const qrPct = isUnlimitedQr ? 0 : Math.min(100, (qrUsed / planData.limits.qr_codes) * 100);

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">
        {/* Billing Cycle Toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <div style={{ background: 'var(--surface2)', padding: '4px', borderRadius: '30px', display: 'flex', gap: '4px', border: '1px solid var(--border)' }}>
            <button 
              onClick={() => setIsAnnual(false)}
              style={{ 
                padding: '8px 20px', borderRadius: '26px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                background: !isAnnual ? 'white' : 'transparent', color: !isAnnual ? 'var(--text)' : 'var(--text3)',
                boxShadow: !isAnnual ? '0 2px 8px rgba(0,0,0,0.05)' : 'none'
              }}
            >Monthly</button>
            <button 
              onClick={() => setIsAnnual(true)}
              style={{ 
                padding: '8px 20px', borderRadius: '26px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                background: isAnnual ? 'white' : 'transparent', color: isAnnual ? 'var(--text)' : 'var(--text3)',
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
              <span className={`chip ${is_expired ? 'expired' : 'active'}`} style={{ 
                background: is_expired ? 'var(--red-l)' : 'var(--green-l)', 
                color: is_expired ? 'var(--red)' : 'var(--green)', 
                fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: 600 
              }}>
                ● {is_expired ? 'Expired' : 'Active'}
              </span>
            </div>
            <div className="billing-plan-name">{plan.charAt(0).toUpperCase() + plan.slice(1)} — {plan === 'free' ? '$0' : plan === 'pro' ? '$7' : '$29'} / month</div>
            <div className="billing-plan-desc">
              {plan === 'free' ? 'Basic QR creation & standard security' : plan === 'pro' ? 'Unlimited Dynamic QRs · 75k Scans · full Analytics' : 'Heavy volume scans · All features unlocked'}
            </div>
            <div className="billing-next">
              <span className="billing-next-dot"></span>
              Active since: <strong style={{ color: 'var(--text)' }}>{planSince}</strong> · Billing email: <strong style={{ color: 'var(--text)' }}>{billingEmail}</strong>
            </div>
            {plan !== 'free' && plan_expires_at && (
              <div className="billing-next" style={{ marginTop: '4px' }}>
                <span className="billing-next-dot" style={{ background: 'var(--blue)' }}></span>
                Next billing: <strong style={{ color: 'var(--text)' }}>{expiryDate}</strong> · Auto-renews via PayHere
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" onClick={() => showToast('info', 'PayHere portal can be accessed via your receipt email')}>Manage billing →</button>
            <a href="mailto:support@tharkak.com?subject=Cancellation Request" className="btn btn-ghost btn-sm" style={{ color: 'var(--text3)', fontSize: '11px' }}>Cancel subscription</a>
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
        <div className="grid-21 mb24">
          <div className="card">
            <div className="section-row">
              <span className="section-title">Plan comparison</span>
            </div>
            <table className="plan-compare">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Feature</th>
                  <th className={plan === 'free' ? 'current' : ''}>Free</th>
                  <th className={plan === 'pro' ? 'current' : ''}>Pro</th>
                  <th className={plan === 'team' ? 'current' : ''}>Team</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Total QR codes</td><td>3 (Static)</td><td>Unlimited</td><td>Unlimited</td></tr>
                <tr><td>Monthly Scans</td><td>1,000</td><td>75,000</td><td>500,000</td></tr>
                <tr><td>Dynamic destinations</td><td>—</td><td>✓</td><td>✓</td></tr>
                <tr><td>Scan analytics</td><td>—</td><td>✓</td><td>✓</td></tr>
                <tr><td>Analytics history</td><td>7 days</td><td>90 days</td><td>365 days</td></tr>
                <tr><td>Password protection</td><td>—</td><td>✓</td><td>✓</td></tr>
                <tr><td>Expiry dates</td><td>—</td><td>✓</td><td>✓</td></tr>
                <tr><td>Visitor Guard</td><td>5 scans/hr</td><td>Configurable</td><td>Configurable</td></tr>
                <tr><td>Overage scans</td><td>—</td><td>$10 / 100k</td><td>$10 / 100k</td></tr>
                <tr>
                  <td style={{ fontWeight: 600, color: 'var(--text)' }}>Price</td>
                  <td style={{ fontWeight: 600 }}>$0</td>
                  <td style={{ color: 'var(--coral)', fontWeight: 700 }}>
                    {isAnnual ? '$70/yr' : '$7/mo'}
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {isAnnual ? '$290/yr' : '$29/mo'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {plan !== 'team' && (
              <div className="card" style={{ borderColor: 'rgba(155,127,255,0.25)', background: 'rgba(155,127,255,0.04)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                  {plan === 'free' ? 'Pro Plan' : 'Team Plan'}
                </div>
                <div style={{ fontFamily: 'var(--font-h)', fontSize: '32px', fontWeight: 600, color: 'var(--text)', letterSpacing: '-1px', marginBottom: '4px' }}>
                  {isAnnual ? (
                    <>${plan === 'free' ? '70' : '290'}<span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--text3)' }}>/yr</span></>
                  ) : (
                    <>${plan === 'free' ? '7' : '29'}<span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--text3)' }}>/mo</span></>
                  )}
                </div>
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '11px' }} onClick={() => handleCheckout(plan === 'free' ? 'pro' : 'team')}>
                  Upgrade Now →
                </button>
              </div>
            )}
            <div className="card card-sm">
              <div className="card-title">Payment method</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', padding: '8px 0' }}>
                Payments are processed securely via PayHere. You can manage your card details through the link sent in your subscription email.
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
                    <td style={{ fontWeight: 600, color: 'var(--text)' }}>${inv.amount}</td>
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
