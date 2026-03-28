import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Zap, Crown, Building2, Loader2, ExternalLink } from 'lucide-react';
import { apiFetch } from '../lib/api';

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
      { text: '3 QR codes', included: true },
      { text: 'PNG + SVG export', included: true },
      { text: 'Basic styling', included: true },
      { text: '7-day analytics', included: true },
      { text: 'Dynamic destinations', included: false },
      { text: 'Logo embedding', included: false },
      { text: 'Custom domain', included: false },
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
      { text: 'Unlimited QR codes', included: true },
      { text: 'Dynamic destinations', included: true },
      { text: 'Full scan analytics', included: true },
      { text: 'Logo + custom colors', included: true },
      { text: '90-day history', included: true },
      { text: 'Priority support', included: true },
      { text: 'Custom domain', included: false },
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
      { text: 'Shared workspaces', included: true },
      { text: 'White-label option', included: true },
      { text: 'API access', included: true },
      { text: '365-day history', included: true },
      { text: 'Custom domain', included: true },
      { text: 'Bulk QR generation', included: true },
    ],
    cta: 'Upgrade to Team',
    ctaStyle: 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/35',
  },
];

export default function Pricing() {
  const [currentPlan, setCurrentPlan] = useState('free');
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const data = await apiFetch('/api/user/plan');
        setCurrentPlan(data.plan || 'free');
      } catch (err) {
        console.error('Failed to fetch plan:', err);
      }
    };
    fetchPlan();
  }, []);

  const handleUpgrade = async (planId: string) => {
    if (planId === 'free' || planId === currentPlan) return;
    setLoading(planId);

    try {
      const data = await apiFetch('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: planId })
      });

      // Build PayHere checkout form and submit
      const form = document.createElement('form');
      form.method = 'POST';
      // Use sandbox if explicitly flag is set, otherwise default to production
      form.action = data.is_sandbox ? 'https://sandbox.payhere.lk/pay/checkout' : 'https://www.payhere.lk/pay/checkout';

      const fields = [
        'merchant_id', 'return_url', 'cancel_url', 'notify_url',
        'order_id', 'items', 'currency', 'amount', 'first_name',
        'last_name', 'email', 'phone', 'address', 'city', 'country',
        'hash', 'custom_1', 'custom_2', 'recurrence', 'duration'
      ];

      fields.forEach(field => {
        if (data[field] !== undefined) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = field;
          input.value = String(data[field]);
          form.appendChild(input);
        }
      });

      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      console.error('Checkout error:', err);
      setLoading(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-white mb-2">Choose Your Plan</h1>
        <p className="text-sm text-zinc-500 max-w-md mx-auto">
          Start free. Upgrade when you need unlimited QR codes, advanced analytics, and custom branding.
        </p>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
        {PLANS.map(plan => {
          const Icon = plan.icon;
          const isCurrentPlan = currentPlan === plan.id;
          const isDowngrade = (currentPlan === 'team' && plan.id === 'pro') || (currentPlan !== 'free' && plan.id === 'free');

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
                <span className="text-3xl font-bold text-white">${plan.price}</span>
                <span className="text-sm text-zinc-500">{plan.cycle}</span>
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
            { q: 'What happens when I downgrade?', a: 'You keep all existing QR codes, but new creation limits will apply. Analytics history remains accessible.' },
            { q: 'Do you offer refunds?', a: 'Yes, within the first 7 days of any paid plan. No questions asked.' },
            { q: 'What payment methods do you accept?', a: 'We accept Visa, Mastercard, and local bank payments through PayHere.' },
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
