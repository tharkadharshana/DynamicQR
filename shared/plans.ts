/**
 * ═══════════════════════════════════════════════════════════════
 *  SCNR — Plan Configuration (Single Source of Truth)
 * ═══════════════════════════════════════════════════════════════
 *
 *  Edit PLANS and ADDONS below to change pricing, limits, or
 *  features across the entire app (frontend + backend).
 *
 *  This file is imported by both the Express server and the
 *  React frontend via the 'src/shared/' alias.
 */

// ─── Types ────────────────────────────────────────────────────

export type PlanId = 'free' | 'starter' | 'pro' | 'business';

export interface PlanLimits {
  /** Max active QR codes. -1 = unlimited */
  max_qr_codes: number;
  /** Max scans per calendar month. -1 = unlimited */
  max_scans_per_month: number;
  /** Max storage in bytes. -1 = unlimited */
  max_storage_bytes: number;
  /** Analytics retention in days */
  analytics_days: number;
}

export interface PlanFeatures {
  dynamic_qr: boolean;
  logo_embedding: boolean;
  custom_domain: boolean;
  password_protect: boolean;
  api_access: boolean;
  white_label: boolean;
  webhook: boolean;
  advanced_analytics: boolean;
  bulk_qr: boolean;
  custom_styling: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  price_usd: number;          // monthly price in USD (0 = free)
  cycle: string;               // display string e.g. "/month" or "forever"
  description: string;
  limits: PlanLimits;
  features: PlanFeatures;
  /** Rank for comparison: higher = more premium */
  rank: number;
  /** PayHere recurrence string */
  recurrence: string;
  /** PayHere duration string */
  duration: string;
}

export type AddonCategory = 'qr_codes' | 'scans' | 'storage' | 'analytics';

export interface Addon {
  id: string;
  name: string;
  description: string;
  price_usd: number;          // monthly price in USD
  category: AddonCategory;
  /** How much to add to the relevant limit */
  value: number;
  /** Human-readable label for the value */
  value_label: string;
  /** Popular flag for UI highlighting */
  popular?: boolean;
}

// ─── Plans Configuration ──────────────────────────────────────
// Edit these to change plan limits, pricing, or features.
// The frontend and backend both read from this object.

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    price_usd: 0,
    cycle: 'forever',
    description: 'Get started with basic QR codes',
    rank: 0,
    recurrence: '',
    duration: '',
    limits: {
      max_qr_codes: 3,
      max_scans_per_month: 500,
      max_storage_bytes: 5 * 1024 * 1024,           // 5 MB
      analytics_days: 7,
    },
    features: {
      dynamic_qr: false,
      logo_embedding: false,
      custom_domain: false,
      password_protect: false,
      api_access: false,
      white_label: false,
      webhook: false,
      advanced_analytics: false,
      bulk_qr: false,
      custom_styling: true,             // basic styling is free
    },
  },

  starter: {
    id: 'starter',
    name: 'Starter',
    price_usd: 5,
    cycle: '/month',
    description: 'For individuals who need more',
    rank: 1,
    recurrence: '1 Month',
    duration: 'Forever',
    limits: {
      max_qr_codes: 15,
      max_scans_per_month: 10_000,
      max_storage_bytes: 50 * 1024 * 1024,           // 50 MB
      analytics_days: 30,
    },
    features: {
      dynamic_qr: true,
      logo_embedding: false,
      custom_domain: false,
      password_protect: true,
      api_access: false,
      white_label: false,
      webhook: false,
      advanced_analytics: false,
      bulk_qr: false,
      custom_styling: true,
    },
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    price_usd: 12,
    cycle: '/month',
    description: 'For professionals & small teams',
    rank: 2,
    recurrence: '1 Month',
    duration: 'Forever',
    limits: {
      max_qr_codes: 100,
      max_scans_per_month: 100_000,
      max_storage_bytes: 500 * 1024 * 1024,          // 500 MB
      analytics_days: 90,
    },
    features: {
      dynamic_qr: true,
      logo_embedding: true,
      custom_domain: false,
      password_protect: true,
      api_access: false,
      white_label: false,
      webhook: true,
      advanced_analytics: true,
      bulk_qr: false,
      custom_styling: true,
    },
  },

  business: {
    id: 'business',
    name: 'Business',
    price_usd: 29,
    cycle: '/month',
    description: 'For growing businesses & agencies',
    rank: 3,
    recurrence: '1 Month',
    duration: 'Forever',
    limits: {
      max_qr_codes: -1,                               // unlimited
      max_scans_per_month: -1,                         // unlimited
      max_storage_bytes: 5 * 1024 * 1024 * 1024,      // 5 GB
      analytics_days: 365,
    },
    features: {
      dynamic_qr: true,
      logo_embedding: true,
      custom_domain: true,
      password_protect: true,
      api_access: true,
      white_label: true,
      webhook: true,
      advanced_analytics: true,
      bulk_qr: true,
      custom_styling: true,
    },
  },
};

// ─── Add-ons Configuration ────────────────────────────────────
// Priced slightly above plan-equivalent to nudge upgrades.

export const ADDONS: Addon[] = [
  // QR Codes
  {
    id: 'qr_10',
    name: '+10 QR Codes',
    description: '10 additional active QR codes',
    price_usd: 2,
    category: 'qr_codes',
    value: 10,
    value_label: '10 QR codes',
  },
  {
    id: 'qr_50',
    name: '+50 QR Codes',
    description: '50 additional active QR codes',
    price_usd: 8,
    category: 'qr_codes',
    value: 50,
    value_label: '50 QR codes',
    popular: true,
  },

  // Scans
  {
    id: 'scans_10k',
    name: '+10,000 Scans',
    description: '10K additional scans per month',
    price_usd: 3,
    category: 'scans',
    value: 10_000,
    value_label: '10K scans/mo',
  },
  {
    id: 'scans_100k',
    name: '+100,000 Scans',
    description: '100K additional scans per month',
    price_usd: 8,
    category: 'scans',
    value: 100_000,
    value_label: '100K scans/mo',
    popular: true,
  },

  // Storage
  {
    id: 'storage_100mb',
    name: '+100 MB Storage',
    description: '100 MB additional storage',
    price_usd: 2,
    category: 'storage',
    value: 100 * 1024 * 1024,
    value_label: '100 MB',
  },
  {
    id: 'storage_500mb',
    name: '+500 MB Storage',
    description: '500 MB additional storage',
    price_usd: 5,
    category: 'storage',
    value: 500 * 1024 * 1024,
    value_label: '500 MB',
  },

  // Analytics
  {
    id: 'analytics_30d',
    name: '+30 Days Analytics',
    description: 'Extend analytics window by 30 days',
    price_usd: 2,
    category: 'analytics',
    value: 30,
    value_label: '30 days',
  },
  {
    id: 'analytics_90d',
    name: '+90 Days Analytics',
    description: 'Extend analytics window by 90 days',
    price_usd: 4,
    category: 'analytics',
    value: 90,
    value_label: '90 days',
  },
];

// ─── Helper Functions ─────────────────────────────────────────

/** Get plan by ID with fallback to free */
export function getPlan(planId: string): Plan {
  return PLANS[planId as PlanId] || PLANS.free;
}

/** Get addon by ID */
export function getAddon(addonId: string): Addon | undefined {
  return ADDONS.find(a => a.id === addonId);
}

/** Check if a limit is "unlimited" (-1) */
export function isUnlimited(value: number): boolean {
  return value === -1;
}

/** Format a limit value for display */
export function formatLimit(value: number, type: 'number' | 'bytes' = 'number'): string {
  if (value === -1) return 'Unlimited';
  if (type === 'bytes') return formatBytes(value);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toString();
}

/** Format bytes to human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes === -1) return 'Unlimited';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val % 1 === 0 ? val : val.toFixed(1)} ${units[i]}`;
}

/**
 * Compute effective limits by merging plan base limits with
 * active add-ons. Called by both frontend and backend.
 */
export interface ActiveAddon {
  addon_id: string;
  quantity: number;       // how many times this add-on was purchased
  purchased_at?: string;
  order_id?: string;
}

export function computeEffectiveLimits(
  planId: string,
  activeAddons: ActiveAddon[] = []
): PlanLimits {
  const plan = getPlan(planId);
  const limits = { ...plan.limits };

  for (const active of activeAddons) {
    const addon = getAddon(active.addon_id);
    if (!addon) continue;

    const totalValue = addon.value * (active.quantity || 1);

    switch (addon.category) {
      case 'qr_codes':
        if (limits.max_qr_codes !== -1) limits.max_qr_codes += totalValue;
        break;
      case 'scans':
        if (limits.max_scans_per_month !== -1) limits.max_scans_per_month += totalValue;
        break;
      case 'storage':
        if (limits.max_storage_bytes !== -1) limits.max_storage_bytes += totalValue;
        break;
      case 'analytics':
        limits.analytics_days += totalValue;
        break;
    }
  }

  return limits;
}

/** All plan IDs in display order */
export const PLAN_ORDER: PlanId[] = ['free', 'starter', 'pro', 'business'];

/** Feature display labels for comparison tables */
export const FEATURE_LABELS: Record<keyof PlanFeatures, string> = {
  dynamic_qr: 'Dynamic QR codes',
  logo_embedding: 'Logo embedding',
  custom_domain: 'Custom domain',
  password_protect: 'Password protection',
  api_access: 'REST API access',
  white_label: 'White-label option',
  webhook: 'Webhook integration',
  advanced_analytics: 'Advanced analytics',
  bulk_qr: 'Bulk QR generation',
  custom_styling: 'QR styling & colors',
};

/** Limit display labels */
export const LIMIT_LABELS: Record<keyof PlanLimits, string> = {
  max_qr_codes: 'QR codes',
  max_scans_per_month: 'Scans / month',
  max_storage_bytes: 'Storage',
  analytics_days: 'Analytics window',
};
