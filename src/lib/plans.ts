export const PLANS = {
  free: {
    qr_codes: 3,
    monthly_scans: 1000,
    analytics_days: 7,
    password_protect: false,
    scan_limit_gate: false,
    expiry_gate: false,
    custom_domain: false,
    white_label: false,
    api_access: false,
    dynamic_qr: false,
  },
  pro: {
    qr_codes: Infinity,
    monthly_scans: 50000,
    analytics_days: 90,
    password_protect: true,
    scan_limit_gate: true,
    expiry_gate: true,
    custom_domain: false,
    white_label: false,
    api_access: false,
    dynamic_qr: true,
  },
  team: {
    qr_codes: Infinity,
    monthly_scans: 500000,
    analytics_days: 365,
    password_protect: true,
    scan_limit_gate: true,
    expiry_gate: true,
    custom_domain: true,
    white_label: true,
    api_access: true,
    dynamic_qr: true,
  },
} as const;

export type PlanId = keyof typeof PLANS;

// Trial gives Pro limits but with Free's qr_codes cap
export const TRIAL_LIMITS = {
  ...PLANS.pro,
  qr_codes: PLANS.free.qr_codes,   // 3 QRs during trial
};

export const ADDONS = {
  extra_scans_100k: {
    id: 'extra_scans_100k',
    label: '100,000 extra scans/month',
    amount_usd: 4,
    applies_to: ['free', 'pro', 'team'],
    grants: { extra_scans: 100000 },
  },
  extra_scans_500k: {
    id: 'extra_scans_500k',
    label: '500,000 extra scans/month',
    amount_usd: 15,
    applies_to: ['free', 'pro', 'team'],
    grants: { extra_scans: 500000 },
  },
  extra_qr_5: {
    id: 'extra_qr_5',
    label: '5 extra QR codes',
    amount_usd: 3,
    applies_to: ['free'],   // Only makes sense on free plan
    grants: { extra_qr_codes: 5 },
  },
  custom_domain: {
    id: 'custom_domain',
    label: 'Custom domain',
    amount_usd: 10,
    applies_to: ['pro'],
    grants: { custom_domain: true },
  },
  api_access: {
    id: 'api_access',
    label: 'API access',
    amount_usd: 15,
    applies_to: ['pro'],
    grants: { api_access: true },
  },
} as const;

export type AddonId = keyof typeof ADDONS;

export type UserAddons = {
  extra_scans: number;
  extra_qr_codes: number;
  custom_domain: boolean;
  white_label: boolean;
  api_access: boolean;
};

export const DEFAULT_ADDONS: UserAddons = {
  extra_scans: 0,
  extra_qr_codes: 0,
  custom_domain: false,
  white_label: false,
  api_access: false,
};
