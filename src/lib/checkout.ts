import { apiFetch } from './api';
import type { BillingInterval, Currency } from './plans';

/**
 * Start a paid-plan checkout. LKR → PayHere (hosted form post). USD → Polar card checkout when enabled,
 * otherwise PayHere in USD. Shared by Pricing and Billing.
 */
export async function startCheckout(
  plan: 'pro' | 'team',
  interval: BillingInterval,
  currency: Currency,
  planData: { is_sandbox?: boolean; polar_enabled?: boolean } | null,
): Promise<void> {
  if (currency === 'USD' && planData?.polar_enabled) {
    const { url } = await apiFetch<{ url: string }>('/api/billing/polar/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan, interval }),
    });
    window.location.href = url;
    return;
  }

  const data = await apiFetch<Record<string, string>>('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan, interval, currency }),
  });
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = planData?.is_sandbox ? 'https://sandbox.payhere.lk/pay/checkout' : 'https://www.payhere.lk/pay/checkout';
  for (const [name, value] of Object.entries(data)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
