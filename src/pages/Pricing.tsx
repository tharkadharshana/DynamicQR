import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Zap, Crown, Building2, Loader2, ExternalLink } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatPrice, Currency, BillingInterval } from '../lib/plans';
import { startCheckout } from '../lib/checkout';
import { useUI } from '../shared/UIContext';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    cycle: 'forever',
    description: 'Get started with basic QR codes',
    icon: Zap,
    gradient: 'from-zinc-500/20 to-zinc-600/5',
    iconColor: 'text-zinc-400',
    borderColor: 'border-white/[0.06]',
    features: [
      { text: '3 QR codes, 1 dynamic', included: true },
      { text: '1,000 scans / month', included: true },
      { text: '7-day statistics', included: true },
      { text: 'Colours, shapes and logo', included: true },
      { text: 'PIN, expiry and scan limits', included: false },
    ],
    cta: 'Current Plan',
    ctaStyle: 'border border-white/[0.08] text-zinc-400 cursor-default',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 7,
    cycle: '/month',
    description: 'For professionals & small teams',
    icon: Crown,
    gradient: 'from-violet-500/20 to-indigo-600/10',
    iconColor: 'text-violet-400',
    borderColor: 'border-violet-500/30',
    badge: 'Most Popular',
    features: [
      { text: '100 QR codes, all dynamic', included: true },
      { text: '75,000 scans / month', included: true },
      { text: '12 months of statistics', included: true },
      { text: 'PIN, expiry and scan limits', included: true },
      { text: 'Visitor Guard settings', included: true },
      { text: 'WhatsApp support', included: true },
    ],
    cta: 'Upgrade to Pro',
    ctaStyle: 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40',
  },
  {
    id: 'team',
    name: 'Team',
    price: 29,
    cycle: '/month',
    description: 'For growing businesses',
    icon: Building2,
    gradient: 'from-amber-500/20 to-orange-600/10',
    iconColor: 'text-amber-400',
    borderColor: 'border-amber-500/20',
    features: [
      { text: 'Everything in Pro', included: true },
      { text: '600 QR codes', included: true },
      { text: '500,000 scans / month', included: true },
      { text: '24 months of statistics', included: true },
    ],
    cta: 'Upgrade to Team',
    ctaStyle: 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/35',
  },
];

export default function Pricing() {
  const [planData, setPlanData] = useState<any>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>('LKR');
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const currentPlan = planData?.is_trial ? 'trial' : planData?.plan || 'free';
  const { showToast } = useUI();

  useEffect(() => {
    apiFetch('/api/user/plan')
      .then(data => {
        setPlanData(data);
        setCurrency(data?.profile?.country && data.profile.country !== 'LK' ? 'USD' : 'LKR');
      })
      .catch(err => console.error('Failed to fetch plan:', err));
  }, []);

  const handleUpgrade = async (planId: string) => {
    if (planId === 'free' || planId === currentPlan) return;
    setLoading(planId);
    try {
      await startCheckout(planId as 'pro' | 'team', interval, currency, planData);
    } catch (err: any) {
      console.error('Checkout error:', err);
      showToast('error', err?.message || 'Could not start checkout');
      setLoading(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-white mb-2">Choose Your Plan</h1>
        <p className="text-sm text-zinc-500 max-w-md mx-auto">
          Start free. Upgrade when you need more codes, scans and statistics. Yearly billing gives 2 months free.
        </p>
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {(['LKR', 'USD'] as Currency[]).map(c => (
            <button key={c} onClick={() => setCurrency(c)} aria-pressed={currency === c}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${currency === c ? 'bg-white text-zinc-900 border-white' : 'border-white/[0.1] text-zinc-400'}`}>
              {c === 'LKR' ? 'LKR · PayHere' : 'USD · card'}
            </button>
          ))}
          <span className="w-2" />
          {(['monthly', 'annual'] as BillingInterval[]).map(i => (
            <button key={i} onClick={() => setInterval(i)} aria-pressed={interval === i}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${interval === i ? 'bg-white text-zinc-900 border-white' : 'border-white/[0.1] text-zinc-400'}`}>
              {i === 'monthly' ? 'Monthly' : 'Yearly · 2 months free'}
            </button>
          ))}
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
        {PLANS.map(plan => {
          const Icon = plan.icon;
          const isCurrentPlan = currentPlan === plan.id;
          const isDowngrade = (currentPlan === 'team' && plan.id === 'pro') || (['pro', 'team'].includes(currentPlan) && plan.id === 'free');

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl bg-gradient-to-br ${plan.gradient} border ${plan.borderColor} p-6 flex flex-col ${
                plan.badge ? 'ring-1 ring-violet-500/30' : ''
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-violet-600 text-[10px] font-semibold text-white uppercase tracking-wider shadow-lg shadow-violet-500/30">
                  {plan.badge}
                </div>
              )}

              {isCurrentPlan && (
                <div className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-semibold text-emerald-400">
                  Current
                </div>
              )}

              <Icon className={`w-8 h-8 ${plan.iconColor} mb-4`} />

              <h3 className="text-lg font-bold text-white mb-0.5">{plan.name}</h3>
              <p className="text-xs text-zinc-500 mb-4">{plan.description}</p>

              <div className="flex items-baseline gap-0.5 mb-5">
                <span className="text-3xl font-bold text-white">{plan.id === 'free' ? 'Free' : formatPrice(plan.id as 'pro' | 'team', currency, interval)}</span>
                <span className="text-sm text-zinc-500">{plan.id === 'free' ? plan.cycle : interval === 'annual' ? '/year' : '/month'}</span>
              </div>

              <ul className="flex-1 space-y-2.5 mb-6">
                {plan.features.map(feat => (
                  <li key={feat.text} className="flex items-center gap-2.5">
                    {feat.included ? (
                      <div className="w-4 h-4 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <Check className="w-2.5 h-2.5 text-emerald-400" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                        <X className="w-2.5 h-2.5 text-zinc-600" />
                      </div>
                    )}
                    <span className={`text-xs ${feat.included ? 'text-zinc-300' : 'text-zinc-600'}`}>{feat.text}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={isCurrentPlan || isDowngrade || loading === plan.id}
                className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                  isCurrentPlan
                    ? 'border border-white/[0.08] text-zinc-500 cursor-default'
                    : plan.ctaStyle
                }`}
              >
                {loading === plan.id ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </span>
                ) : isCurrentPlan ? (
                  'Current Plan'
                ) : (
                  plan.cta
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* FAQ */}
      <div className="mt-12 max-w-2xl mx-auto">
        <h2 className="text-sm font-semibold text-white text-center mb-6">Frequently Asked Questions</h2>
        <div className="space-y-3">
          {[
            { q: 'Can I change plans anytime?', a: 'Yes. Upgrade or downgrade anytime. Changes take effect immediately.' },
            { q: 'What happens when a plan ends?', a: 'Nothing is deleted. All codes keep working for 30 days. After that, dynamic codes above the Free plan pause until you upgrade again — the printed link stays the same.' },
            { q: 'Do you offer refunds?', a: 'Yes, a full refund within 7 days of your first payment. See the Refund Policy.' },
            { q: 'What payment methods do you accept?', a: 'LKR: cards and local bank payments through PayHere. USD: international cards.' },
            { q: 'Is this a payment QR?', a: 'No. Scnr makes marketing, menu and campaign codes. It does not replace LANKAQR.' },
          ].map(faq => (
            <div key={faq.q} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
              <h3 className="text-sm font-medium text-zinc-200 mb-1">{faq.q}</h3>
              <p className="text-xs text-zinc-500">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Legal Links for PayHere Reviewers */}
      <div className="mt-16 pb-12 text-center flex flex-col sm:flex-row items-center justify-center gap-4 text-xs font-medium text-zinc-600">
        <Link to="/legal/refund-policy" className="hover:text-zinc-300 transition-colors">Refund Policy</Link>
        <span className="hidden sm:inline w-1 h-1 rounded-full bg-zinc-700"></span>
        <Link to="/legal/privacy-policy" className="hover:text-zinc-300 transition-colors">Privacy Policy</Link>
        <span className="hidden sm:inline w-1 h-1 rounded-full bg-zinc-700"></span>
        <Link to="/legal/terms-and-conditions" className="hover:text-zinc-300 transition-colors">Terms & Conditions</Link>
      </div>
    </div>
  );
}
