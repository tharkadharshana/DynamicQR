import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, X, Zap, Rocket, Crown, Building2, Loader2, Plus, Minus, ShoppingCart } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  PLANS, ADDONS, PLAN_ORDER, FEATURE_LABELS, LIMIT_LABELS,
  formatLimit, formatBytes, isUnlimited, getPlan, computeEffectiveLimits,
  type PlanId, type Addon, type ActiveAddon,
} from '../shared/plans';

const PLAN_ICONS: Record<PlanId, any> = {
  free: Zap,
  starter: Rocket,
  pro: Crown,
  business: Building2,
};

const PLAN_STYLES: Record<PlanId, { gradient: string; iconColor: string; borderColor: string; ctaStyle: string }> = {
  free: {
    gradient: 'from-zinc-500/20 to-zinc-600/5',
    iconColor: 'text-zinc-400',
    borderColor: 'border-white/[0.06]',
    ctaStyle: 'border border-white/[0.08] text-zinc-400 cursor-default',
  },
  starter: {
    gradient: 'from-emerald-500/20 to-teal-600/10',
    iconColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/20',
    ctaStyle: 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/35',
  },
  pro: {
    gradient: 'from-violet-500/20 to-indigo-600/10',
    iconColor: 'text-violet-400',
    borderColor: 'border-violet-500/30',
    ctaStyle: 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40',
  },
  business: {
    gradient: 'from-amber-500/20 to-orange-600/10',
    iconColor: 'text-amber-400',
    borderColor: 'border-amber-500/20',
    ctaStyle: 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/35',
  },
};

export default function Pricing() {
  const navigate = useNavigate();
  const [currentPlan, setCurrentPlan] = useState<PlanId>('free');
  const [loading, setLoading] = useState<string | null>(null);
  const [addonCart, setAddonCart] = useState<Record<string, number>>({});
  const [addonLoading, setAddonLoading] = useState<string | null>(null);
  const [showAddons, setShowAddons] = useState(false);

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const data = await apiFetch('/api/user/plan');
        setCurrentPlan((data.plan || 'free') as PlanId);
      } catch (err) {
        console.error('Failed to fetch plan:', err);
      }
    };
    fetchPlan();
  }, []);

  const handleUpgrade = async (planId: PlanId) => {
    if (planId === 'free' || planId === currentPlan) return;
    const currentRank = getPlan(currentPlan).rank;
    const targetRank = getPlan(planId).rank;
    if (targetRank < currentRank) return; // no downgrade from here

    setLoading(planId);
    try {
      const data = await apiFetch('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: planId })
      });

      if (data.dev_mode) {
        // Dev mode — plan applied directly
        setCurrentPlan(planId);
        setLoading(null);
        return;
      }

      // Build PayHere checkout form and submit
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = 'https://sandbox.payhere.lk/pay/checkout';

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

  const handleBuyAddon = async (addonId: string) => {
    const qty = addonCart[addonId] || 1;
    setAddonLoading(addonId);
    try {
      const data = await apiFetch('/api/billing/addon', {
        method: 'POST',
        body: JSON.stringify({ addon_id: addonId, quantity: qty })
      });

      if (data.dev_mode) {
        alert(`✅ ${data.message}`);
        setAddonCart(prev => ({ ...prev, [addonId]: 0 }));
        setAddonLoading(null);
        return;
      }

      // PayHere checkout
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = 'https://sandbox.payhere.lk/pay/checkout';
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = String(value);
          form.appendChild(input);
        }
      });
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      console.error('Addon checkout error:', err);
      setAddonLoading(null);
    }
  };

  const addonTotal = Object.entries(addonCart).reduce((sum, [id, qty]) => {
    const addon = ADDONS.find(a => a.id === id);
    return sum + (addon ? addon.price_usd * (qty as number) : 0);
  }, 0);

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-white mb-2">Choose Your Plan</h1>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            Start free. Upgrade when you need more QR codes, scans, and advanced features.
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto mb-12">
          {PLAN_ORDER.map(planId => {
            const plan = PLANS[planId];
            const style = PLAN_STYLES[planId];
            const Icon = PLAN_ICONS[planId];
            const isCurrentPlan = currentPlan === planId;
            const currentRank = getPlan(currentPlan).rank;
            const isDowngrade = plan.rank < currentRank;
            const isRecommended = planId === 'pro';

            return (
              <div
                key={planId}
                className={`relative rounded-2xl bg-gradient-to-br ${style.gradient} border ${style.borderColor} p-5 flex flex-col ${
                  isRecommended ? 'ring-1 ring-violet-500/30' : ''
                }`}
              >
                {isRecommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-violet-600 text-[10px] font-semibold text-white uppercase tracking-wider shadow-lg shadow-violet-500/30">
                    Best Value
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-semibold text-emerald-400">
                    Current
                  </div>
                )}

                <Icon className={`w-7 h-7 ${style.iconColor} mb-3`} />
                <h3 className="text-base font-bold text-white mb-0.5">{plan.name}</h3>
                <p className="text-[11px] text-zinc-500 mb-3">{plan.description}</p>

                <div className="flex items-baseline gap-0.5 mb-4">
                  <span className="text-2xl font-bold text-white">${plan.price_usd}</span>
                  <span className="text-xs text-zinc-500">{plan.cycle}</span>
                </div>

                {/* Metered limits */}
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-500">QR Codes</span>
                    <span className="text-zinc-300 font-medium">{formatLimit(plan.limits.max_qr_codes)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-500">Scans / mo</span>
                    <span className="text-zinc-300 font-medium">{formatLimit(plan.limits.max_scans_per_month)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-500">Storage</span>
                    <span className="text-zinc-300 font-medium">{formatBytes(plan.limits.max_storage_bytes)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-500">Analytics</span>
                    <span className="text-zinc-300 font-medium">{plan.limits.analytics_days} days</span>
                  </div>
                </div>

                {/* Feature list */}
                <ul className="flex-1 space-y-1.5 mb-5">
                  {(Object.entries(plan.features) as [keyof typeof plan.features, boolean][])
                    .filter(([key]) => key !== 'custom_styling')
                    .map(([key, enabled]) => (
                      <li key={key} className="flex items-center gap-2">
                        {enabled ? (
                          <div className="w-3.5 h-3.5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                            <Check className="w-2 h-2 text-emerald-400" />
                          </div>
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                            <X className="w-2 h-2 text-zinc-600" />
                          </div>
                        )}
                        <span className={`text-[11px] ${enabled ? 'text-zinc-300' : 'text-zinc-600'}`}>
                          {FEATURE_LABELS[key]}
                        </span>
                      </li>
                    ))}
                </ul>

                <button
                  onClick={() => handleUpgrade(planId)}
                  disabled={isCurrentPlan || isDowngrade || loading === planId}
                  className={`w-full py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${
                    isCurrentPlan
                      ? 'border border-white/[0.08] text-zinc-500 cursor-default'
                      : isDowngrade
                      ? 'border border-white/[0.06] text-zinc-600 cursor-not-allowed'
                      : style.ctaStyle
                  }`}
                >
                  {loading === planId ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Processing...
                    </span>
                  ) : isCurrentPlan ? (
                    'Current Plan'
                  ) : isDowngrade ? (
                    'Downgrade via Billing'
                  ) : (
                    `Upgrade to ${plan.name}`
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Add-ons Section */}
        <div className="max-w-5xl mx-auto mb-12">
          <div
            className="flex items-center justify-between cursor-pointer rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 mb-4"
            onClick={() => setShowAddons(!showAddons)}
          >
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-violet-400" />
                Need more? Build your own add-ons
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Top up individual resources without changing your plan
              </p>
            </div>
            <span className="text-zinc-500 text-lg">{showAddons ? '−' : '+'}</span>
          </div>

          {showAddons && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {ADDONS.map(addon => {
                const qty = addonCart[addon.id] || 0;
                return (
                  <div
                    key={addon.id}
                    className={`relative rounded-xl bg-white/[0.02] border ${
                      addon.popular ? 'border-violet-500/30' : 'border-white/[0.06]'
                    } p-4 flex flex-col`}
                  >
                    {addon.popular && (
                      <div className="absolute -top-2 right-3 px-2 py-0.5 rounded-full bg-violet-600/80 text-[9px] font-semibold text-white uppercase">
                        Popular
                      </div>
                    )}
                    <div className="text-xs font-semibold text-white mb-1">{addon.name}</div>
                    <div className="text-[11px] text-zinc-500 mb-3 flex-1">{addon.description}</div>
                    <div className="flex items-baseline gap-0.5 mb-3">
                      <span className="text-lg font-bold text-white">${addon.price_usd}</span>
                      <span className="text-[11px] text-zinc-500">/mo</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-lg bg-white/[0.04] border border-white/[0.08]">
                        <button
                          className="px-2 py-1 text-zinc-400 hover:text-white transition-colors"
                          onClick={() => setAddonCart(prev => ({ ...prev, [addon.id]: Math.max(0, (prev[addon.id] || 0) - 1) }))}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 text-xs font-medium text-white min-w-[20px] text-center">{qty}</span>
                        <button
                          className="px-2 py-1 text-zinc-400 hover:text-white transition-colors"
                          onClick={() => setAddonCart(prev => ({ ...prev, [addon.id]: (prev[addon.id] || 0) + 1 }))}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      {qty > 0 && (
                        <button
                          className="flex-1 py-1.5 rounded-lg text-[11px] font-medium bg-violet-600/80 text-white hover:bg-violet-600 transition-colors"
                          onClick={() => handleBuyAddon(addon.id)}
                          disabled={addonLoading === addon.id}
                        >
                          {addonLoading === addon.id ? 'Processing...' : `Buy · $${addon.price_usd * qty}/mo`}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {addonTotal > 0 && (
            <div className="mt-4 rounded-xl bg-violet-500/5 border border-violet-500/20 p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-zinc-400">Add-on total: </span>
                <span className="text-sm font-bold text-white">${addonTotal.toFixed(2)}/mo</span>
              </div>
              <div className="text-[11px] text-zinc-500">
                💡 Tip: Compare with upgrading your plan — it might be cheaper!
              </div>
            </div>
          )}
        </div>

        {/* Comparison Table */}
        <div className="max-w-5xl mx-auto mb-12">
          <h2 className="text-sm font-semibold text-white text-center mb-6">Full Plan Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th className="text-left py-2 px-3 text-zinc-500 font-medium border-b border-white/[0.06]">Feature</th>
                  {PLAN_ORDER.map(pid => (
                    <th key={pid} className={`py-2 px-3 text-center font-semibold border-b border-white/[0.06] ${currentPlan === pid ? 'text-violet-400' : 'text-zinc-300'}`}>
                      {PLANS[pid].name}
                      {currentPlan === pid && <span className="block text-[9px] text-emerald-400 mt-0.5">Current</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Limits */}
                {(Object.keys(LIMIT_LABELS) as (keyof typeof LIMIT_LABELS)[]).map(key => (
                  <tr key={key} className="border-b border-white/[0.04]">
                    <td className="py-2 px-3 text-zinc-400">{LIMIT_LABELS[key]}</td>
                    {PLAN_ORDER.map(pid => {
                      const val = PLANS[pid].limits[key];
                      const display = key === 'max_storage_bytes'
                        ? formatBytes(val)
                        : key === 'analytics_days'
                        ? `${val} days`
                        : formatLimit(val);
                      return (
                        <td key={pid} className={`py-2 px-3 text-center font-medium ${currentPlan === pid ? 'text-violet-300' : 'text-zinc-300'}`}>
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Features */}
                {(Object.keys(FEATURE_LABELS) as (keyof typeof FEATURE_LABELS)[]).map(key => (
                  <tr key={key} className="border-b border-white/[0.04]">
                    <td className="py-2 px-3 text-zinc-400">{FEATURE_LABELS[key]}</td>
                    {PLAN_ORDER.map(pid => {
                      const enabled = PLANS[pid].features[key];
                      return (
                        <td key={pid} className="py-2 px-3 text-center">
                          {enabled
                            ? <Check className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                            : <X className="w-3.5 h-3.5 text-zinc-600 mx-auto" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Price row */}
                <tr>
                  <td className="py-3 px-3 text-zinc-300 font-semibold">Price</td>
                  {PLAN_ORDER.map(pid => (
                    <td key={pid} className={`py-3 px-3 text-center font-bold ${currentPlan === pid ? 'text-violet-400' : 'text-white'}`}>
                      ${PLANS[pid].price_usd}{PLANS[pid].price_usd > 0 ? '/mo' : ''}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto mb-12">
          <h2 className="text-sm font-semibold text-white text-center mb-6">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {[
              { q: 'Can I change plans anytime?', a: 'Yes. Upgrade instantly or downgrade at the end of your billing cycle. Changes take effect immediately on upgrade.' },
              { q: 'What happens when I downgrade?', a: 'You keep all existing QR codes, but new creation limits apply. Analytics history remains accessible within your plan\'s window.' },
              { q: 'Can I buy add-ons without a plan upgrade?', a: 'Absolutely! Add-ons stack on top of your current plan. Buy only what you need.' },
              { q: 'What if I exceed my scan limit?', a: 'QR codes will still work, but new scans won\'t be tracked in analytics. Buy a scan add-on to restore tracking.' },
              { q: 'Do you offer refunds?', a: 'Yes, within the first 7 days of any paid plan. No questions asked.' },
              { q: 'What payment methods do you accept?', a: 'We accept Visa, Mastercard, and local bank payments through PayHere.' },
            ].map(faq => (
              <div key={faq.q} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                <h3 className="text-xs font-medium text-zinc-200 mb-1">{faq.q}</h3>
                <p className="text-[11px] text-zinc-500">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Legal Links */}
        <div className="pb-12 text-center flex flex-col sm:flex-row items-center justify-center gap-4 text-xs font-medium text-zinc-600">
          <Link to="/legal/refund-policy" className="hover:text-zinc-300 transition-colors">Refund Policy</Link>
          <span className="hidden sm:inline w-1 h-1 rounded-full bg-zinc-700"></span>
          <Link to="/legal/privacy-policy" className="hover:text-zinc-300 transition-colors">Privacy Policy</Link>
          <span className="hidden sm:inline w-1 h-1 rounded-full bg-zinc-700"></span>
          <Link to="/legal/terms-and-conditions" className="hover:text-zinc-300 transition-colors">Terms & Conditions</Link>
        </div>
      </div>
    </div>
  );
}
