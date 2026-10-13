export type PlanId = 'free' | 'pro' | 'team' | 'business';
export type PaidPlan = Exclude<PlanId, 'free'>;

export interface PlanLimits {
  qr_codes: number;          // active codes (static + dynamic). No plan is unlimited.
  dynamic_qr_codes: number;  // active dynamic codes; Free keeps 1 pilot forever
  monthly_scans: number;
  dynamic_qr: boolean;
  password_protect: boolean;
  expiry_gate: boolean;
  scan_limit_gate: boolean;
  visitor_guard_gate: boolean;
  analytics_days: number;
  custom_domains: number;
  api_access: boolean;
  seats: number;          // users including the owner
  workspaces: number;
  bulk_create: boolean;   // CSV import + print sheet
  short_links: number;    // kind='link' rows; do not count against qr_codes
  custom_slug: boolean;   // custom back-half on create (Phase 8)
  pages: number;          // qr_type='page' rows (also count as dynamic codes)
  forms: number;          // qr_type='form' rows (also count as dynamic codes)
  webhooks: boolean;
  gps_tracking: boolean;
  smart_routing: boolean;
  remove_branding: boolean;
  file_mb: number;        // max upload size
}

export type Currency = 'USD' | 'LKR';
export type BillingInterval = 'monthly' | 'annual';

// Single price source for checkout, Pricing, Billing and Landing. Annual = 10x monthly (2 months free).
// LKR is charged via PayHere; USD via Polar (Phase 1) or PayHere as fallback.
// LKR ≈ 327 per USD, rounded to a 90 ending.
export const PRICES: Record<PaidPlan, Record<Currency, Record<BillingInterval, number>>> = {
  pro:      { USD: { monthly: 7,  annual: 70  }, LKR: { monthly: 2290,  annual: 22900  } },
  team:     { USD: { monthly: 29, annual: 290 }, LKR: { monthly: 9490,  annual: 94900  } },
  business: { USD: { monthly: 79, annual: 790 }, LKR: { monthly: 25990, annual: 259900 } },
};

export const PAID_PLANS = Object.keys(PRICES) as PaidPlan[];

/** "LKR 2,290" / "$7". */
export function formatPrice(plan: PaidPlan, currency: Currency, interval: BillingInterval): string {
  const n = PRICES[plan][currency][interval];
  return currency === 'USD' ? `$${n}` : `LKR ${n.toLocaleString('en-US')}`;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    qr_codes: 3,
    dynamic_qr_codes: 1,  // permanent free dynamic pilot
    monthly_scans: 1000,
    dynamic_qr: true,
    password_protect: false,
    expiry_gate: false,
    scan_limit_gate: false,
    visitor_guard_gate: false,
    analytics_days: 90,
    custom_domains: 0,
    api_access: false,
    seats: 1,
    workspaces: 1,
    bulk_create: false,
    short_links: 3,
    custom_slug: false,
    pages: 1,
    forms: 0,
    webhooks: false,
    gps_tracking: false,
    smart_routing: false,
    remove_branding: false,
    file_mb: 5,
  },
  pro: {
    qr_codes: 100,
    dynamic_qr_codes: 100,
    monthly_scans: 75000,
    dynamic_qr: true,
    password_protect: true,
    expiry_gate: true,
    scan_limit_gate: true,
    visitor_guard_gate: true,
    analytics_days: 365,  // 12 months on the mid tier
    custom_domains: 1,
    api_access: false,
    seats: 1,
    workspaces: 1,
    bulk_create: false,
    short_links: 100,
    custom_slug: true,
    pages: 5,
    forms: 3,
    webhooks: false,
    gps_tracking: true,
    smart_routing: true,
    remove_branding: true,
    file_mb: 20,
  },
  team: {
    qr_codes: 600,
    dynamic_qr_codes: 600,
    monthly_scans: 500000,
    dynamic_qr: true,
    password_protect: true,
    expiry_gate: true,
    scan_limit_gate: true,
    visitor_guard_gate: true,
    analytics_days: 730,
    custom_domains: 10,
    api_access: true,
    seats: 10,
    workspaces: 1,
    bulk_create: true,
    short_links: 600,
    custom_slug: true,
    pages: 50,
    forms: 20,
    webhooks: false,
    gps_tracking: true,
    smart_routing: true,
    remove_branding: true,
    file_mb: 50,
  },
  business: {
    qr_codes: 2000,
    dynamic_qr_codes: 2000,
    monthly_scans: 2000000,
    dynamic_qr: true,
    password_protect: true,
    expiry_gate: true,
    scan_limit_gate: true,
    visitor_guard_gate: true,
    analytics_days: 1825,
    custom_domains: 50,
    api_access: true,
    seats: 25,
    workspaces: 10,
    bulk_create: true,
    short_links: 2000,
    custom_slug: true,
    pages: 400,
    forms: 100,
    webhooks: true,
    gps_tracking: true,
    smart_routing: true,
    remove_branding: true,
    file_mb: 100,
  },
};

// Trial gets all Pro features but capped at Free's QR code count.
// This is the conversion hook: users see Pro features but must upgrade to create more QRs.
export const TRIAL_LIMITS: PlanLimits = {
  ...PLANS.pro,
  qr_codes: PLANS.free.qr_codes,
  dynamic_qr_codes: PLANS.free.qr_codes,
  short_links: PLANS.free.short_links,
  pages: PLANS.free.pages,
  forms: PLANS.free.forms,
  custom_domains: PLANS.free.custom_domains, // a domain is a real Cloudflare hostname: paid only
};

// Lapsed trial or plan: dynamic codes above the allowance keep working this long, then pause.
export const GRACE_DAYS = 30;

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

const n = (x: number) => x.toLocaleString('en-US');

/**
 * The feature list every pricing surface shows, generated from PLANS so there is no second copy.
 * ponytail: lists shipped features only; add a line here in the phase that ships a feature. Pricing must never claim what the app can't do yet.
 */
export function planFeatures(plan: PlanId): string[] {
  const l = PLANS[plan];
  return [
    plan === 'free' ? `${l.qr_codes} QR codes in total (${l.dynamic_qr_codes} dynamic)` : `${n(l.dynamic_qr_codes)} dynamic QR codes in total`,
    `${n(l.short_links)} short links, ${n(l.pages)} hosted page${l.pages === 1 ? '' : 's'}${l.forms ? `, ${n(l.forms)} forms` : ''}`,
    `${n(l.monthly_scans)} scans per month`,
    `${l.analytics_days >= 365 ? `${l.analytics_days / 365} year${l.analytics_days === 365 ? '' : 's'}` : `${l.analytics_days} days`} of analytics`,
    'Colours, shapes and logo',
    ...(l.password_protect ? ['PIN, expiry, scan limits and Visitor Guard'] : []),
    ...(l.custom_slug ? ['Custom back-halves for links'] : []),
    ...(l.smart_routing ? ['Smart routing and GPS tracking'] : []),
    ...(l.remove_branding ? ['No Scnr branding'] : []),
    ...(l.custom_domains ? [`${l.custom_domains} custom domain${l.custom_domains === 1 ? '' : 's'}`] : []),
    ...(l.seats > 1 ? [`${l.seats} team members${l.workspaces > 1 ? `, ${l.workspaces} workspaces` : ''}`] : []),
    ...(l.api_access ? ['API, bulk create and CSV export'] : []),
    ...(l.webhooks ? ['Webhooks'] : []),
  ];
}

/** Self-check: npx tsx src/lib/plans.ts */
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('plans.ts')) {
  const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
  for (const p of PAID_PLANS) {
    for (const c of ['USD', 'LKR'] as Currency[]) assert(PRICES[p][c].annual === PRICES[p][c].monthly * 10, `${p} ${c} annual = 10x`);
    assert(Math.abs(PRICES[p].LKR.monthly / PRICES[p].USD.monthly - 327) < 6, `${p} LKR ratio`);
  }
  assert(formatPrice('business', 'LKR', 'monthly') === 'LKR 25,990', 'business LKR');
  const order: PlanId[] = ['free', 'pro', 'team', 'business'];
  for (const k of Object.keys(PLANS.free) as (keyof PlanLimits)[]) {
    order.slice(1).forEach((p, i) => assert(Number(PLANS[p][k]) >= Number(PLANS[order[i]][k]), `${k} never shrinks on ${p}`));
  }
  assert(PLANS.free.analytics_days === 90 && PLANS.free.forms === 0 && PLANS.business.workspaces === 10, 'table values');
  assert(planFeatures('free')[0] === '3 QR codes in total (1 dynamic)', planFeatures('free')[0]);
  assert(planFeatures('free')[3] === '90 days of analytics' && planFeatures('team')[3] === '2 years of analytics', 'history wording');
  assert(planFeatures('business').includes('25 team members, 10 workspaces') && planFeatures('team').includes('10 team members') && !planFeatures('pro').some(f => f.includes('team members')), 'seats');
  assert(planFeatures('business').includes('Webhooks') && !planFeatures('team').includes('Webhooks') && planFeatures('team').includes('10 custom domains') && planFeatures('pro').includes('1 custom domain'), 'webhooks and domains');
  console.log('plans self-check ok');
}
