import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, Zap, Crown, Users, Building2, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatPrice, planFeatures, PLANS, PAID_PLANS, GRACE_DAYS, Currency, BillingInterval, PlanId, PaidPlan } from '../lib/plans';
import { SITE, waLink } from '../lib/site';
import { startCheckout } from '../lib/checkout';
import { useUI } from '../shared/UIContext';
import HelpButton from '../components/HelpButton';

// Presentation only. Prices and features come from plans.ts.
const ORDER: PlanId[] = ['free', ...PAID_PLANS];
const CARDS: Record<PlanId, { name: string; description: string; icon: typeof Zap; gradient: string; iconColor: string; borderColor: string; badge?: string; ctaStyle: string }> = {
  free: { name: 'Free', description: 'Get started with basic QR codes', icon: Zap, gradient: 'from-zinc-500/20 to-zinc-600/5', iconColor: 'text-zinc-400', borderColor: 'border-white/[0.06]', ctaStyle: 'border border-white/[0.08] text-zinc-400 cursor-default' },
  pro: { name: 'Pro', description: 'For professionals and small shops', icon: Crown, gradient: 'from-violet-500/20 to-indigo-600/10', iconColor: 'text-violet-400', borderColor: 'border-violet-500/30', badge: 'Most Popular', ctaStyle: 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40' },
  team: { name: 'Team', description: 'For growing businesses', icon: Users, gradient: 'from-amber-500/20 to-orange-600/10', iconColor: 'text-amber-400', borderColor: 'border-amber-500/20', ctaStyle: 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/35' },
  business: { name: 'Business', description: 'For chains, agencies and many locations', icon: Building2, gradient: 'from-emerald-500/20 to-teal-600/10', iconColor: 'text-emerald-400', borderColor: 'border-emerald-500/20', ctaStyle: 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/35' },
};
const years = (d: number) => d >= 365 ? `${d / 365} year${d === 365 ? '' : 's'}` : `${d} days`;

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

  const handleUpgrade = async (planId: PlanId) => {
    if (planId === 'free' || planId === currentPlan) return;
    setLoading(planId);
    try {
      await startCheckout(planId, interval, currency, planData);
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
        {ORDER.map(id => {
          const plan = CARDS[id];
          const Icon = plan.icon;
          const isCurrentPlan = currentPlan === id;
          const isDowngrade = ORDER.indexOf(id) < ORDER.indexOf(currentPlan);

          return (
            <div
              key={id}
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
                <span className="text-3xl font-bold text-white">{id === 'free' ? 'Free' : formatPrice(id as PaidPlan, currency, interval)}</span>
                <span className="text-sm text-zinc-500">{id === 'free' ? 'forever' : interval === 'annual' ? '/year' : '/month'}</span>
              </div>

              <ul className="flex-1 space-y-2.5 mb-6">
                {planFeatures(id).map(text => (
                  <li key={text} className="flex items-center gap-2.5">
                    <div className="w-4 h-4 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                      <Check className="w-2.5 h-2.5 text-emerald-400" />
                    </div>
                    <span className="text-xs text-zinc-300">{text}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade(id)}
                disabled={isCurrentPlan || isDowngrade || loading === id}
                className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                  isCurrentPlan
                    ? 'border border-white/[0.08] text-zinc-500 cursor-default'
                    : plan.ctaStyle
                }`}
              >
                {loading === id ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </span>
                ) : isCurrentPlan ? (
                  'Current Plan'
                ) : id === 'free' ? (
                  'Free forever'
                ) : (
                  `Upgrade to ${plan.name}`
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
          {([
            ['Is the free plan really free?', `Yes. No card needed. You get ${PLANS.free.qr_codes} QR codes in total, ${PLANS.free.dynamic_qr_codes} of them dynamic, and the plan never expires.`],
            ['Do my QR codes expire?', 'No. Static codes work forever. Dynamic codes keep working while your plan is active.'],
            ['What happens if I stop paying?', `Nothing is deleted. After a ${GRACE_DAYS}-day grace period, dynamic codes above your plan's allowance pause. Upgrading again un-pauses them, and the printed code stays the same.`],
            ['Are there ads on my codes?', 'No ads. On Free, hosted pages show a small Scnr badge. Paid plans remove it.'],
            ['Are static QR codes unlimited?', `Static codes encode the destination directly and never stop working. They do count towards your plan's QR code cap, which covers static and dynamic codes in total (${PLANS.free.qr_codes} in total on Free).`],
            ['Can I cancel any time?', 'Yes. Your plan stays active until the end of the period you already paid for.'],
            ['How long is analytics history kept?', ORDER.map(p => `${CARDS[p].name}: ${years(PLANS[p].analytics_days)}`).join(' · ')],
            ['Do you have a non-profit discount?', <>Yes. {SITE.whatsapp
              ? <a className="text-violet-400 hover:underline" href={waLink(SITE.whatsapp, 'Hi, I would like to ask about the non-profit discount.')} target="_blank" rel="noreferrer">Message us on WhatsApp</a>
              : <a className="text-violet-400 hover:underline" href={`mailto:${SITE.email}`}>Email us</a>} and tell us about your organisation.</>],
            ['Do you offer refunds?', 'Yes, a full refund within 7 days of your first payment. See the Refund Policy.'],
            ['What payment methods do you accept?', 'LKR: cards and local bank payments through PayHere. USD: international cards.'],
            ['Is this a payment QR?', 'No. Scnr makes marketing, menu and campaign codes. It does not replace LANKAQR.'],
          ] as [string, React.ReactNode][]).map(([q, a]) => (
            <details key={q} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
              <summary className="text-sm font-medium text-zinc-200 cursor-pointer">{q}</summary>
              <p className="text-xs text-zinc-500 mt-2">{a}</p>
            </details>
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
      <HelpButton />
    </div>
  );
}
