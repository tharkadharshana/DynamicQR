import React from 'react';
import { auth } from '../firebase';

export default function Billing() {
  const user = auth.currentUser;

  const INVOICES = [
    { id: 'INV-2026-03', date: 'Mar 21, 2026', plan: 'Pro', amount: '$7.00', status: 'paid', period: 'Mar 21 – Apr 21' },
    { id: 'INV-2026-02', date: 'Feb 21, 2026', plan: 'Pro', amount: '$7.00', status: 'paid', period: 'Feb 21 – Mar 21' },
    { id: 'INV-2026-01', date: 'Jan 21, 2026', plan: 'Pro', amount: '$7.00', status: 'paid', period: 'Jan 21 – Feb 21' },
    { id: 'INV-2025-12', date: 'Dec 21, 2025', plan: 'Free', amount: '$0.00', status: 'paid', period: 'Dec 21 – Jan 21' },
    { id: 'INV-2025-11', date: 'Nov 21, 2025', plan: 'Free', amount: '$0.00', status: 'paid', period: 'Nov 21 – Dec 21' },
  ];

  const showToast = (type: string, message: string) => {
    alert(`${type.toUpperCase()}: ${message}`);
  };

  const confirmCancel = () => {
    if (window.confirm('Cancel your Pro subscription? Your plan stays active until April 21, 2026.')) {
      showToast('success', 'Cancellation scheduled for Apr 21, 2026');
    }
  };

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">
        {/* Hero: current plan */}
        <div className="billing-hero">
          <div className="billing-hero-left">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span className="chip" style={{ background: 'var(--amber-l)', color: 'var(--amber)', fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: 700 }}>⭐ Pro Plan</span>
              <span className="chip" style={{ background: 'var(--green-l)', color: 'var(--green)', fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: 600 }}>● Active</span>
            </div>
            <div className="billing-plan-name">Pro — $7 / month</div>
            <div className="billing-plan-desc">Unlimited QR codes · Full analytics · 90-day history · Logo embedding</div>
            <div className="billing-next">
              <span className="billing-next-dot"></span>
              Next billing: <strong style={{ color: 'var(--text)' }}>April 21, 2026</strong> · Auto-renews via PayHere
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" onClick={() => showToast('success', 'Redirecting to PayHere portal…')}>Manage billing →</button>
            <button className="btn btn-ghost btn-sm" onClick={() => showToast('success', 'Invoice downloaded')}>Download invoice</button>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text3)', fontSize: '11px' }} onClick={confirmCancel}>Cancel subscription</button>
          </div>
        </div>

        {/* Usage this cycle */}
        <div className="section-row mb16">
          <span className="section-title">This billing cycle</span>
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Mar 21 – Apr 21, 2026</span>
        </div>
        <div className="usage-grid mb24">
          <div className="usage-card">
            <div className="usage-icon">📡</div>
            <div className="usage-label">Scans tracked</div>
            <div className="usage-val">48,291</div>
            <div className="usage-sub">Unlimited on Pro</div>
            <div className="progress-bar" style={{ marginTop: '8px' }}><div className="progress-fill" style={{ width: '100%', background: 'var(--green)' }}></div></div>
          </div>
          <div className="usage-card">
            <div className="usage-icon">🔳</div>
            <div className="usage-label">QR codes</div>
            <div className="usage-val">7 active</div>
            <div className="usage-sub">Unlimited on Pro</div>
            <div className="progress-bar" style={{ marginTop: '8px' }}><div className="progress-fill" style={{ width: '14%', background: 'var(--blue)' }}></div></div>
          </div>
          <div className="usage-card">
            <div className="usage-icon">💾</div>
            <div className="usage-label">Storage used</div>
            <div className="usage-val">2.4 MB</div>
            <div className="usage-sub">Firebase — no hard limit</div>
            <div className="progress-bar" style={{ marginTop: '8px' }}><div className="progress-fill" style={{ width: '3%', background: 'var(--purple)' }}></div></div>
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
                  <th>Free</th>
                  <th className="current">Pro ✓</th>
                  <th>Team</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>QR codes</td><td>3</td><td style={{ color: 'var(--coral)', fontWeight: 600 }}>Unlimited</td><td>Unlimited</td></tr>
                <tr><td>Dynamic destinations</td><td><span className="check-n">—</span></td><td><span className="check-y">✓</span></td><td><span className="check-y">✓</span></td></tr>
                <tr><td>Scan analytics</td><td><span className="check-n">—</span></td><td><span className="check-y">✓</span></td><td><span className="check-y">✓</span></td></tr>
                <tr><td>Analytics history</td><td>—</td><td style={{ color: 'var(--coral)', fontWeight: 600 }}>90 days</td><td>365 days</td></tr>
                <tr><td>Logo embedding</td><td><span className="check-n">—</span></td><td><span className="check-y">✓</span></td><td><span className="check-y">✓</span></td></tr>
                <tr><td>Custom domain</td><td><span className="check-n">—</span></td><td><span className="check-n">—</span></td><td><span className="check-y">✓</span></td></tr>
                <tr><td>White-label</td><td><span className="check-n">—</span></td><td><span className="check-n">—</span></td><td><span className="check-y">✓</span></td></tr>
                <tr><td>API access</td><td><span className="check-n">—</span></td><td><span className="check-n">—</span></td><td><span className="check-y">✓</span></td></tr>
                <tr><td>Shared workspaces</td><td><span className="check-n">—</span></td><td><span className="check-n">—</span></td><td><span className="check-y">✓</span></td></tr>
                <tr><td>Priority support</td><td><span className="check-n">—</span></td><td><span className="check-n">—</span></td><td><span className="check-y">✓</span></td></tr>
                <tr>
                  <td style={{ fontWeight: 600, color: 'var(--text)' }}>Price</td>
                  <td style={{ fontWeight: 600 }}>$0</td>
                  <td style={{ color: 'var(--coral)', fontWeight: 700 }}>$7/mo</td>
                  <td style={{ fontWeight: 600 }}>$29/mo</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Upgrade card */}
            <div className="card" style={{ borderColor: 'rgba(155,127,255,0.25)', background: 'rgba(155,127,255,0.04)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Team plan</div>
              <div style={{ fontFamily: 'var(--font-h)', fontSize: '32px', fontWeight: 600, color: 'var(--text)', letterSpacing: '-1px', marginBottom: '4px' }}>$29<span style={{ fontSize: '14px', fontWeight: 400, color: 'var(--text3)' }}>/mo</span></div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '16px' }}>For agencies and teams managing multiple clients</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px', fontSize: '13px' }}>
                <div style={{ display: 'flex', gap: '8px', color: 'var(--text2)' }}><span style={{ color: 'var(--green)' }}>✓</span> Everything in Pro</div>
                <div style={{ display: 'flex', gap: '8px', color: 'var(--text2)' }}><span style={{ color: 'var(--green)' }}>✓</span> White-label your QR platform</div>
                <div style={{ display: 'flex', gap: '8px', color: 'var(--text2)' }}><span style={{ color: 'var(--green)' }}>✓</span> Full REST API access</div>
                <div style={{ display: 'flex', gap: '8px', color: 'var(--text2)' }}><span style={{ color: 'var(--green)' }}>✓</span> Shared team workspaces</div>
                <div style={{ display: 'flex', gap: '8px', color: 'var(--text2)' }}><span style={{ color: 'var(--green)' }}>✓</span> 365-day analytics history</div>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '11px' }} onClick={() => showToast('success', 'Redirecting to PayHere checkout…')}>Upgrade to Team →</button>
            </div>
            {/* PayHere info */}
            <div className="card card-sm">
              <div className="card-title">Payment method</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
                <div style={{ width: '40px', height: '26px', background: 'var(--surface3)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--text3)' }}>VISA</div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>•••• •••• •••• 4242</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Expires 08/2028 · via PayHere</div>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => showToast('success', 'Opening PayHere portal…')}>Update</button>
              </div>
            </div>
          </div>
        </div>

        {/* Invoice history */}
        <div className="card">
          <div className="section-row">
            <span className="section-title">Invoice history</span>
            <button className="btn btn-ghost btn-sm" onClick={() => showToast('success', 'All invoices downloaded')}>Download all</button>
          </div>
          <table className="invoice-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {INVOICES.map(inv => (
                <tr key={inv.id}>
                  <td><span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text)' }}>{inv.id}</span></td>
                  <td style={{ color: 'var(--text2)' }}>{inv.date}</td>
                  <td><span className="chip" style={{ background: 'var(--amber-l)', color: 'var(--amber)', fontSize: '11px', padding: '3px 8px', borderRadius: '4px' }}>{inv.plan}</span></td>
                  <td style={{ fontWeight: 600, color: 'var(--text)' }}>{inv.amount}</td>
                  <td><span className={`invoice-status ${inv.status === 'paid' ? 'inv-paid' : inv.status === 'pending' ? 'inv-pending' : 'inv-failed'}`}>{inv.status === 'paid' ? '● Paid' : inv.status === 'pending' ? '● Pending' : '✕ Failed'}</span></td>
                  <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={() => showToast('success', `Invoice ${inv.id} downloaded`)}>↓ PDF</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
