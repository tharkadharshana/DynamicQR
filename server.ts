import 'dotenv/config';

import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://missing-supabase-url.supabase.co';
// Never read a service key from a VITE_* name: Vite inlines VITE_* vars into the browser bundle.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'missing-service-role-key';

export const supabase = createClient(supabaseUrl, supabaseKey);

import crypto from 'crypto';
import { customAlphabet } from 'nanoid';
import logger from "./logger.js";
import { renderGuestPage, pickLang, appTarget, FILE_TYPES, blockTarget } from './src/lib/guestPage.js';
import { gtinValid } from './src/lib/qrContent.js';
import { buildDigest } from './src/lib/digest.js';
import { PLANS, TRIAL_LIMITS, GRACE_DAYS, DEFAULT_ADDONS, PRICES, PAID_PLANS, PlanId, PaidPlan, PlanLimits, UserAddons, Currency, BillingInterval } from './src/lib/plans.js';

// Direct table helpers (replaced the Firestore-compat shim in Phase 3).
async function row(table: string, col: string, val: string): Promise<any | null> {
  const { data, error } = await supabase.from(table).select('*').eq(col, val).maybeSingle();
  if (error) {
    logger.error('DB read failed', { table, code: error.code, detail: error.message });
    throw new Error(`Database error: ${error.message}`);
  }
  return data;
}
async function rows(table: string, col: string, val: string): Promise<any[]> {
  const { data, error } = await supabase.from(table).select('*').eq(col, val);
  if (error) {
    logger.error('DB query failed', { table, code: error.code, detail: error.message });
    throw new Error(`Database query error: ${error.message}`);
  }
  return data || [];
}
async function statsFor(slugs: string[], columns = '*'): Promise<any[]> {
  if (!slugs.length) return [];
  const { data, error } = await supabase.from('qr_stats').select(columns).in('slug', slugs);
  if (error) throw new Error(`Database query error: ${error.message}`);
  return (data || []) as any[];
}
const toDate = (val: any): Date | null => (val ? new Date(val) : null);
const nowIso = () => new Date().toISOString();

export const app = express();

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  logger.info(`Starting server in ${process.env.NODE_ENV} mode`);
  
  // CORS configuration
  const corsOrigin = process.env.APP_URL;
  if (!corsOrigin && process.env.NODE_ENV === 'production') {
    logger.error('CRITICAL: APP_URL environment variable is missing in production. Server exiting.');
    process.exit(1);
  }
  
  logger.info(`CORS Origin: ${corsOrigin || '*'}`);
  
  // Security headers (helmet) — CSP disabled to allow Supabase OAuth popup
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,   // overridden below for OAuth
    crossOriginResourcePolicy: false, // overridden below for OAuth
  }));

  // Required for Supabase OAuth popup flow
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

  app.use(cors({
    origin: corsOrigin || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-internal-secret']
  }));

  // Keep the raw bytes too: webhook signatures (Polar) are computed over the exact body.
  // Public REST API (Team): /api/v1/* are the same routes as /api/*.
  app.use((req, _res, next) => { if (req.url.startsWith('/api/v1/')) req.url = '/api/' + req.url.slice(8); next(); });

  app.use(express.json({ limit: '100kb', verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));

  // ── Rate Limiting ────────────────────────────────────────────────────────────
  // Global: applied to all routes
  // Limits per IP per window. Overridable for the QA suite, which runs everything from one IP.
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    skip: (req) => req.headers['x-internal-secret'] === process.env.INTERNAL_SECRET,
  });

  // Tighter limit for write operations (create/delete/billing)
  const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_WRITE_MAX) || 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    skip: (req) => req.headers['x-internal-secret'] === process.env.INTERNAL_SECRET,
  });

  // Webhook: separate window — PayHere can retry legitimately
  const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many webhook calls.' },
  });

  app.use(globalLimiter);
  // ────────────────────────────────────────────────────────────────────────────

  // ── Request ID + HTTP access log ───────────────────────────────────────────
  app.use((req, res, next) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    (req as any).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const uid = (req as any).user?.uid;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger[level](`${req.method} ${req.path} ${res.statusCode}`, {
        requestId,
        ms,
        uid: uid ?? undefined,
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ?? req.socket.remoteAddress,
        ua: req.headers['user-agent']?.slice(0, 80),
      });
    });
    next();
  });
  // ──────────────────────────────────────────────────────────────────────────

  const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

  // Owner uid when this user is a member of a Team workspace (invite claimed on first sign-in).
  // ponytail: one indexed query per authenticated request; cache per token if it shows up in latency.
  async function workspaceOwner(user: any): Promise<string | null> {
    const email = String(user.email || '').toLowerCase().replace(/"/g, '');
    const { data, error } = await supabase.from('workspace_members').select('id, owner_uid, member_uid')
      .or(`member_uid.eq.${user.id},member_email.eq."${email}"`).limit(1);
    const m = !error && data?.[0];
    if (!m || m.owner_uid === user.id) return null;
    const license = await getLicense(m.owner_uid);
    if (license.limits.seats <= 1) return null; // owner no longer on a multi-seat plan
    if (!m.member_uid) await supabase.from('workspace_members').update({ member_uid: user.id }).eq('id', m.id);
    return m.owner_uid;
  }

  // Middlewares
  const authenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        logger.warn(`Missing or invalid auth header for ${req.path}`, { 
          hasAuthHeader: !!authHeader,
          authHeaderStart: authHeader?.substring(0, 10)
        });
        return res.status(401).send('Unauthorized');
      }
      const token = authHeader.split('Bearer ')[1];

      // API key (Team): acts as the key's owner; never for billing/team/keys (see sessionOwner).
      if (token.startsWith('sk_live_')) {
        const { data: key } = await supabase.from('api_keys').select('id, uid').eq('key_hash', sha256(token)).is('revoked_at', null).maybeSingle();
        if (!key) return res.status(401).json({ error: 'Invalid or revoked API key' });
        const license = await getLicense(key.uid);
        if (!license.limits.api_access) return res.status(403).json({ error: 'API access requires the Team or Business plan', code: 'FEATURE_API' });
        (req as any).user = { uid: key.uid, realUid: key.uid, email: null, viaApiKey: true };
        supabase.from('api_keys').update({ last_used_at: nowIso() }).eq('id', key.id).then(() => {});
        return next();
      }

      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) throw error || new Error("User not found");
      // Team members act on the owner's workspace (uid); realUid is who signed in.
      const owner = await workspaceOwner(user);
      (req as any).user = { ...user, uid: owner || user.id, realUid: user.id, email: user.email, isMember: !!owner };
      next();
    } catch (error: any) {
      logger.error(`Auth error for ${req.path}:`, { 
        message: error.message,
        code: error.code,
        stack: error.stack?.substring(0, 500)
      });
      res.status(401).send(`Unauthorized: ${error.message || 'Invalid token'}`);
    }
  };

  // Owner-only actions: never through an API key, never by a team member.
  const sessionOwner = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const u = (req as any).user;
    if (u?.viaApiKey) return res.status(403).json({ error: 'Not available with an API key', code: 'SESSION_ONLY' });
    if (u?.isMember) return res.status(403).json({ error: 'Only the account owner can do this', code: 'OWNER_ONLY' });
    next();
  };

  const requireOwnership = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const { slug } = req.params;
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).send('Unauthorized');

      const qr = await row('qr_codes', 'slug', slug);
      if (!qr) return res.status(404).send('Not found');
      if (qr.user_uid !== user.uid) {
        return res.status(403).send('Forbidden');
      }
      (req as any).qr = qr;
      next();
    } catch (error) {
      logger.error('Ownership check error:', error);
      res.status(500).send('Internal Server Error');
    }
  };

  const QR_TYPES = ['url', 'vcard', 'wifi', 'text', 'email', 'page', 'event'];
  // GTIN-14 as stored (unique) and encoded in the GS1 Digital Link path. null clears it.
  const normGtin = (g: unknown) => (g === null || g === '' ? null : gtinValid(g) ? String(g).padStart(14, '0') : undefined);
  // A short link is a dynamic URL row with kind='link': no QR image, counted against short_links only.
  const isLink = (q: any) => q.kind === 'link';
  // Per-object caps on top of the QR caps. Pages and forms are QR codes too; links are not.
  const OBJECT_CAPS = [
    { field: 'short_links', code: 'LIMIT_SHORT_LINKS', is: (q: any) => isLink(q) },
    { field: 'pages', code: 'LIMIT_PAGES', is: (q: any) => q.qr_type === 'page' },
    { field: 'forms', code: 'LIMIT_FORMS', is: (q: any) => q.qr_type === 'form' },
  ] as const;

  /** Plan caps for one more active row like `next` (create or reactivate). Returns the 403 body, or null if it fits. */
  async function capError(uid: string, limits: PlanLimits, next: { slug?: string; kind?: string; qr_type?: string; is_dynamic?: boolean }) {
    // `next` itself is left out of the counts, so an edit of an existing row is checked like a create.
    const active = (await rows('qr_codes', 'user_uid', uid)).filter(q => q.is_active !== false && q.slug !== next.slug);
    for (const cap of OBJECT_CAPS) {
      if (!cap.is(next)) continue;
      const current = active.filter(cap.is).length, limit = limits[cap.field];
      if (current >= limit) return { error: `Your plan includes ${limit} ${cap.field.replace('_', ' ')}. Upgrade for more.`, code: cap.code, limit, current };
    }
    if (isLink(next)) return null;
    const codes = active.filter(q => !isLink(q));
    if (limits.qr_codes !== -1 && codes.length >= limits.qr_codes) {
      return { error: 'Plan limit reached. Upgrade to create more QRs.', code: 'LIMIT_QR_CODES', limit: limits.qr_codes, current: codes.length };
    }
    const dynamic = codes.filter(q => q.is_dynamic !== false).length;
    if (next.is_dynamic !== false && dynamic >= limits.dynamic_qr_codes) {
      return { error: 'Dynamic QR limit reached. Upgrade for more dynamic codes.', code: 'LIMIT_DYNAMIC_QR', limit: limits.dynamic_qr_codes, current: dynamic };
    }
    return null;
  }
  const CONTENT_MAX = 20_000;

  // Activation funnel (see migrations/queries.sql). Never blocks or fails the request.
  const logEvent = (uid: string, name: string, slug: string | null) => {
    supabase.from('events').insert({ uid, name, slug }).then(({ error }) => {
      if (error) logger.warn('Event write failed', { name, code: error.code });
    });
  };

  // Never send the PIN hash to a browser.
  const publicQr = ({ password_hash, ...qr }: any) => ({ ...qr, has_password: !!password_hash });

  // Drop the Worker's cached config so an edit is live on the next scan (else up to the 300s KV TTL).
  // The Worker owns /internal/purge on APP_URL's domain.
  const purgeEdge = (slug: string) => {
    const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    return fetch(`${appUrl}/internal/purge/${slug}`, {
      headers: { 'x-internal-secret': process.env.INTERNAL_SECRET || '' },
      signal: AbortSignal.timeout(3000),
    }).catch(err => logger.error(`Cache purge failed for ${slug}`, { error: err.message }));
  };

  // API routes
  app.get('/api/health', (req, res) => {
    const envStatus = {
      NODE_ENV: process.env.NODE_ENV,
      APP_URL: process.env.APP_URL ? 'set' : 'missing',
      SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL ? 'set' : 'missing',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'missing',
      INTERNAL_SECRET: process.env.INTERNAL_SECRET ? 'set' : 'missing',
      VERCEL: process.env.VERCEL ? 'true' : 'false'
    };
    
    const criticalMissing = [];
    if (!process.env.APP_URL) criticalMissing.push('APP_URL');
    if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) criticalMissing.push('SUPABASE_URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) criticalMissing.push('SUPABASE_SERVICE_ROLE_KEY');
    
    res.json({ 
      status: criticalMissing.length === 0 ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      environment: envStatus,
      critical_missing: criticalMissing
    });
  });

  // Verified custom short domain (Team), or null. Missing table (before migration 004) → null.
  async function activeDomain(uid: string): Promise<string | null> {
    const { data } = await supabase.from('custom_domains').select('hostname, status').eq('uid', uid).maybeSingle();
    return data?.status === 'active' ? data.hostname : null;
  }

  async function getLicense(uid: string): Promise<{
    effectivePlan: PlanId;
    limits: typeof PLANS[PlanId];
    isTrial: boolean;
    isExpired: boolean;
    addons: UserAddons;
    monthlyUsed: number;
    graceEndsAt: Date | null;  // set when on Free after a trial/plan ended; excess dynamic codes pause after it
  }> {
    const user = await row('profiles', 'id', uid);

    if (!user) {
      return { effectivePlan: 'free', limits: PLANS.free, isTrial: false, isExpired: false, addons: DEFAULT_ADDONS, monthlyUsed: 0, graceEndsAt: null };
    }

    const now = new Date();

    const trialExpiry = toDate(user.trial_expires_at);
    const isTrial = user.is_trial && trialExpiry && trialExpiry > now;

    const planExpiry = toDate(user.plan_expires_at);
    const isExpired = planExpiry ? planExpiry < now : false;

    let effectivePlan: PlanId = user.plan || 'free';
    if (isExpired && effectivePlan !== 'free') {
      effectivePlan = 'free';
    }

    const baseLimits = isTrial ? TRIAL_LIMITS : PLANS[effectivePlan];
    const addons = user.addons || DEFAULT_ADDONS;
    
    const limits = {
      ...baseLimits,
      qr_codes: baseLimits.qr_codes + (addons.extra_qr_codes || 0),
      monthly_scans: baseLimits.monthly_scans + (addons.extra_scans || 0),
      analytics_days: baseLimits.analytics_days,
      custom_domains: Math.max(baseLimits.custom_domains, addons.custom_domain ? 1 : 0),
      api_access: baseLimits.api_access || addons.api_access,
    };

    const monthlyUsed = user.monthly_scans?.[now.toISOString().slice(0, 7)] || 0;

    // On Free limits after a trial or paid plan ended: grace runs from the later of the two end dates.
    let graceEndsAt: Date | null = null;
    if (!isTrial && effectivePlan === 'free') {
      const ends = [trialExpiry, planExpiry].filter(Boolean) as Date[];
      const lapsedAt = ends.length ? new Date(Math.max(...ends.map(d => d.getTime()))) : (toDate(user.created_at) || now);
      graceEndsAt = new Date(lapsedAt.getTime() + GRACE_DAYS * 86400000);
    }

    return { effectivePlan, limits, isTrial, isExpired, addons, monthlyUsed, graceEndsAt };
  }

  // User Plan API
  app.get('/api/user/plan', authenticate, async (req, res) => {
    const uid = (req as any).user.uid;
    logger.info(`Plan fetch started for user ${uid}`);
    
    try {
      let userDoc = await row('profiles', 'id', uid);

      if (!userDoc) {
        // First sign-in: 14-day trial.
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 14);
        const { error } = await supabase.from('profiles').upsert({
          id: uid, plan: 'free', plan_expires_at: null, trial_expires_at: trialEnd.toISOString(),
          is_trial: true, addons: DEFAULT_ADDONS, created_at: nowIso(), email: (req as any).user.email || '',
        });
        if (error) throw error;
        logger.info(`New profile created for ${uid}`);
        userDoc = {};
      }

      const license = await getLicense(uid);

      const allQrs = await rows('qr_codes', 'user_uid', uid);
      const allSlugs: string[] = allQrs.map(q => q.slug);
      const activeQrs = allQrs.filter(q => q.is_active !== false && !isLink(q)).length;
      const remaining_qr = Math.max(0, license.limits.qr_codes - activeQrs);
      const activeDynamic = allQrs.filter(q => q.is_active !== false && q.is_dynamic !== false && !isLink(q)).length;
      const activeLinks = allQrs.filter(q => q.is_active !== false && isLink(q)).length;
      // Lapse rule: dynamic codes and short links above the allowance pause when the grace period ends.
      const dynamicOverAllowance = Math.max(0, activeDynamic - license.limits.dynamic_qr_codes)
        + Math.max(0, activeLinks - license.limits.short_links);
      const pause_on = license.graceEndsAt && dynamicOverAllowance > 0 ? license.graceEndsAt.toISOString() : null;

      const currentMonth = new Date().toISOString().slice(0, 7);
      let totalScans = 0, monthlyScansFromStats = 0;
      let earliestDay: string | null = null;
      const countriesSet = new Set<string>();
      for (const d of await statsFor(allSlugs, 'total_scans, countries, days, monthly_scans')) {
        totalScans += d.total_scans || 0;
        Object.keys(d.countries || {}).forEach(c => countriesSet.add(c));
        const first = Object.keys(d.days || {}).sort()[0];
        if (first && (!earliestDay || first < earliestDay)) earliestDay = first;
        monthlyScansFromStats += d.monthly_scans?.[currentMonth] || 0;
      }

      const daysActive = earliestDay
        ? Math.ceil((Date.now() - new Date(earliestDay + 'T00:00:00').getTime()) / 86400000)
        : 0;

      // The account-wide counter on the profile; qr_stats sum as a fallback for older data.
      const userLevelMonthly = userDoc?.monthly_scans?.[currentMonth] || 0;
      const monthlyScansUsed = userLevelMonthly > 0 ? userLevelMonthly : monthlyScansFromStats;

      logger.info(`Plan fetch completed for ${uid}: totalScans=${totalScans}, monthlyScans=${monthlyScansUsed}`);
      
      // Prevent browser/CDN caching of plan data — always needs to be fresh
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.json({
        plan: license.effectivePlan,
        is_trial: license.isTrial,
        is_expired: license.isExpired,
        plan_expires_at: userDoc?.plan_expires_at || null,
        plan_since: userDoc?.plan_since || null,
        email: (req as any).user.email || userDoc?.email || '',
        limits: license.limits,
        addons: license.addons,
        remaining_qr,
        monthly_scans_used: monthlyScansUsed,
        // Aggregated stats for Settings & Billing pages
        total_qrs: allSlugs.length,
        total_scans: totalScans,
        days_active: daysActive,
        countries_count: countriesSet.size,
        profile: {
          company: userDoc?.company || '',
          jobTitle: userDoc?.job_title || '',
          country: userDoc?.country || 'LK',
          timezone: userDoc?.timezone || 'Asia/Colombo',
          digestOptOut: !!userDoc?.digest_opt_out,
          agencyName: userDoc?.agency_name || '',
          agencyLogo: userDoc?.agency_logo || '',
          brand_style: userDoc?.brand_style || null,
        },
        is_member: !!(req as any).user.isMember,
        custom_domain: await activeDomain(uid),
        active_dynamic: activeDynamic,
        dynamic_over_allowance: dynamicOverAllowance,
        pause_on,
        is_sandbox: process.env.PAYHERE_SANDBOX === 'true',
        polar_enabled: !!process.env.POLAR_ACCESS_TOKEN,
        polar_portal_url: process.env.POLAR_PORTAL_URL || null,
      });
    } catch (error: any) {
      logger.error('Plan fetch error:', { 
        message: error.message,
        code: error.code,
        stack: error.stack?.substring(0, 1000),
        uid
      });
      res.status(500).json({ error: 'Failed to fetch plan' });
    }
  });

  // User Profile Update API
  app.put('/api/user/profile', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const { company, jobTitle, country, timezone } = req.body;
      const bs = req.body.brand_style;
      if (bs !== undefined && bs !== null && (typeof bs !== 'object' || Array.isArray(bs) || JSON.stringify(bs).length > 90000)) {
        return res.status(400).json({ error: 'brand_style must be an object under 90 KB (try a smaller logo)' });
      }
      const { error } = await supabase.from('profiles').update({
        company: company || '',
        job_title: jobTitle || '',
        country: country || 'LK',
        timezone: timezone || 'Asia/Colombo',
        ...(typeof req.body.digestOptOut === 'boolean' ? { digest_opt_out: req.body.digestOptOut } : {}),
        ...(typeof req.body.agencyName === 'string' ? { agency_name: req.body.agencyName.slice(0, 80) } : {}),
        ...(typeof req.body.agencyLogo === 'string' && req.body.agencyLogo.length <= 65536 && (req.body.agencyLogo === '' || req.body.agencyLogo.startsWith('data:image/'))
          ? { agency_logo: req.body.agencyLogo } : {}),
        // Saved design for new codes (colours, dots, logo, frame). Object or null; capped like content_data plus a logo.
        ...(bs !== undefined ? { brand_style: bs } : {}),
        updated_at: nowIso(),
      }).eq('id', uid);
      if (error) throw error;
      
      res.json({ success: true });
    } catch (error) {
      logger.error('Profile update error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // Revoke All Sessions API
  app.post('/api/user/revoke-sessions', writeLimiter, authenticate, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const jwt = (req.headers.authorization as string).split('Bearer ')[1];
      const { error } = await supabase.auth.admin.signOut(jwt, 'global');
      if (error) {
        logger.error('Session revocation failed', { uid, code: error.status, message: error.message });
        return res.status(500).json({ error: 'Failed to revoke sessions' });
      }
      logger.info('All sessions revoked', { uid });
      res.json({ success: true });
    } catch (error) {
      logger.error('Session revocation error:', error);
      res.status(500).json({ error: 'Failed to revoke sessions' });
    }
  });

  // Client-reported funnel events (allowlisted names only).
  app.post('/api/events', authenticate, async (req, res) => {
    const { name, slug } = req.body || {};
    if (!['print_opened', 'kit_started'].includes(name)) return res.status(400).json({ error: 'Unknown event' });
    const { error } = await supabase.from('events').insert({ uid: (req as any).user.uid, name, slug: typeof slug === 'string' ? slug.slice(0, 32) : null });
    if (error) return res.status(500).json({ error: 'Failed to record event' });
    res.json({ success: true });
  });

  // Export User Data API
  app.get('/api/user/export', authenticate, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const qrs = (await rows('qr_codes', 'user_uid', uid)).map(q => ({ id: q.slug, ...publicQr(q) }));
      const profile = (await row('profiles', 'id', uid)) || {};
      
      const exportData = {
        exported_at: new Date().toISOString(),
        profile: {
          email: profile.email,
          plan: profile.plan,
          company: profile.company,
          jobTitle: profile.job_title,
          country: profile.country,
          timezone: profile.timezone
        },
        qr_codes: qrs
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=dynamicqr-export-${uid}.json`);
      res.json(exportData);
    } catch (error) {
      logger.error('Export error:', error);
      res.status(500).json({ error: 'Failed to export data' });
    }
  });

  // Deactivate All QR Codes API
  app.put('/api/user/deactivate-all', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const { data, error } = await supabase.from('qr_codes')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_uid', uid).select('slug');
      if (error) throw error;
      await Promise.all((data || []).map(r => purgeEdge(r.slug)));

      res.json({ success: true, count: (data || []).length });
    } catch (error) {
      logger.error('Deactivate all error:', error);
      res.status(500).json({ error: 'Failed to deactivate QR codes' });
    }
  });

  // ── Uploads (PDF codes, page images) ──────────────────────────────────────
  // The client uploads straight to Supabase Storage with a signed URL, so no file bytes pass through Vercel.
  const FILES_BUCKET = 'files';
  const UPLOAD_TYPES: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
  app.post('/api/files', writeLimiter, authenticate, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const { type, size } = req.body || {};
      if (!UPLOAD_TYPES[type]) return res.status(400).json({ error: `type must be one of ${Object.keys(UPLOAD_TYPES).join(', ')}` });
      if (!Number.isInteger(size) || size <= 0) return res.status(400).json({ error: 'size must be the file size in bytes' });
      const { limits } = await getLicense(uid);
      // ponytail: the declared size is checked here; the bucket's own file_size_limit (100 MB, migration 006)
      // is the hard cap. Upgrade path: check the stored object's size when the code is saved.
      if (size > limits.file_mb * 1024 * 1024) {
        return res.status(403).json({ error: `Your plan allows files up to ${limits.file_mb} MB`, code: 'LIMIT_FILE_SIZE', limit_mb: limits.file_mb });
      }
      const path = `${uid}/${crypto.randomUUID()}.${type}`;
      const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw error || new Error('No signed URL');
      res.status(201).json({
        path, token: data.token, signedUrl: data.signedUrl, contentType: UPLOAD_TYPES[type],
        publicUrl: supabase.storage.from(FILES_BUCKET).getPublicUrl(path).data.publicUrl,
      });
    } catch (error: any) {
      logger.error('Upload URL error:', { message: error?.message });
      res.status(500).json({ error: 'Could not start the upload' });
    }
  });

  // Delete Account API
  app.delete('/api/user/account', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      
      // Deleting the auth user cascades: profiles → qr_codes → qr_stats/scan_events, subscriptions, events.
      const slugs = (await rows('qr_codes', 'user_uid', uid)).map(q => q.slug);
      // Uploaded files live under files/<uid>/. ponytail: one page of 1,000 objects; loop on `offset` if accounts grow past it.
      const { data: files } = await supabase.storage.from(FILES_BUCKET).list(uid, { limit: 1000 });
      if (files?.length) await supabase.storage.from(FILES_BUCKET).remove(files.map(f => `${uid}/${f.name}`));
      const { error } = await supabase.auth.admin.deleteUser(uid);
      if (error) throw error;
      res.json({ success: true });
      Promise.all(slugs.map(purgeEdge)).catch(() => {});
    } catch (error) {
      logger.error('Account deletion error:', error);
      res.status(500).json({ error: 'Failed to delete account' });
    }
  });

  // ── Billing ────────────────────────────────────────────────────────────────
  // PayHere charges LKR. Every grant of paid state goes through applyPayment().
  const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex').toUpperCase();
  const safeEqual = (a: string, b: string) =>
    a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const addInterval = (base: Date, interval: string) => {
    const d = new Date(base);
    d.setMonth(d.getMonth() + (interval === 'annual' ? 12 : 1));
    return d;
  };

  // The only code that sets profiles.plan / plan_expires_at / is_trial.
  // Idempotent: the unique index on subscriptions(provider, payment_id) rejects a replayed payment.
  // Returns false when the payment was already applied.
  async function applyPayment(p: {
    uid: string; plan: string; interval: string; provider: string; paymentId: string;
    orderId: string; amount: string; currency: string; expiresAt?: Date;
  }): Promise<boolean> {
    const { data: profile, error: readErr } = await supabase
      .from('profiles').select('plan_expires_at, plan_since').eq('id', p.uid).maybeSingle();
    if (readErr) throw readErr;
    const current = profile?.plan_expires_at ? new Date(profile.plan_expires_at) : null;
    const expiresAt = p.expiresAt || addInterval(current && current > new Date() ? current : new Date(), p.interval);
    const now = new Date().toISOString();
    const row = {
      uid: p.uid, plan: p.plan, interval: p.interval, order_id: p.orderId, amount: p.amount,
      currency: p.currency, provider: p.provider, payment_id: p.paymentId,
      expires_at: expiresAt.toISOString(), status: 'active', updated_at: now,
    };

    // First payment of an order claims its pending row; a renewal inserts a new row.
    const upd = await supabase.from('subscriptions').update(row)
      .eq('provider', p.provider).eq('order_id', p.orderId).is('payment_id', null).select('id');
    if (upd.error?.code === '23505') return false;
    if (upd.error) throw upd.error;
    if (!upd.data?.length) {
      const ins = await supabase.from('subscriptions').insert(row);
      if (ins.error?.code === '23505') return false;
      if (ins.error) throw ins.error;
    }

    const { error } = await supabase.from('profiles').update({
      plan: p.plan,
      plan_expires_at: expiresAt.toISOString(),
      plan_since: profile?.plan_since || now,
      is_trial: false,
      ...(p.provider === 'payhere' ? { payhere_order_id: p.orderId } : {}),
      updated_at: now,
    }).eq('id', p.uid);
    if (error) throw error;
    logEvent(p.uid, 'paid', null);
    return true;
  }

  async function downgradeToFree(uid: string) {
    const { error } = await supabase.from('profiles')
      .update({ plan: 'free', plan_expires_at: null, updated_at: new Date().toISOString() }).eq('id', uid);
    if (error) throw error;
  }

  // Billing Checkout API
  app.post('/api/billing/checkout', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    try {
      const user = (req as any).user;
      const { plan, interval } = req.body;
      const uid = user.uid;

      if (!['monthly', 'annual'].includes(interval)) {
        return res.status(400).json({ error: 'interval must be monthly or annual' });
      }
      if (!PAID_PLANS.includes(plan)) {
        return res.status(400).json({ error: `plan must be one of ${PAID_PLANS.join(', ')}` });
      }

      const merchant_id = process.env.PAYHERE_MERCHANT_ID;
      const merchant_secret = process.env.PAYHERE_SECRET;
      if (!merchant_id || !merchant_secret) {
        logger.error('Missing PayHere credentials');
        return res.status(500).json({ error: 'Billing configuration error' });
      }

      // LKR by default; USD through PayHere only as the fallback when Polar is not configured.
      const currency: Currency = req.body.currency === 'USD' ? 'USD' : 'LKR';
      const amount = PRICES[plan as PaidPlan][currency][interval as BillingInterval].toFixed(2);
      const order_id = `ORDER_${uid}_${Date.now()}`;

      // The server-side order is the source of truth for uid/plan/amount at notify time.
      const { error: orderErr } = await supabase.from('subscriptions').insert({
        uid, plan, interval, order_id, amount, currency, provider: 'payhere', status: 'pending',
      });
      if (orderErr) throw orderErr;

      // md5(merchant_id + order_id + amount + currency + md5(merchant_secret))
      const hash = md5(`${merchant_id}${order_id}${amount}${currency}${md5(merchant_secret)}`);
      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      const fullName: string = user.user_metadata?.full_name || '';

      res.json({
        merchant_id,
        return_url: `${appUrl}/settings`,
        cancel_url: `${appUrl}/pricing`,
        notify_url: `${appUrl}/api/billing/notify`,
        order_id,
        items: `${plan.toUpperCase()} Plan (${interval === 'annual' ? 'Annual' : 'Monthly'})`,
        currency,
        amount,
        first_name: fullName.split(' ')[0] || 'User',
        last_name: fullName.split(' ').slice(1).join(' '),
        email: user.email || '',
        phone: '0000000000',
        address: 'N/A',
        city: 'N/A',
        country: 'Sri Lanka',
        hash,
        custom_1: uid,
        custom_2: plan,
        recurrence: interval === 'annual' ? '1 Year' : '1 Month',
        duration: 'Forever',
      });
    } catch (error: any) {
      logger.error('Checkout error:', { message: error.message });
      res.status(500).json({ error: 'Failed to generate checkout' });
    }
  });

  // Invoice History API
  app.get('/api/billing/invoices', authenticate, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const { data, error } = await supabase.from('subscriptions')
        .select('id, plan, interval, amount, currency, status, provider, order_id, expires_at, created_at')
        .eq('uid', uid).not('status', 'in', '(pending,failed)')
        .order('created_at', { ascending: false }).limit(12);
      if (error) throw error;
      res.json((data || []).map(r => ({
        ...r,
        date: new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      })));
    } catch (error: any) {
      logger.error('Invoice fetch error:', { message: error.message });
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  });

  const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const generateSlug = customAlphabet(ALPHABET, 7);

  // PayHere Webhook (server-to-server). uid/plan/amount come from our order row, never from custom_*.
  // PayHere posts application/x-www-form-urlencoded.
  app.post('/api/billing/notify', webhookLimiter, express.urlencoded({ extended: false, limit: '100kb' }), async (req, res) => {
    try {
      const {
        merchant_id, order_id, payment_id, payhere_amount, payhere_currency,
        status_code, md5sig, message_type,
      } = req.body;

      const secret = process.env.PAYHERE_SECRET;
      if (!secret || merchant_id !== process.env.PAYHERE_MERCHANT_ID) {
        logger.warn('PayHere notify: unknown merchant');
        return res.status(401).send('Invalid signature');
      }
      const localHash = md5(`${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${md5(secret)}`);
      if (!safeEqual(localHash, String(md5sig || ''))) {
        logger.warn('PayHere notify: Invalid signature');
        return res.status(401).send('Invalid signature');
      }

      const { data: order, error: orderErr } = await supabase.from('subscriptions').select('*')
        .eq('provider', 'payhere').eq('order_id', order_id)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (orderErr) throw orderErr;
      if (!order) {
        logger.warn('PayHere notify: unknown order', { order_id });
        return res.status(400).send('Unknown order');
      }
      if (Number(payhere_amount) !== Number(order.amount) || payhere_currency !== order.currency) {
        logger.warn('PayHere notify: amount/currency mismatch', { order_id, payhere_amount, payhere_currency });
        return res.status(400).send('Amount mismatch');
      }

      const uid = order.uid;
      const now = new Date().toISOString();

      // Customer stopped the recurring plan: keep access until the paid period ends.
      // ponytail: message_type names from PayHere recurring docs; verify against the sandbox.
      if (message_type === 'RECURRING_STOPPED' || message_type === 'RECURRING_COMPLETE') {
        await supabase.from('subscriptions').update({ status: 'cancelled', updated_at: now })
          .eq('provider', 'payhere').eq('order_id', order_id).eq('status', 'active');
        logger.info('Subscription stopped; plan kept until expiry', { uid, order_id });
        return res.send('OK');
      }

      if (status_code === '2') {
        if (!payment_id) return res.status(400).send('Missing payment_id');
        const applied = await applyPayment({
          uid, plan: order.plan, interval: order.interval || 'monthly', provider: 'payhere',
          paymentId: String(payment_id), orderId: order_id, amount: order.amount, currency: order.currency,
        });
        logger.info(applied ? 'Payment applied' : 'Duplicate payment ignored', { uid, order_id, payment_id });
      } else if (status_code === '-3') {
        // Chargeback: remove access now.
        await downgradeToFree(uid);
        await supabase.from('subscriptions').update({ status: 'chargeback', updated_at: now })
          .eq('provider', 'payhere').eq('order_id', order_id);
        logger.warn('Chargeback: downgraded to free', { uid, order_id });
      } else if (status_code === '-1' || status_code === '-2') {
        await supabase.from('subscriptions').update({ status: 'failed', updated_at: now })
          .eq('provider', 'payhere').eq('order_id', order_id).eq('status', 'pending');
      }

      res.send('OK');
    } catch (error: any) {
      logger.error('Billing notify error:', { message: error.message });
      res.status(500).send('Error');
    }
  });

  // ── Polar (USD card payments) ──────────────────────────────────────────────
  // Enabled only when POLAR_ACCESS_TOKEN is set. Polar runs renewals; we mirror current_period_end.
  const polarApi = () => process.env.POLAR_SANDBOX === 'true' ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh';
  const polarProducts = (): Record<string, [string, string]> => {
    const map: Record<string, [string, string]> = {};
    const add = (id: string | undefined, plan: string, interval: string) => { if (id) map[id] = [plan, interval]; };
    add(process.env.POLAR_PRODUCT_PRO_MONTHLY, 'pro', 'monthly');
    add(process.env.POLAR_PRODUCT_PRO_ANNUAL, 'pro', 'annual');
    add(process.env.POLAR_PRODUCT_TEAM_MONTHLY, 'team', 'monthly');
    add(process.env.POLAR_PRODUCT_TEAM_ANNUAL, 'team', 'annual');
    add(process.env.POLAR_PRODUCT_BUSINESS_MONTHLY, 'business', 'monthly');
    add(process.env.POLAR_PRODUCT_BUSINESS_ANNUAL, 'business', 'annual');
    return map;
  };

  // Standard Webhooks: base64 HMAC-SHA256 of `${id}.${timestamp}.${rawBody}`, keyed with the secret's UTF-8 bytes.
  const verifyPolarSignature = (headers: any, rawBody: string, secret: string): boolean => {
    const id = headers['webhook-id'], ts = headers['webhook-timestamp'], sigHeader = headers['webhook-signature'];
    if (!id || !ts || !sigHeader) return false;
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replay window: 5 minutes
    const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(`${id}.${ts}.${rawBody}`).digest('base64');
    return String(sigHeader).split(' ').some(part => safeEqual(part.split(',')[1] || '', expected));
  };

  app.post('/api/billing/polar/checkout', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    try {
      const user = (req as any).user;
      const { plan, interval } = req.body;
      if (!['monthly', 'annual'].includes(interval)) return res.status(400).json({ error: 'interval must be monthly or annual' });
      if (!PAID_PLANS.includes(plan)) return res.status(400).json({ error: `plan must be one of ${PAID_PLANS.join(', ')}` });

      const token = process.env.POLAR_ACCESS_TOKEN;
      const productId = Object.entries(polarProducts()).find(([, v]) => v[0] === plan && v[1] === interval)?.[0];
      if (!token || !productId) return res.status(503).json({ error: 'Card payments are not available yet. Please pay in LKR.' });

      const amount = PRICES[plan as PaidPlan].USD[interval as BillingInterval].toFixed(2);
      const order_id = `POLAR_${user.uid}_${Date.now()}`;
      const { error: orderErr } = await supabase.from('subscriptions').insert({
        uid: user.uid, plan, interval, order_id, amount, currency: 'USD', provider: 'polar', status: 'pending',
      });
      if (orderErr) throw orderErr;

      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      const r = await fetch(`${polarApi()}/v1/checkouts/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: [productId],
          success_url: `${appUrl}/settings`,
          customer_email: user.email || undefined,
          metadata: { uid: user.uid, order_id },
        }),
        signal: AbortSignal.timeout(10000),
      });
      const body: any = await r.json().catch(() => ({}));
      if (!r.ok || !body.url) {
        logger.error('Polar checkout failed', { status: r.status, detail: body?.detail });
        return res.status(502).json({ error: 'Could not start card checkout' });
      }
      res.json({ url: body.url });
    } catch (error: any) {
      logger.error('Polar checkout error:', { message: error.message });
      res.status(500).json({ error: 'Failed to start checkout' });
    }
  });

  app.post('/api/billing/polar/webhook', webhookLimiter, async (req, res) => {
    try {
      const secret = process.env.POLAR_WEBHOOK_SECRET;
      const raw = (req as any).rawBody?.toString('utf8') || '';
      if (!secret || !verifyPolarSignature(req.headers, raw, secret)) {
        logger.warn('Polar webhook: invalid signature');
        return res.status(401).send('Invalid signature');
      }

      const { type, data } = req.body || {};
      const uid = data?.metadata?.uid || data?.customer?.external_id;
      const orderId = data?.metadata?.order_id;
      if (!uid) return res.status(202).send('Ignored'); // not one of ours
      const now = new Date().toISOString();

      if ((type === 'subscription.active' || type === 'subscription.updated' || type === 'subscription.uncanceled')
          && data.status === 'active' && data.current_period_end) {
        const mapped = polarProducts()[data.product_id];
        if (!mapped) {
          logger.warn('Polar webhook: unknown product', { product_id: data.product_id });
          return res.status(400).send('Unknown product');
        }
        const [plan, interval] = mapped;
        const { data: order } = await supabase.from('subscriptions').select('amount')
          .eq('provider', 'polar').eq('order_id', orderId || '').limit(1).maybeSingle();
        const applied = await applyPayment({
          uid, plan, interval, provider: 'polar',
          paymentId: `${data.id}:${data.current_period_end}`, // one grant per subscription period
          orderId: orderId || `POLAR_SUB_${data.id}`,
          amount: order?.amount || PRICES[plan as PaidPlan].USD[interval as BillingInterval].toFixed(2),
          currency: 'USD',
          expiresAt: new Date(data.current_period_end),
        });
        logger.info(applied ? 'Polar period applied' : 'Polar duplicate ignored', { uid, sub: data.id });
      } else if (type === 'subscription.canceled') {
        // Cancelled at period end: keep the plan until plan_expires_at.
        await supabase.from('subscriptions').update({ status: 'cancelled', updated_at: now })
          .eq('provider', 'polar').eq('uid', uid).eq('status', 'active');
      } else if (type === 'subscription.revoked' || type === 'order.refunded') {
        await downgradeToFree(uid);
        await supabase.from('subscriptions').update({ status: 'cancelled', updated_at: now })
          .eq('provider', 'polar').eq('uid', uid).in('status', ['active', 'pending']);
        logger.warn('Polar access revoked', { uid, type });
      }
      res.send('OK');
    } catch (error: any) {
      logger.error('Polar webhook error:', { message: error.message });
      res.status(500).send('Error');
    }
  });

  async function createUniqueSlug(): Promise<string> {
    let slug: string, exists: boolean, attempts = 0;
    do {
      slug = generateSlug();
      exists = !!(await row('qr_codes', 'slug', slug));
      if (++attempts > 10) {
        throw new Error("Slug gen failed");
      }
    } while (exists);
    return slug;
  }

  // ── EXACT SCHEMA CREATION for qr_codes AND qr_stats ─────────
  app.post('/api/qr', writeLimiter, authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const { destination_url, title, style, is_dynamic: requestedDynamic, qr_type, content_data, options, client } = req.body;
      const type = qr_type || 'url';
      if (!QR_TYPES.includes(type)) {
        return res.status(400).json({ error: `qr_type must be one of ${QR_TYPES.join(', ')}` });
      }
      const kind = req.body.kind || 'qr';
      if (kind !== 'qr' && !(kind === 'link' && type === 'url' && requestedDynamic !== false && destination_url)) {
        return res.status(400).json({ error: "kind must be 'qr', or 'link' for a dynamic url with a destination_url" });
      }
      if (content_data !== undefined && JSON.stringify(content_data).length > CONTENT_MAX) {
        return res.status(400).json({ error: 'content_data is too large (max 20 KB)' });
      }
      if (type === 'event' && (!content_data?.start || isNaN(new Date(content_data.start).getTime()))) {
        return res.status(400).json({ error: 'An event needs a valid start time' });
      }
      const gtin = req.body.gtin === undefined ? null : normGtin(req.body.gtin);
      if (gtin === undefined) return res.status(400).json({ error: 'gtin must be a GTIN-8, 12, 13 or 14 with a valid check digit', code: 'INVALID_GTIN' });
      // Guest pages, events and GS1 codes only exist as dynamic codes; every other type can be either.
      const is_dynamic = type === 'page' || type === 'event' || !!gtin || requestedDynamic !== false;
      const uid = user.uid;

      // Input validation
      if (title !== undefined && (typeof title !== 'string' || title.length > 120)) {
        return res.status(400).json({ error: 'title must be a string under 120 characters' });
      }
      if (destination_url !== undefined && destination_url !== '') {
        try { new URL(destination_url); } catch {
          return res.status(400).json({ error: 'destination_url must be a valid URL' });
        }
      }
      if (options?.password && (typeof options.password !== 'string' || options.password.length > 128)) {
        return res.status(400).json({ error: 'password must be a string under 128 characters' });
      }

      // Map options to stored fields
      const rate_limit = {
        enabled: options?.scan_limit_enabled || false,
        max_scans: options?.scan_limit || 100,
        period: 'total'
      };
      const expiry_date = options?.expiry_date_enabled ? options.expiry_date : null;
      const password = options?.password_protect ? options.password : null;
      
      // Visitor Rate Limit (New)
      let visitor_rate_limit = options?.visitor_rate_limit !== undefined ? Number(options.visitor_rate_limit) : 5;
      let visitor_rate_period = options?.visitor_rate_period !== undefined ? Number(options.visitor_rate_period) : 3600;

      logger.info(`Starting QR creation for user ${uid}`, { type: qr_type, is_dynamic });

      // 1. Plan Limit Enforcement
      const license = await getLicense(uid);

      // Force Visitor Guard limits for Free users
      if (!license.limits.visitor_guard_gate) {
        visitor_rate_limit = 5;
        visitor_rate_period = 3600;
        logger.info(`Enforcing hard-coded Visitor Guard for free user ${uid}`);
      }

      logger.info(`Checking limits for plan: ${license.effectivePlan}`, { limits: license.limits });


      const capped = await capError(uid, license.limits, { kind, qr_type: type, is_dynamic });
      if (capped) return res.status(403).json(capped);

      // Feature Gates
      if (is_dynamic && !license.limits.dynamic_qr) {
        return res.status(403).json({ error: 'Scnr QR codes require Pro or above', code: 'FEATURE_DYNAMIC_QR' });
      }
      if (options?.password_protect && !license.limits.password_protect) {
        return res.status(403).json({ error: 'Password protection requires Pro plan', code: 'FEATURE_PASSWORD' });
      }
      if (options?.expiry_date_enabled && !license.limits.expiry_gate) {
        return res.status(403).json({ error: 'Expiry dates require Pro plan', code: 'FEATURE_EXPIRY' });
      }
      if (options?.scan_limit_enabled && !license.limits.scan_limit_gate) {
        return res.status(403).json({ error: 'Scan limits require Pro plan', code: 'FEATURE_SCAN_LIMIT' });
      }

      // 2. Slug Generation
      let slug;
      try {
        slug = await createUniqueSlug();
        logger.info(`Successfully generated unique slug: ${slug}`);
      } catch (err: any) {
        logger.error('Slug generation failed', { error: err.message });
        throw new Error(`Slug generation failed: ${err.message}`);
      }
      
      const defaultStyle = { dot_color: '#000000', bg_color: '#ffffff' };
      const activeStyle = style || defaultStyle;

      let passwordHash = null;
      if (password) {
        passwordHash = crypto.createHash('sha256').update(password + slug).digest('hex');
      }

      const qrDoc = {
        slug,
        user_uid: user.uid,
        destination_url: destination_url || '',
        qr_type: type,
        // Only written when not the default, so plain creates keep working before migration 005.
        ...(kind === 'link' ? { kind } : {}),
        ...(gtin ? { gtin } : {}),
        // Only written when set, so creates keep working before migration 004 adds the column.
        ...(typeof client === 'string' && client.trim() ? { client: client.trim().slice(0, 60) } : {}),
        content_data: content_data || null,
        is_dynamic,
        title: title || 'My QR',
        is_active: true,
        style: activeStyle,
        rate_limit: rate_limit || { enabled: false, max_scans: 100, period: 'total' },
        expiry_date: expiry_date || null,
        password_hash: passwordHash,
        visitor_rate_limit,
        visitor_rate_period,
        created_at: nowIso()
      };

      const statsDoc = {
        total_scans: 0,
        unique_scans: 0,
        days: {},
        countries: {},
        browsers: {},
        os: {},
        devices: { mobile: 0, desktop: 0, tablet: 0 },
        monthly_scans: {}
      };

      const { error: qrErr } = await supabase.from('qr_codes').insert(qrDoc);
      if (qrErr?.code === '23505' && gtin) return res.status(409).json({ error: 'This GTIN is already used by another code', code: 'GTIN_TAKEN' });
      if (qrErr) throw new Error(`Database save failed: ${qrErr.message}`);
      const { error: statsErr } = await supabase.from('qr_stats').insert({ slug, ...statsDoc });
      if (statsErr) throw new Error(`Database save failed: ${statsErr.message}`);

      logEvent(uid, 'qr_created', slug);
      res.status(201).json(qrDoc);
    } catch (error: any) {
      logger.error('QR creation error details:', {
        message: error.message,
        stack: error.stack,
        error
      });
      res.status(500).json({ error: 'Failed to create QR' });
    }
  });

  // List user's QR codes
  app.get('/api/qr', authenticate, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const mine = await rows('qr_codes', 'user_uid', uid);
      const statsMap: Record<string, any> = {};
      for (const st of await statsFor(mine.map(q => q.slug))) statsMap[st.slug] = st;
      const qrs = mine.map(q => ({ id: q.slug, ...publicQr(q), stats: statsMap[q.slug] || null }));

      res.json(qrs);
    } catch (error: any) {
      logger.error('QR list error:', error);
      res.status(500).json({ error: 'Failed to list QR codes' });
    }
  });

  // Get single QR code
  app.get('/api/qr/:slug', authenticate, requireOwnership, async (req, res) => {
    try {
      res.json(publicQr((req as any).qr));
    } catch (error: any) {
      logger.error('QR fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch QR code' });
    }
  });

  // Update QR code
  app.put('/api/qr/:slug', async (req, res, next) => {
    const internalSecret = req.headers['x-internal-secret'];
    if (internalSecret && internalSecret === process.env.INTERNAL_SECRET) {
      return next();
    }
    authenticate(req, res, next);
  }, async (req, res, next) => {
    const internalSecret = req.headers['x-internal-secret'];
    if (internalSecret && internalSecret === process.env.INTERNAL_SECRET) {
      return next();
    }
    requireOwnership(req, res, next);
  }, async (req, res) => {
    try {
      const { slug } = req.params;
      const { destination_url, title, style, is_active, options, content_data, client } = req.body;
      const updateData: any = {};
      if (client !== undefined) updateData.client = typeof client === 'string' && client.trim() ? client.trim().slice(0, 60) : null;
      if (content_data !== undefined) {
        if (JSON.stringify(content_data).length > CONTENT_MAX) {
          return res.status(400).json({ error: 'content_data is too large (max 20 KB)' });
        }
        updateData.content_data = content_data;
      }

      // Input validation
      if (title !== undefined && (typeof title !== 'string' || title.length > 120)) {
        return res.status(400).json({ error: 'title must be a string under 120 characters' });
      }
      if (destination_url !== undefined && destination_url !== '') {
        try { new URL(destination_url); } catch {
          return res.status(400).json({ error: 'destination_url must be a valid URL' });
        }
      }
      if (options?.password && (typeof options.password !== 'string' || options.password.length > 128)) {
        return res.status(400).json({ error: 'password must be a string under 128 characters' });
      }

      const cur = (req as any).qr; // set by requireOwnership for a user edit; internal calls only switch codes off
      if (cur) {
        if (req.body.gtin !== undefined) {
          updateData.gtin = normGtin(req.body.gtin);
          if (updateData.gtin === undefined) return res.status(400).json({ error: 'gtin must be a GTIN-8, 12, 13 or 14 with a valid check digit', code: 'INVALID_GTIN' });
        }
        // The editor can switch a code's type. Guest pages have their own editor, so page ↔ other is refused.
        const type = req.body.qr_type ?? cur.qr_type ?? 'url';
        if (!QR_TYPES.includes(type) || ((type === 'page') !== ((cur.qr_type || 'url') === 'page'))) {
          return res.status(400).json({ error: 'qr_type cannot be changed to or from a page here' });
        }
        if (type !== (cur.qr_type || 'url')) updateData.qr_type = type;
        if (type === 'event') {
          const d = content_data ?? cur.content_data;
          if (!d?.start || isNaN(new Date(d.start).getTime())) return res.status(400).json({ error: 'An event needs a valid start time' });
        }
        // Static → dynamic (asked for, or implied by an event or a GTIN). Dynamic never goes back: the print encodes the slug.
        const toDynamic = cur.is_dynamic === false && (req.body.is_dynamic === true || type === 'event' || !!(updateData.gtin ?? cur.gtin));
        if (toDynamic) updateData.is_dynamic = true;
        // Switching a row back on, or making it dynamic, must fit the plan caps like creating it.
        if ((is_active === true && cur.is_active === false) || toDynamic) {
          const capped = await capError(cur.user_uid, (await getLicense(cur.user_uid)).limits, { ...cur, qr_type: type, is_dynamic: cur.is_dynamic !== false || toDynamic });
          if (capped) return res.status(403).json(capped);
        }
      }
      if (destination_url !== undefined) updateData.destination_url = destination_url;
      if (title !== undefined) updateData.title = title;
      if (style !== undefined) updateData.style = style;
      if (is_active !== undefined) updateData.is_active = is_active;
      
      if (options && (req as any).user) {
        const license = await getLicense((req as any).user.uid);

        if (options.expiry_date_enabled !== undefined) {
          if (options.expiry_date_enabled && !license.limits.expiry_gate) {
            return res.status(403).json({ error: 'Expiry dates require Pro plan', code: 'FEATURE_EXPIRY' });
          }
          updateData.expiry_date = options.expiry_date_enabled ? options.expiry_date : null;
        }
        if (options.scan_limit_enabled !== undefined) {
          if (options.scan_limit_enabled && !license.limits.scan_limit_gate) {
            return res.status(403).json({ error: 'Scan limits require Pro plan', code: 'FEATURE_SCAN_LIMIT' });
          }
          // One jsonb value. Dotted keys ('rate_limit.enabled') are Firestore paths, not Postgres columns.
          updateData.rate_limit = {
            enabled: !!options.scan_limit_enabled,
            max_scans: Number(options.scan_limit) || 100,
            period: 'total',
          };
        }

        if (options.visitor_rate_limit !== undefined) {
          updateData.visitor_rate_limit = license.limits.visitor_guard_gate ? Number(options.visitor_rate_limit) : 5;
        }
        if (options.visitor_rate_period !== undefined) {
          updateData.visitor_rate_period = license.limits.visitor_guard_gate ? Number(options.visitor_rate_period) : 3600;
        }

        if (options.password_protect !== undefined) {
          if (options.password_protect) {
            if (!license.limits.password_protect) {
              return res.status(403).json({ error: 'Password protection requires Pro plan', code: 'FEATURE_PASSWORD' });
            }
            if (options.password) {
              updateData.password_hash = crypto.createHash('sha256').update(options.password + slug).digest('hex');
            }
          } else {
            updateData.password_hash = null;
          }
        }
      }
      
      updateData.updated_at = new Date().toISOString();
      if (content_data !== undefined && (req as any).user) {
        const { data: before } = await supabase.from('qr_codes').select('content_data').eq('slug', slug).maybeSingle();
        if ((before?.content_data?.offer?.text || '') !== (content_data?.offer?.text || '')) {
          logEvent((req as any).user.uid, 'offer_changed', slug);
        }
      }
      const { error: updErr } = await supabase.from('qr_codes').update(updateData).eq('slug', slug);
      if (updErr?.code === '23505' && updateData.gtin) return res.status(409).json({ error: 'This GTIN is already used by another code', code: 'GTIN_TAKEN' });
      if (updErr) throw updErr;
      await purgeEdge(slug);
      if (cur?.gtin && updateData.gtin !== undefined && updateData.gtin !== cur.gtin) purgeEdge(`gs1:${cur.gtin}`);
      res.json({ success: true, slug });
    } catch (error: any) {
      logger.error('QR update error:', error);
      res.status(500).json({ error: 'Failed to update QR code' });
    }
  });

  // Delete QR code
  app.delete('/api/qr/:slug', writeLimiter, authenticate, requireOwnership, async (req, res) => {
    try {
      const { slug } = req.params;
      
      // qr_stats and scan_events rows go with it (on delete cascade).
      const { error } = await supabase.from('qr_codes').delete().eq('slug', slug);
      if (error) throw error;
      res.json({ message: 'QR code deleted successfully' });
      purgeEdge(slug);
      if ((req as any).qr?.gtin) purgeEdge(`gs1:${(req as any).qr.gtin}`);
    } catch (error: any) {
      logger.error('QR delete error:', error);
      res.status(500).json({ error: 'Failed to delete QR code' });
    }
  });

  // Analytics API
  // One set of views, served for a single owned code (/api/analytics/:slug/<view>) and for the
  // account (/api/analytics/account/:uid/<view>, optional ?slugs=a,b). Every view reads the
  // pre-aggregated qr_stats rows; only `recent` reads scan_events.
  type Scope = { uid: string; qrs: any[]; stats: any[]; slugs: string[] };

  async function loadScope(req: express.Request, res: express.Response): Promise<Scope | null> {
    const uid = (req as any).user.uid;
    let qrs: any[];
    if (req.params.slug) {
      const { data, error } = await supabase.from('qr_codes').select('slug, title, is_active, created_at').eq('slug', req.params.slug);
      if (error) throw error;
      qrs = data || [];
    } else {
      if (req.params.uid !== uid && req.params.uid !== (req as any).user.realUid) { res.status(403).send('Forbidden'); return null; }
      const { data, error } = await supabase.from('qr_codes').select('slug, title, is_active, created_at').eq('user_uid', uid);
      if (error) throw error;
      const only = typeof req.query.slugs === 'string' ? req.query.slugs.split(',') : null;
      qrs = (data || []).filter(q => !only || only.includes(q.slug));
    }
    const slugs = qrs.map(q => q.slug);
    let stats: any[] = [];
    if (slugs.length) {
      const { data, error } = await supabase.from('qr_stats').select('*').in('slug', slugs);
      if (error) throw error;
      stats = data || [];
    }
    return { uid, qrs, stats, slugs };
  }

  const sumMap = (stats: any[], key: string): Record<string, number> =>
    stats.reduce((acc, s) => {
      for (const [k, v] of Object.entries(s[key] || {})) acc[k] = (acc[k] || 0) + Number(v);
      return acc;
    }, {} as Record<string, number>);
  const total = (stats: any[], key: string) => stats.reduce((n, s) => n + (s[key] || 0), 0);
  const pctRows = (map: Record<string, number>, nameKey: string, countKey = 'count') => {
    const sum = Object.values(map).reduce((a, b) => a + b, 0);
    return Object.entries(map).filter(([, n]) => n > 0)
      .map(([name, n]) => ({ [nameKey]: name, [countKey]: n, pct: sum > 0 ? ((n / sum) * 100).toFixed(1) : 0 }))
      .sort((a: any, b: any) => b[countKey] - a[countKey]);
  };
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);

  const views: Record<string, (s: Scope, req: express.Request) => Promise<any> | any> = {
    summary: ({ qrs, stats }) => {
      const days = Object.keys(sumMap(stats, 'days')).sort();
      const scans = total(stats, 'total_scans');
      return {
        total_scans: scans,
        unique_visitors: total(stats, 'unique_scans'),
        mobile_pct: scans > 0 ? ((sumMap(stats, 'devices').mobile || 0) / scans * 100).toFixed(1) : 0,
        total_qrs: qrs.length,
        active_qrs: qrs.filter(q => q.is_active).length,
        first_scan: days[0] || null,
        last_scan: days[days.length - 1] || null,
      };
    },
    // Plan history cap applies to both `days=N` and a custom start/end range.
    timeseries: async ({ uid, stats }, req) => {
      const license = await getLicense(uid);
      const maxDays = license.limits.analytics_days;
      const today = new Date();
      const earliest = new Date(today.getTime() - (maxDays - 1) * 86400000);
      let start: Date, end: Date;
      if (req.query.start && req.query.end) {
        start = new Date(String(req.query.start));
        end = new Date(String(req.query.end));
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];
        if (start < earliest) start = earliest;
        if (end > today) end = today;
      } else {
        const n = Math.min(parseInt(String(req.query.days)) || 30, maxDays);
        start = new Date(today.getTime() - (n - 1) * 86400000);
        end = today;
      }
      const rows: any[] = [];
      for (let t = new Date(dayKey(start)).getTime(); t <= new Date(dayKey(end)).getTime(); t += 86400000) {
        const date = dayKey(new Date(t));
        let scans = 0, unique = 0;
        for (const s of stats) {
          const n = Number(s.days?.[date] || 0);
          scans += n;
          // Real per-day uniques since migration 003; older days estimated from the code's overall ratio.
          unique += s.days_unique?.[date] != null
            ? Number(s.days_unique[date])
            : Math.round(n * ((s.unique_scans || 0) / (s.total_scans || 1)));
        }
        rows.push({ date, total_scans: scans, unique_scans: unique });
      }
      return rows;
    },
    devices: ({ stats }) => pctRows(sumMap(stats, 'devices'), 'device_type'),
    countries: ({ stats }) => Object.entries(sumMap(stats, 'countries'))
      .map(([country, scans]) => ({ country, scans, unique_visitors: 0 }))
      .sort((a, b) => b.scans - a.scans).slice(0, 10),
    os: ({ stats }) => pctRows(sumMap(stats, 'os'), 'os'),
    browsers: ({ stats }) => pctRows(sumMap(stats, 'browsers'), 'browser'),
    // Hour of day (UTC), 0–23, all time. Recorded since migration 003.
    hours: ({ stats }) => {
      const m = sumMap(stats, 'hours');
      return Array.from({ length: 24 }, (_, h) => ({ hour: h, scans: m[String(h)] || 0 }));
    },
    performance: ({ qrs, stats }) => qrs.map(q => {
      const s = stats.find(x => x.slug === q.slug) || {};
      return { id: q.slug, slug: q.slug, title: q.title, total_scans: s.total_scans || 0, unique_scans: s.unique_scans || 0 };
    }).sort((a, b) => b.total_scans - a.total_scans),
    // Pages: clicks per tracked link, labelled from the page's current blocks. CTR = clicks / scans of that page.
    clicks: async ({ stats }) => {
      const withClicks = stats.filter(s => s.clicks && Object.keys(s.clicks).length);
      if (!withClicks.length) return [];
      const { data, error } = await supabase.from('qr_codes').select('slug, content_data').in('slug', withClicks.map(s => s.slug));
      if (error) throw error;
      return withClicks.flatMap(s => {
        const d = data?.find(q => q.slug === s.slug)?.content_data || {};
        return Object.entries(s.clicks).map(([key, n]) => {
          const t = blockTarget(d, key);
          return { slug: s.slug, key, label: t?.label || '(removed link)', url: t?.url || '', clicks: Number(n),
            ctr: s.total_scans ? Number((Number(n) / s.total_scans * 100).toFixed(1)) : 0 };
        });
      }).sort((a, b) => b.clicks - a.clicks);
    },
    recent: async ({ slugs }) => {
      if (!slugs.length) return [];
      const { data, error } = await supabase.from('scan_events')
        .select('id, slug, scanned_at, country, city, device, os, browser, referer, is_unique')
        .in('slug', slugs).order('scanned_at', { ascending: false }).limit(20);
      if (error) throw error;
      return (data || []).map(e => ({
        id: e.id, slug: e.slug, scanned_at: e.scanned_at,
        country: e.country || 'Unknown', city: e.city || 'Unknown', device_type: e.device || 'Unknown',
        os: e.os || 'Unknown', browser: e.browser || 'Unknown', referrer: e.referer || 'Direct', is_unique: e.is_unique,
      }));
    },
  };

  const analyticsHandler = (view: (s: Scope, req: express.Request) => any) =>
    async (req: express.Request, res: express.Response) => {
      try {
        const scope = await loadScope(req, res);
        if (!scope) return;
        res.json(await view(scope, req));
      } catch (error: any) {
        logger.error('Analytics error', { path: req.path, message: error.message });
        res.status(500).json({ error: 'Failed to fetch analytics' });
      }
    };

  for (const [name, view] of Object.entries(views)) {
    app.get(`/api/analytics/account/:uid/${name}`, authenticate, analyticsHandler(view));
    app.get(`/api/analytics/:slug/${name}`, authenticate, requireOwnership, analyticsHandler(view));
  }
  app.get('/api/analytics/account/:uid', authenticate, analyticsHandler(views.summary));

  // CSV of raw scans (newest first, up to 10,000) for one owned code.
  app.get('/api/analytics/:slug/events.csv', authenticate, requireOwnership, async (req, res) => {
    try {
      const { data, error } = await supabase.from('scan_events')
        .select('scanned_at, country, device, os, browser, referer, is_unique')
        .eq('slug', req.params.slug).order('scanned_at', { ascending: false }).limit(10000);
      if (error) throw error;
      const cell = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = ['scanned_at,country,device,os,browser,referer,is_unique',
        ...(data || []).map(e => [e.scanned_at, e.country, e.device, e.os, e.browser, e.referer, e.is_unique].map(cell).join(','))];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="scans-${req.params.slug}.csv"`);
      res.send(lines.join('\n'));
    } catch (error: any) {
      logger.error('CSV export error', { message: error.message });
      res.status(500).json({ error: 'Failed to export scans' });
    }
  });

  // ── Team plan: API keys, seats, custom domain ──────────────────────────────
  app.get('/api/keys', authenticate, sessionOwner, async (req, res) => {
    const { data, error } = await supabase.from('api_keys').select('id, name, prefix, created_at, last_used_at, revoked_at')
      .eq('uid', (req as any).user.uid).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Failed to list keys' });
    res.json(data || []);
  });

  app.post('/api/keys', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const license = await getLicense(uid);
      if (!license.limits.api_access) return res.status(403).json({ error: 'API access requires the Team or Business plan', code: 'FEATURE_API' });
      const key = `sk_live_${crypto.randomBytes(24).toString('base64url')}`;
      const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim().slice(0, 60) : 'API key';
      const { data, error } = await supabase.from('api_keys')
        .insert({ uid, name, prefix: key.slice(0, 12), key_hash: sha256(key) }).select('id, name, prefix, created_at').single();
      if (error) throw error;
      res.status(201).json({ ...data, key }); // the only time the full key is shown
    } catch (error: any) {
      logger.error('API key create error', { message: error.message });
      res.status(500).json({ error: 'Failed to create key' });
    }
  });

  app.delete('/api/keys/:id', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    const { error } = await supabase.from('api_keys').update({ revoked_at: nowIso() })
      .eq('id', req.params.id).eq('uid', (req as any).user.uid);
    if (error) return res.status(500).json({ error: 'Failed to revoke key' });
    res.json({ success: true });
  });

  app.get('/api/team', authenticate, async (req, res) => {
    const { data, error } = await supabase.from('workspace_members').select('id, member_email, member_uid, role, created_at')
      .eq('owner_uid', (req as any).user.uid).order('created_at');
    if (error) return res.status(500).json({ error: 'Failed to list members' });
    res.json((data || []).map(m => ({ ...m, joined: !!m.member_uid })));
  });

  app.post('/api/team', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
      if (email === String((req as any).user.email || '').toLowerCase()) return res.status(400).json({ error: 'You are already the owner' });
      const license = await getLicense(uid);
      const { count } = await supabase.from('workspace_members').select('id', { count: 'exact', head: true }).eq('owner_uid', uid);
      if ((count || 0) + 1 >= license.limits.seats) {
        return res.status(403).json({ error: `Your plan includes ${license.limits.seats} user${license.limits.seats === 1 ? '' : 's'}`, code: 'LIMIT_SEATS', limit: license.limits.seats });
      }
      const { data, error } = await supabase.from('workspace_members').insert({ owner_uid: uid, member_email: email }).select('id, member_email').single();
      if (error?.code === '23505') return res.status(409).json({ error: 'Already invited' });
      if (error) throw error;
      res.status(201).json(data);
    } catch (error: any) {
      logger.error('Team invite error', { message: error.message });
      res.status(500).json({ error: 'Failed to invite' });
    }
  });

  app.delete('/api/team/:id', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    const { error } = await supabase.from('workspace_members').delete().eq('id', req.params.id).eq('owner_uid', (req as any).user.uid);
    if (error) return res.status(500).json({ error: 'Failed to remove member' });
    res.json({ success: true });
  });

  // One custom short domain per Team account, through Cloudflare for SaaS custom hostnames.
  const cf = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${process.env.CF_ZONE_ID}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    return { ok: r.ok, body: await r.json().catch(() => ({})) as any };
  };
  const cfStatus = (h: any) => (h?.status === 'active' && h?.ssl?.status === 'active' ? 'active' : h?.status === 'blocked' ? 'failed' : 'pending');

  app.get('/api/domains', authenticate, async (req, res) => {
    try {
      const d = await row('custom_domains', 'uid', (req as any).user.uid);
      if (d && d.status === 'pending' && d.cf_id && process.env.CF_API_TOKEN) {
        const r = await cf(`/custom_hostnames/${d.cf_id}`);
        const status = cfStatus(r.body?.result);
        if (status !== d.status) await supabase.from('custom_domains').update({ status }).eq('id', d.id);
        d.status = status;
      }
      res.json(d ? { hostname: d.hostname, status: d.status, cname_target: process.env.CF_CNAME_TARGET || null } : null);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load domain' });
    }
  });

  app.post('/api/domains', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const license = await getLicense(uid);
      if (license.limits.custom_domains < 1) return res.status(403).json({ error: 'A custom domain needs the Pro plan or above', code: 'FEATURE_CUSTOM_DOMAIN' });
      const hostname = String(req.body?.hostname || '').trim().toLowerCase();
      if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(hostname)) return res.status(400).json({ error: 'Enter a hostname like qr.yourbusiness.lk' });
      if (await row('custom_domains', 'uid', uid)) return res.status(409).json({ error: 'Remove your current domain first (1 per account)' });
      if (!process.env.CF_API_TOKEN || !process.env.CF_ZONE_ID) return res.status(503).json({ error: 'Custom domains are not enabled yet' });
      const r = await cf('/custom_hostnames', { method: 'POST', body: JSON.stringify({ hostname, ssl: { method: 'http', type: 'dv' } }) });
      if (!r.ok) return res.status(400).json({ error: r.body?.errors?.[0]?.message || 'Cloudflare rejected this hostname' });
      const { error } = await supabase.from('custom_domains').insert({ uid, hostname, cf_id: r.body.result.id, status: cfStatus(r.body.result) });
      if (error) throw error;
      res.status(201).json({ hostname, status: cfStatus(r.body.result), cname_target: process.env.CF_CNAME_TARGET || null });
    } catch (error: any) {
      logger.error('Custom domain error', { message: error.message });
      res.status(500).json({ error: 'Failed to add domain' });
    }
  });

  app.delete('/api/domains', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    const d = await row('custom_domains', 'uid', (req as any).user.uid);
    if (!d) return res.json({ success: true });
    if (d.cf_id && process.env.CF_API_TOKEN) await cf(`/custom_hostnames/${d.cf_id}`, { method: 'DELETE' });
    await supabase.from('custom_domains').delete().eq('id', d.id);
    res.json({ success: true });
  });

  // ── Cron (vercel.json "crons"; Vercel sends Authorization: Bearer $CRON_SECRET) ──
  const cronAuth = (req: express.Request, res: express.Response, next: express.NextFunction) =>
    process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`
      ? next() : res.status(401).send('Unauthorized');

  // Daily: drop raw scan events older than 400 days (aggregates in qr_stats are kept).
  app.get('/api/cron/cleanup', cronAuth, async (_req, res) => {
    try {
      const cutoff = new Date(Date.now() - 400 * 86400000).toISOString();
      const { error, count } = await supabase.from('scan_events').delete({ count: 'exact' }).lt('scanned_at', cutoff);
      if (error) throw error;
      logger.info('Retention cleanup', { deleted: count });
      res.json({ deleted: count || 0 });
    } catch (error: any) {
      logger.error('Cleanup cron error', { message: error.message });
      res.status(500).json({ error: 'Cleanup failed' });
    }
  });

  // Weekly (Mondays): email each owner their last-7-days scans, busiest hour and top code.
  // ?dry=1 builds the digests without sending (used by QA). ?uid= limits to one account.
  // ponytail: sends serially inside one function call; fine for hundreds of owners, move to a queue beyond that.
  app.get('/api/cron/digest', cronAuth, async (req, res) => {
    try {
      const dry = req.query.dry === '1';
      const key = process.env.RESEND_API_KEY;
      if (!dry && !key) return res.json({ sent: 0, skipped: 'RESEND_API_KEY not set' });
      let q = supabase.from('profiles').select('id, email, company, timezone, digest_opt_out').eq('digest_opt_out', false);
      if (typeof req.query.uid === 'string') q = q.eq('id', req.query.uid);
      const { data: owners, error } = await q;
      if (error) throw error;

      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const appUrl = process.env.APP_URL || '';
      const out: any[] = [];
      for (const o of owners || []) {
        if (!o.email) continue;
        const qrs = (await rows('qr_codes', 'user_uid', o.id)).map(x => ({ slug: x.slug, title: x.title }));
        if (!qrs.length) continue;
        const { data: scans, error: sErr } = await supabase.from('scan_events').select('slug, scanned_at')
          .in('slug', qrs.map(x => x.slug)).gte('scanned_at', since).limit(50000);
        if (sErr) throw sErr;
        const d = buildDigest({ businessName: o.company || '', timezone: o.timezone || 'Asia/Colombo', qrs, scans: scans || [], appUrl });
        if (!dry) {
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: process.env.DIGEST_FROM || 'Scnr <digest@scnr.app>', to: o.email, subject: d.subject, html: d.html }),
          });
          if (!r.ok) logger.warn('Digest send failed', { uid: o.id, status: r.status });
        }
        out.push({ uid: o.id, total: d.total, busiestHour: d.busiestHour, top: d.top, subject: d.subject });
      }
      res.json({ sent: dry ? 0 : out.length, digests: dry ? out : undefined });
    } catch (error: any) {
      logger.error('Digest cron error', { message: error.message });
      res.status(500).json({ error: 'Digest failed' });
    }
  });

  // Internal endpoint for Cloudflare Worker to send rich CF payload
  // Pages "Engagements": the Worker reports a click on /<slug>/l/<key> (in waitUntil, after its 302).
  app.post('/internal/click', async (req, res) => {
    if (!process.env.INTERNAL_SECRET || req.headers['x-internal-secret'] !== process.env.INTERNAL_SECRET) return res.status(401).send('Unauthorized');
    const { slug, key } = req.body || {};
    if (typeof slug !== 'string' || typeof key !== 'string' || !/^[a-z0-9]{1,12}(-\d{1,3})?$/.test(key)) return res.status(400).json({ error: 'slug and key required' });
    const { error } = await supabase.rpc('record_click', { p_slug: slug, p_key: key });
    if (error) { logger.error('record_click failed', { message: error.message }); return res.status(500).send('Failed'); }
    res.send('OK');
  });

  app.post('/internal/scan', async (req, res) => {
    try {
      const secret = req.headers['x-internal-secret'];
      if (!secret || secret !== process.env.INTERNAL_SECRET) {
        logger.warn('Internal scan: Unauthorized secret attempt');
        return res.status(401).send('Unauthorized');
      }
      logger.info(`Received internal scan for slug: ${req.body.slug}`);
      
      const { slug } = req.body;
      // Recording only. The monthly quota is enforced by the Worker from /internal/slug's quota_exceeded.
      const { data: qr, error } = await supabase.from('qr_codes').select('user_uid').eq('slug', slug).maybeSingle();
      if (error) throw error;
      if (!qr) {
        return res.status(404).json({ error: 'QR not found' });
      }
      const qrOwnerUid = qr.user_uid;

      await captureAnalyticsFromPayload(req.body, qrOwnerUid);
      res.send('OK');
    } catch (error: any) {
      logger.error('Internal scan error details:', { 
        message: error.message, 
        slug: req.body?.slug,
        stack: error.stack 
      });
      res.status(500).json({ error: 'Failed' });
    }
  });
  // Internal endpoint for Worker KV-miss fallback
  app.get('/internal/slug/:slug', async (req, res) => {
    try {
      const secret = req.headers['x-internal-secret'];
      if (!secret || secret !== process.env.INTERNAL_SECRET) {
        return res.status(401).send('Unauthorized');
      }

      const { slug } = req.params;
      const [qr, statsRow] = await Promise.all([row('qr_codes', 'slug', slug), row('qr_stats', 'slug', slug)]);
      if (!qr) {
        return res.status(404).send('Not Found');
      }
      const license = await getLicense(qr.user_uid);
      const stats = statsRow || { total_scans: 0 };

      // Lapse rule: after the grace period, the owner's oldest dynamic codes stay live up to the
      // allowance; the rest pause behind a holding page. Never deleted.
      let paused = false;
      if (qr.is_dynamic !== false && license.graceEndsAt && new Date() > license.graceEndsAt) {
        const { count, error } = await supabase.from('qr_codes')
          .select('slug', { count: 'exact', head: true })
          .eq('user_uid', qr.user_uid).eq('is_active', true).eq('is_dynamic', true)
          .eq('kind', isLink(qr) ? 'link' : 'qr')
          .lt('created_at', qr.created_at);
        if (error) throw error;
        paused = (count || 0) >= (isLink(qr) ? license.limits.short_links : license.limits.dynamic_qr_codes);
      }

      // Compact gate config for the Worker. Policy (quota, visitor guard) is decided here, from the
      // account-wide license, so the Worker never waits on the analytics write.
      const responseBody = {
        destination_url: qr.destination_url,
        is_active: qr.is_active,
        expiry_date: qr.expiry_date || null,
        password_hash: qr.password_hash || null,
        scan_limit: qr.rate_limit?.enabled ? qr.rate_limit.max_scans : null,
        total_scans: stats.total_scans || 0,
        visitor_rate_limit: license.limits.visitor_guard_gate && qr.visitor_rate_limit != null ? qr.visitor_rate_limit : 5,
        visitor_rate_period: license.limits.visitor_guard_gate && qr.visitor_rate_period != null ? qr.visitor_rate_period : 3600,
        visitor_guard: license.limits.visitor_guard_gate,
        quota_exceeded: license.monthlyUsed >= license.limits.monthly_scans,
        paused,
        title: qr.title || '',
        qr_type: qr.qr_type || 'url',
        content_data: qr.qr_type && qr.qr_type !== 'url' ? qr.content_data || {} : undefined,
        slug: qr.slug,
        app: (qr.qr_type || 'url') === 'url' && qr.content_data?.kind === 'app' ? qr.content_data.app : undefined, // device picks the store
        branding: !license.limits.remove_branding, // "Made with Scnr" on Free guest pages
        owner_plan: license.effectivePlan,
      };

      res.json(responseBody);
    } catch (error: any) {
      logger.error('Internal fetch error:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  // GS1 Digital Link: the Worker resolves /01/<gtin> to the owning code's slug, then runs the normal gates.
  app.get('/internal/gs1/:gtin', async (req, res) => {
    if (req.headers['x-internal-secret'] !== process.env.INTERNAL_SECRET || !process.env.INTERNAL_SECRET) return res.status(401).send('Unauthorized');
    const gtin = normGtin(req.params.gtin);
    if (!gtin) return res.status(400).json({ error: 'Invalid GTIN' });
    const { data, error } = await supabase.from('qr_codes').select('slug').eq('gtin', gtin).maybeSingle();
    if (error) return res.status(500).json({ error: 'Failed' });
    if (!data) return res.status(404).send('Not Found');
    res.json({ slug: data.slug });
  });

  // Local dev: tracked page links (the Worker does this in production).
  app.get('/:slug/l/:key', async (req, res, next) => {
    const qr = await row('qr_codes', 'slug', req.params.slug).catch(() => null);
    const target = qr?.qr_type === 'page' ? blockTarget(qr.content_data, req.params.key) : null;
    if (!target) return next();
    await supabase.rpc('record_click', { p_slug: qr.slug, p_key: req.params.key });
    res.redirect(302, target.url);
  });

  // Redirect Engine (Local Dev fallback)
  app.get('/:slug', async (req, res, next) => {
    const { slug } = req.params;
    
    // Ignore static assets and API routes
    if (slug.startsWith('api') || slug.startsWith('assets') || slug.includes('.')) {
      return next();
    }

    try {
      // 1. Look up destination
      const qrData = await row('qr_codes', 'slug', slug);
      if (!qrData) {
        return next(); // Let Vite handle it (might be a frontend route)
      }

      if (!qrData.is_active) {
        return res.status(410).send('QR code inactive');
      }

      // 2. Fire analytics async (don't block redirect)
      captureAnalytics(req, slug).catch(err => {
        logger.error('Analytics capture background error', { error: err.message });
      });

      // 3. Non-URL types render the same guest page / vCard / mailto as the Worker.
      const rendered = renderGuestPage(
        { ...qrData, branding: false },
        pickLang((req.query.lang as string) || null, req.headers['accept-language'] || null),
        `${req.protocol}://${req.headers.host}${req.originalUrl}`,
      );
      if (rendered?.kind === 'vcard' || rendered?.kind === 'ics') {
        res.setHeader('Content-Type', FILE_TYPES[rendered.kind]);
        res.setHeader('Content-Disposition', `attachment; filename="${rendered.filename}"`);
        return res.send(rendered.body);
      }
      if (rendered?.kind === 'redirect') return res.redirect(302, rendered.location);
      if (rendered?.kind === 'html') return res.type('html').send(rendered.body);

      const destination = appTarget(qrData.content_data?.app, req.headers['user-agent'] || '') || qrData.destination_url;
      if (!destination) {
        return res.status(404).send('Destination not found');
      }

      // Redirect immediately
      return res.redirect(302, destination);
    } catch (error: any) {
      logger.error('Redirect error', { error });
      next();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info('Server ready', {
        port: PORT,
        env: process.env.NODE_ENV,
        logLevel: process.env.LOG_LEVEL || 'debug',
        supabase: supabaseUrl.replace(/https?:\/\//, '').split('.')[0],
        cors: corsOrigin || '*',
        logFiles: process.env.NODE_ENV !== 'production' ? 'logs/combined.log + logs/error.log' : 'disabled',
      });
    });

    const shutdown = (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      setTimeout(() => {
        logger.error('Graceful shutdown timed out — forcing exit');
        process.exit(1);
      }, 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', { message: err.message, stack: err.stack });
      process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled promise rejection', { reason: String(reason) });
    });
  }
  return app;
}

await startServer().catch((err) => {
  logger.error('Server startup failed', { error: err.message, stack: err.stack });
  process.exit(1);
});

// Analytics Capture Logic
async function captureAnalyticsFromPayload(payload: any, qrOwnerUid?: string) {
  const { slug, ua, country, referer, status } = payload;
  if (isBot(ua)) return;
  const isUnique = payload.is_unique !== false;
  const parsed = parseUA(ua || '');
  const args = {
    p_slug: slug, p_owner: qrOwnerUid || null, p_country: country || 'Unknown',
    p_device: parsed.device, p_browser: parsed.browser, p_os: parsed.os,
    p_referer: referer || '', p_is_unique: isUnique, p_failed: status === 'failed_password',
  };
  const { error } = await supabase.rpc('record_scan', args);
  if (error) throw new Error(`record_scan failed: ${error.message}`);
}

async function captureAnalytics(req: express.Request, slug: string) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';
  const country = (req.headers['cf-ipcountry'] as string) || 'US';

  const payload = {
    slug, ip, ua, country,
    referer: req.headers.referer || '',
    lang: req.headers['accept-language'] || '',
    asn: null, colo: null, tls: null, is_eu: false
  };

  // For internal dev redirects, find the owner too
  const { data: qr } = await supabase.from('qr_codes').select('user_uid').eq('slug', slug).maybeSingle();
  const ownerUid = qr?.user_uid;

  await captureAnalyticsFromPayload(payload, ownerUid);
}

function parseUA(ua: string) {
  const ua_lower = ua.toLowerCase();
  
  const device = 
    /mobile|android|iphone|ipad/.test(ua_lower) ? 'mobile' :
    /tablet|ipad/.test(ua_lower) ? 'tablet' : 'desktop';

  const os =
    /android/.test(ua_lower) ? 'Android' :
    /iphone|ipad|ios/.test(ua_lower) ? 'iOS' :
    /windows/.test(ua_lower) ? 'Windows' :
    /mac os/.test(ua_lower) ? 'macOS' :
    /linux/.test(ua_lower) ? 'Linux' : 'Unknown';

  const browser =
    /edg\//.test(ua_lower) ? 'Edge' :
    /opr\/|opera/.test(ua_lower) ? 'Opera' :
    /chrome/.test(ua_lower) ? 'Chrome' :
    /safari/.test(ua_lower) ? 'Safari' :
    /firefox/.test(ua_lower) ? 'Firefox' : 'Other';

  const androidMatch = ua.match(/Android ([\d.]+)/);
  const iosMatch = ua.match(/OS ([\d_]+)/);
  const osVersion = androidMatch?.[1] || iosMatch?.[1]?.replace(/_/g, '.') || null;

  return { device, os, osVersion, browser };
}

function isBot(ua: string) {
  return /bot|crawler|spider|preview|facebookexternalhit|googlebot|twitterbot|slackbot|whatsapp|telegram/i.test(ua);
}

export default app;

