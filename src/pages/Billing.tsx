import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';

export default function Billing() {
  const [loading, setLoading] = useState(true);
  const [planData, setPlanData] = useState<any>(null);
  const [activeQrs, setActiveQrs] = useState(0);

  useEffect(() => {
    fetchPlan();
  }, []);

  const fetchPlan = async () => {
    try {
      setLoading(true);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/user/plan', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPlanData(data);
        // Calculate active QRs from limits and remaining
        const limit = data.limits.qr_codes;
        if (limit === Infinity) {
          setActiveQrs(0); // Show 0 for now or fetch list
        } else {
          setActiveQrs(limit - data.remaining_qr);
        }
      }
    } catch (err) {
      console.error('Failed to fetch plan:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (plan: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ plan })
      });
      if (res.ok) {
        const data = await res.json();
        submitPayHere(data);
      }
    } catch (err) {
      alert('Checkout failed');
    }
  };

  const handleAddonCheckout = async (addonId: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/billing/addon/checkout', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ addonId })
      });
      if (res.ok) {
        const data = await res.json();
        submitPayHere(data);
      }
    } catch (err) {
      alert('Addon checkout failed');
    }
  };

  const submitPayHere = (data: any) => {
    const isSandbox = planData?.is_sandbox;
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = isSandbox 
      ? 'https://sandbox.payhere.lk/pay/checkout' 
      : 'https://www.payhere.lk/pay/checkout';
    
    Object.entries(data).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value as string;
      form.appendChild(input);
    });
    
    document.body.appendChild(form);
    form.submit();
  };

  if (loading) return <div className="content" style={{ padding: '28px' }}>Loading billing info...</div>;

  const plan = planData?.plan || 'free';
  const limits = planData?.limits;
  const isTrial = planData?.is_trial;

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">
        {/* Hero: current plan */}
        <div className="billing-hero">
          <div className="billing-hero-left">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span className="chip" style={{ 
                background: plan === 'free' ? 'var(--surface3)' : 'var(--amber-l)', 
                color: plan === 'free' ? 'var(--text2)' : 'var(--amber)', 
                fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: 700 
              }}>
                {isTrial ? '✨ 14-Day Trial' : plan.toUpperCase() + ' Plan'}
              </span>
              <span className="chip" style={{ background: 'var(--green-l)', color: 'var(--green)', fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: 600 }}>● Active</span>
            </div>
            <div className="billing-plan-name">
              {plan === 'free' ? 'Free Plan — $0 / month' : plan === 'pro' ? 'Pro Plan — $7 / month' : 'Team Plan — $29 / month'}
            </div>
            <div className="billing-plan-desc">
              {limits?.qr_codes === Infinity ? 'Unlimited' : limits?.qr_codes} QR codes · 
              {limits?.monthly_scans.toLocaleString()} scans/mo · 
              {limits?.analytics_days} days analytics
            </div>
            {plan !== 'free' && (
              <div className="billing-next">
                <span className="billing-next-dot"></span>
                Billing cycle is monthly via PayHere
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
            {plan === 'free' ? (
              <button className="btn btn-primary" onClick={() => handleCheckout('pro')}>Upgrade to Pro →</button>
            ) : (
              <button className="btn btn-ghost btn-sm" disabled>Manage Subscription (PayHere Portal)</button>
            )}
          </div>
        </div>

        {/* Usage this cycle */}
        <div className="section-row mb16">
          <span className="section-title">Current usage</span>
        </div>
        <div className="usage-grid mb24">
          <div className="usage-card">
            <div className="usage-icon">🔳</div>
            <div className="usage-label">Active QR codes</div>
            <div className="usage-val">{activeQrs} / {limits?.qr_codes === Infinity ? '∞' : limits?.qr_codes}</div>
            <div className="progress-bar" style={{ marginTop: '8px' }}>
              <div className="progress-fill" style={{ 
                width: limits?.qr_codes === Infinity ? '0%' : `${(activeQrs / limits?.qr_codes) * 100}%`, 
                background: 'var(--blue)' 
              }}></div>
            </div>
          </div>
          <div className="usage-card">
            <div className="usage-icon">📡</div>
            <div className="usage-label">Monthly scans</div>
            <div className="usage-val">Checked at runtime</div>
            <div className="usage-sub">Limit: {limits?.monthly_scans.toLocaleString()}</div>
            <div className="progress-bar" style={{ marginTop: '8px' }}>
              <div className="progress-fill" style={{ width: '0%', background: 'var(--green)' }}></div>
            </div>
          </div>
          <div className="usage-card">
            <div className="usage-icon">➕</div>
            <div className="usage-label">Addons active</div>
            <div className="usage-val">
              {planData?.addons?.extra_qr_codes > 0 ? `+${planData.addons.extra_qr_codes} QRs` : 'None'}
            </div>
            <div className="usage-sub">
              {planData?.addons?.extra_scans > 0 ? `+${planData.addons.extra_scans.toLocaleString()} scans` : ''}
            </div>
          </div>
        </div>

        {/* Addons Section */}
        <div className="card mb24">
          <div className="section-row">
            <span className="section-title">One-time Addons</span>
            <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Boost your plan without upgrading</span>
          </div>
          <div className="grid-3 gap12">
            <div className="addon-item" style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>5 Extra QRs</div>
              <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '12px' }}>$3 one-time</div>
              <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={() => handleAddonCheckout('extra_qr_5')}>Buy Addon</button>
            </div>
            <div className="addon-item" style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>100k Extra Scans</div>
              <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '12px' }}>$4 one-time</div>
              <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={() => handleAddonCheckout('extra_scans_100k')}>Buy Addon</button>
            </div>
            <div className="addon-item" style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>Shared Workspaces</div>
              <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '12px' }}>Included in Team</div>
              <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} disabled>Coming Soon</button>
            </div>
          </div>
        </div>

        {/* Plan comparison */}
        <div className="card mb24">
          <div className="section-row">
            <span className="section-title">Available Plans</span>
          </div>
          <div className="grid-3 gap12">
            <div className={`pricing-card ${plan === 'free' ? 'current' : ''}`} style={{ padding: '20px', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <div style={{ fontWeight: 700, fontSize: '18px' }}>Free</div>
              <div style={{ fontSize: '24px', fontWeight: 700, margin: '8px 0' }}>$0</div>
              <ul style={{ fontSize: '13px', color: 'var(--text2)', padding: '0', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                <li>✓ 3 QR codes</li>
                <li>✓ 1,000 scans/mo</li>
                <li>✓ 7 days analytics</li>
                <li>✕ No password/expiry</li>
              </ul>
            </div>
            <div className={`pricing-card ${plan === 'pro' ? 'current' : ''}`} style={{ padding: '20px', border: '2px solid var(--amber)', borderRadius: '12px', background: 'var(--amber-ll)' }}>
              <div style={{ fontWeight: 700, fontSize: '18px' }}>Pro</div>
              <div style={{ fontSize: '24px', fontWeight: 700, margin: '8px 0' }}>$7<span style={{ fontSize: '14px' }}>/mo</span></div>
              <ul style={{ fontSize: '13px', color: 'var(--text2)', padding: '0', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                <li>✓ Unlimited QRs</li>
                <li>✓ 50,000 scans/mo</li>
                <li>✓ 90 days analytics</li>
                <li>✓ Password & Expiry</li>
              </ul>
              {plan === 'free' && <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => handleCheckout('pro')}>Get Pro</button>}
            </div>
            <div className={`pricing-card ${plan === 'team' ? 'current' : ''}`} style={{ padding: '20px', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <div style={{ fontWeight: 700, fontSize: '18px' }}>Team</div>
              <div style={{ fontSize: '24px', fontWeight: 700, margin: '8px 0' }}>$29<span style={{ fontSize: '14px' }}>/mo</span></div>
              <ul style={{ fontSize: '13px', color: 'var(--text2)', padding: '0', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                <li>✓ Everything in Pro</li>
                <li>✓ 500,000 scans/mo</li>
                <li>✓ White-labeling</li>
                <li>✓ API Access</li>
              </ul>
              {plan !== 'team' && <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => handleCheckout('team')}>Get Team</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
