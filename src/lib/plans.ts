export type PlanId = 'free' | 'pro' | 'team';

export interface PlanLimits {
  qr_codes: number;
  monthly_scans: number;
  dynamic_qr: boolean;
  password_protect: boolean;
  expiry_gate: boolean;
  scan_limit_gate: boolean;
  visitor_guard_gate: boolean;
  analytics_days: number;
  custom_domain: boolean;
  api_access: boolean;
}

export type Currency = 'USD' | 'LKR';
export type BillingInterval = 'monthly' | 'annual';

// Single price source for checkout, Pricing, Billing and Landing. Annual = 10x monthly (2 months free).
// LKR is charged via PayHere; USD via Polar (Phase 1) or PayHere as fallback.
export const PRICES: Record<'pro' | 'team', Record<Currency, Record<BillingInterval, number>>> = {
  pro:  { USD: { monthly: 7,  annual: 70  }, LKR: { monthly: 2290, annual: 22900 } },
  team: { USD: { monthly: 29, annual: 290 }, LKR: { monthly: 9490, annual: 94900 } },
};

/** "LKR 2,290" / "$7". */
export function formatPrice(plan: 'pro' | 'team', currency: Currency, interval: BillingInterval): string {
  const n = PRICES[plan][currency][interval];
  return currency === 'USD' ? `$${n}` : `LKR ${n.toLocaleString('en-US')}`;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    qr_codes: 3,
    monthly_scans: 1000,
    dynamic_qr: false,
    password_protect: false,
    expiry_gate: false,
    scan_limit_gate: false,
    visitor_guard_gate: false,
    analytics_days: 7,
    custom_domain: false,
    api_access: false,
  },
  pro: {
    qr_codes: Infinity,
    monthly_scans: 75000,
    dynamic_qr: true,
    password_protect: true,
    expiry_gate: true,
    scan_limit_gate: true,
    visitor_guard_gate: true,
    analytics_days: 90,
    custom_domain: false,
    api_access: false,
  },
  team: {
    qr_codes: Infinity,
    monthly_scans: 500000,
    dynamic_qr: true,
    password_protect: true,
    expiry_gate: true,
    scan_limit_gate: true,
    visitor_guard_gate: true,
    analytics_days: 365,
    custom_domain: true,
    api_access: true,
  },
};

// Trial gets all Pro features but capped at Free's QR code limit.
// This is the conversion hook: users see Pro features but must upgrade to create more QRs.
export const TRIAL_LIMITS: PlanLimits = {
  ...PLANS.pro,
  qr_codes: PLANS.free.qr_codes, // 3 QRs max during trial
};

export interface UserAddons {
  extra_scans: number;
  extra_qr_codes: number;
  custom_domain: boolean;
  api_access: boolean;
}

export const DEFAULT_ADDONS: UserAddons = {
  extra_scans: 0,
  extra_qr_codes: 0,
  custom_domain: false,
  api_access: false,
};
