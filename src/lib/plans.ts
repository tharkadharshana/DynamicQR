export type PlanId = 'free' | 'pro' | 'team';

export interface PlanLimits {
  qr_codes: number;
  monthly_scans: number;
  dynamic_qr: boolean;
  password_protect: boolean;
  expiry_gate: boolean;
  scan_limit_gate: boolean;
  analytics_days: number;
  custom_domain: boolean;
  api_access: boolean;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    qr_codes: 3,
    monthly_scans: 1000,
    dynamic_qr: false,
    password_protect: false,
    expiry_gate: false,
    scan_limit_gate: false,
    analytics_days: 7,
    custom_domain: false,
    api_access: false,
  },
  pro: {
    qr_codes: Infinity,
    monthly_scans: 50000,
    dynamic_qr: true,
    password_protect: true,
    expiry_gate: true,
    scan_limit_gate: true,
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

export type AddonId = 'extra_scans_50k' | 'extra_qr_5';

export interface Addon {
  id: AddonId;
  label: string;
  amount_usd: number;
  grants: {
    extra_scans?: number;
    extra_qr_codes?: number;
    custom_domain?: boolean;
    api_access?: boolean;
  };
}

export const ADDONS: Record<AddonId, Addon> = {
  extra_scans_50k: {
    id: 'extra_scans_50k',
    label: '50,000 Extra Scans',
    amount_usd: 5.0,
    grants: { extra_scans: 50000 },
  },
  extra_qr_5: {
    id: 'extra_qr_5',
    label: '5 Extra QR Codes',
    amount_usd: 10.0,
    grants: { extra_qr_codes: 5 },
  },
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
