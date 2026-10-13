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
import { renderGuestPage, pickLang, appTarget, FILE_TYPES, blockTarget, esc as escHtml } from './src/lib/guestPage.js';
import { gtinValid, isReservedSlug, CUSTOM_SLUG_RE, normTags, withUtm } from './src/lib/qrContent.js';
import { buildDigest } from './src/lib/digest.js';
import { formDefError, validateSubmission } from './src/lib/forms.js';
import { pickRoute, routeCtx, rulesError } from './src/lib/routing.js';
import { signStandardWebhook, verifyStandardWebhook, newWebhookSecret, WEBHOOK_EVENTS } from './src/lib/webhooks.js';
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
  async function workspaceOwner(user: any): Promise<{ owner: string; workspace: string | null } | null> {
    const email = String(user.email || '').toLowerCase().replace(/"/g, '');
    const { data, error } = await supabase.from('workspace_members').select('id, owner_uid, member_uid, workspace_id')
      .or(`member_uid.eq.${user.id},member_email.eq."${email}"`).limit(1);
    const m = !error && data?.[0];
    if (!m || m.owner_uid === user.id) return null;
    const license = await getLicense(m.owner_uid);
    if (license.limits.seats <= 1) return null; // owner no longer on a multi-seat plan
    if (!m.member_uid) await supabase.from('workspace_members').update({ member_uid: user.id }).eq('id', m.id);
    return { owner: m.owner_uid, workspace: m.workspace_id || null }; // a member invited to one workspace is held to it
  }

  // Business workspaces. user.workspace: undefined = every workspace (no header, the API default), null = the
  // default workspace ("X-Workspace: default"), a uuid = that workspace. Caps stay account-wide.
  async function resolveWorkspace(req: express.Request, owner: string, memberWs: string | null): Promise<string | null | undefined | false> {
    const h = req.headers['x-workspace'];
    const want = h === undefined || h === '' ? undefined : h === 'default' ? null : String(h);
    if (memberWs) return want === undefined || want === memberWs ? memberWs : false;
    if (typeof want !== 'string') return want;
    const { data } = await supabase.from('workspaces').select('id').eq('id', want).eq('owner_uid', owner).maybeSingle().then(r => r, () => ({ data: null }));
    return data ? want : false;
  }
  const inWorkspace = (user: any, q: any) => user.workspace === undefined || (q.workspace_id || null) === user.workspace;

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
        const ws = await resolveWorkspace(req, key.uid, null);
        if (ws === false) return res.status(403).json({ error: 'Unknown workspace', code: 'WORKSPACE' });
        (req as any).user = { uid: key.uid, realUid: key.uid, email: null, viaApiKey: true, workspace: ws };
        supabase.from('api_keys').update({ last_used_at: nowIso() }).eq('id', key.id).then(() => {});
        return next();
      }

      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) throw error || new Error("User not found");
      // Team members act on the owner's workspace (uid); realUid is who signed in.
      const m = await workspaceOwner(user);
      const uid = m?.owner || user.id;
      const ws = await resolveWorkspace(req, uid, m?.workspace || null);
      if (ws === false) return res.status(403).json({ error: 'You do not have access to this workspace', code: 'WORKSPACE' });
      (req as any).user = { ...user, uid, realUid: user.id, email: user.email, isMember: !!m, workspace: ws, workspaceLocked: !!m?.workspace };
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
      if (qr.user_uid !== user.uid || !inWorkspace(user, qr)) {
        return res.status(403).send('Forbidden');
      }
      (req as any).qr = qr;
      next();
    } catch (error) {
      logger.error('Ownership check error:', error);
      res.status(500).send('Internal Server Error');
    }
  };

  const QR_TYPES = ['url', 'vcard', 'wifi', 'text', 'email', 'page', 'event', 'form'];
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
  async function capError(uid: string, limits: PlanLimits, next: { slug?: string; kind?: string; qr_type?: string; is_dynamic?: boolean }, activeRows?: any[]) {
    // `next` itself is left out of the counts, so an edit of an existing row is checked like a create.
    // `activeRows` lets a caller that checks many rows read the account once.
    const active = (activeRows || (await rows('qr_codes', 'user_uid', uid)).filter(q => q.is_active !== false)).filter(q => q.slug !== next.slug);
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
  // Form notifications only go to the owner's account email or a team member's, so a form cannot mail strangers.
  const notifyAllowed = async (uid: string, to: unknown) => {
    if (!to) return true;
    const [p, { data: members }] = await Promise.all([row('profiles', 'id', uid), supabase.from('workspace_members').select('member_email').eq('owner_uid', uid)]);
    return [p?.email, ...(members || []).map(m => m.member_email)].some(e => e && e.toLowerCase() === String(to).toLowerCase());
  };
  // PostgREST returns at most 1,000 rows per request: read in pages up to `max`.
  const allRows = async (q: (from: number, to: number) => any, max: number) => {
    const out: any[] = [];
    for (let from = 0; from < max; from += 1000) {
      const { data, error } = await q(from, Math.min(from + 999, max - 1));
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  };

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
  /** Verified custom domains (Pro 1, Team 10, Business 50). */
  async function activeDomains(uid: string): Promise<string[]> {
    const { data } = await supabase.from('custom_domains').select('hostname').eq('uid', uid).eq('status', 'active').order('created_at');
    return (data || []).map(d => d.hostname);
  }
  const activeDomain = async (uid: string) => (await activeDomains(uid))[0] || null; // the account default for printing

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
        custom_domains: await activeDomains(uid),
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
        qr_codes: qrs,
        form_submissions: await (async () => {
          const formSlugs = qrs.filter(q => q.qr_type === 'form').map(q => q.slug);
          if (!formSlugs.length) return [];
          return allRows((from, to) => supabase.from('form_submissions').select('slug, data, created_at').in('slug', formSlugs).order('created_at').range(from, to), 50000);
        })(),
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
      if (!secret || !verifyStandardWebhook(req.headers, raw, secret)) {
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
      const routeErr = rulesError(content_data?.rules);
      if (routeErr) return res.status(400).json({ error: routeErr, code: 'INVALID_RULES' });
      const formErr = type === 'form' ? formDefError(content_data) : null;
      if (formErr) return res.status(400).json({ error: formErr, code: 'INVALID_FORM' });
      if (type === 'form' && !(await notifyAllowed(user.uid, content_data?.notify_email))) {
        return res.status(400).json({ error: "Notifications can go to your account email or a team member's", code: 'INVALID_FORM' });
      }
      const gtin = req.body.gtin === undefined ? null : normGtin(req.body.gtin);
      if (gtin === undefined) return res.status(400).json({ error: 'gtin must be a GTIN-8, 12, 13 or 14 with a valid check digit', code: 'INVALID_GTIN' });
      // Custom back-half (Pro and up): charset, not a route, not taken. The primary key settles races (23505 → 409).
      const customSlug = req.body.slug;
      if (customSlug !== undefined && customSlug !== '') {
        if (typeof customSlug !== 'string' || !CUSTOM_SLUG_RE.test(customSlug)) return res.status(400).json({ error: 'A custom back-half is 3–40 letters, digits or dashes', code: 'INVALID_SLUG' });
        if (isReservedSlug(customSlug)) return res.status(400).json({ error: `"${customSlug}" is reserved. Pick another back-half.`, code: 'RESERVED_SLUG' });
      }
      const tags = normTags(req.body.tags);
      // Which verified custom domain the code prints with (Business has up to 50). null/absent = the account default.
      const domain = req.body.domain ? String(req.body.domain).toLowerCase() : null;
      if (domain && !(await activeDomains(user.uid)).includes(domain)) return res.status(400).json({ error: 'domain must be one of your verified custom domains', code: 'INVALID_DOMAIN' });
      // Guest pages, events and GS1 codes only exist as dynamic codes; every other type can be either.
      const is_dynamic = type === 'page' || type === 'event' || type === 'form' || !!gtin || requestedDynamic !== false;
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
      if (content_data?.rules?.length && !license.limits.smart_routing) return res.status(403).json({ error: 'Smart routing needs the Pro plan or above', code: 'FEATURE_ROUTING' });
      if (content_data?.gps === true && !license.limits.gps_tracking) return res.status(403).json({ error: 'GPS tracking needs the Pro plan or above', code: 'FEATURE_GPS' });
      if (options?.expiry_date_enabled && !license.limits.expiry_gate) {
        return res.status(403).json({ error: 'Expiry dates require Pro plan', code: 'FEATURE_EXPIRY' });
      }
      if (options?.scan_limit_enabled && !license.limits.scan_limit_gate) {
        return res.status(403).json({ error: 'Scan limits require Pro plan', code: 'FEATURE_SCAN_LIMIT' });
      }

      if (customSlug && !license.limits.custom_slug) {
        return res.status(403).json({ error: 'Custom back-halves need the Pro plan or above', code: 'FEATURE_CUSTOM_SLUG' });
      }
      if (customSlug && !is_dynamic) return res.status(400).json({ error: 'Only dynamic codes and links have a back-half' });
      if (customSlug && await row('qr_codes', 'slug', customSlug)) return res.status(409).json({ error: 'That back-half is taken', code: 'SLUG_TAKEN' });

      // 2. Slug Generation
      let slug;
      try {
        slug = customSlug || await createUniqueSlug();
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
        ...(tags?.length ? { tags } : {}),
        ...(user.workspace ? { workspace_id: user.workspace } : {}),
        ...(domain ? { domain } : {}),
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
      if (qrErr?.code === '23505' && customSlug && !String(qrErr.message).includes('gtin')) return res.status(409).json({ error: 'That back-half is taken', code: 'SLUG_TAKEN' });
      if (qrErr?.code === '23505' && gtin) return res.status(409).json({ error: 'This GTIN is already used by another code', code: 'GTIN_TAKEN' });
      if (qrErr) throw new Error(`Database save failed: ${qrErr.message}`);
      const { error: statsErr } = await supabase.from('qr_stats').insert({ slug, ...statsDoc });
      if (statsErr) throw new Error(`Database save failed: ${statsErr.message}`);

      logEvent(uid, 'qr_created', slug);
      await deliver(uid, 'qr.created', publicQr(qrDoc));
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
      // Optional filters: ?kind=qr|link, ?qr_type=page, ?tag=menu, ?folder=<client>.
      const q = req.query as Record<string, string>;
      const mine = (await rows('qr_codes', 'user_uid', uid)).filter(r =>
        (!q.kind || (r.kind || 'qr') === q.kind) && (!q.qr_type || (r.qr_type || 'url') === q.qr_type)
        && (!q.tag || (r.tags || []).includes(String(q.tag).toLowerCase())) && (!q.folder || r.client === q.folder)
        && inWorkspace((req as any).user, r));
      const statsMap: Record<string, any> = {};
      for (const st of await statsFor(mine.map(q => q.slug))) statsMap[st.slug] = st;
      const qrs = mine.map(q => ({ id: q.slug, ...publicQr(q), stats: statsMap[q.slug] || null }));

      res.json(qrs);
    } catch (error: any) {
      logger.error('QR list error:', error);
      res.status(500).json({ error: 'Failed to list QR codes' });
    }
  });

  // Form submissions (owner): newest first, up to 5,000; delete one.
  app.get('/api/forms/:slug/submissions', authenticate, requireOwnership, async (req, res) => {
    try {
      res.json(await allRows((from, to) => supabase.from('form_submissions').select('id, data, created_at')
        .eq('slug', req.params.slug).order('created_at', { ascending: false }).range(from, to), 5000));
    } catch (error: any) {
      logger.error('Submissions list error', { message: error.message });
      res.status(500).json({ error: 'Failed to list submissions' });
    }
  });
  app.delete('/api/forms/:slug/submissions/:id', writeLimiter, authenticate, requireOwnership, async (req, res) => {
    const { error, count } = await supabase.from('form_submissions').delete({ count: 'exact' }).eq('slug', req.params.slug).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: 'Invalid submission id' });
    res.status(count ? 200 : 404).json({ deleted: count || 0 });
  });

  // Select mode: one action on many codes. Ownership is checked per slug; every changed code is purged at the edge.
  app.post('/api/qr/bulk', writeLimiter, authenticate, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const { slugs, action, value } = req.body || {};
      if (!Array.isArray(slugs) || !slugs.length || slugs.length > 500 || !slugs.every(x => typeof x === 'string')) {
        return res.status(400).json({ error: 'slugs must be 1–500 slugs' });
      }
      if (!['folder', 'tag', 'untag', 'activate', 'deactivate', 'delete'].includes(action)) {
        return res.status(400).json({ error: 'action must be folder, tag, untag, activate, deactivate or delete' });
      }
      const { data: owned, error } = await supabase.from('qr_codes').select('slug, is_active, is_dynamic, kind, qr_type, tags, gtin, workspace_id').eq('user_uid', uid).in('slug', slugs);
      if (error) throw error;
      const tag = normTags([value])?.[0];
      if ((action === 'tag' || action === 'untag') && !tag) return res.status(400).json({ error: 'value must be a tag' });
      const mine = (owned || []).filter(q => inWorkspace((req as any).user, q));
      const failed: { slug: string; error: string }[] = slugs.filter(sl => !mine.some(o => o.slug === sl)).map(sl => ({ slug: sl, error: 'not found' }));
      let done: string[] = [];
      const all = mine.map(q => q.slug);
      if (!all.length) return res.json({ done: [], failed });
      if (action === 'folder' || action === 'deactivate') {
        const patch = action === 'folder' ? { client: typeof value === 'string' && value.trim() ? value.trim().slice(0, 60) : null } : { is_active: false };
        const { error: e } = await supabase.from('qr_codes').update({ ...patch, updated_at: nowIso() }).in('slug', all);
        if (e) throw e;
        done = all;
      } else if (action === 'delete') {
        const { error: e } = await supabase.from('qr_codes').delete().in('slug', all);
        if (e) throw e;
        done = all;
        mine.filter(q => q.gtin).forEach(q => purgeEdge(`gs1:${q.gtin}`));
      } else if (action === 'activate') {
        // One at a time against one read of the account, so each activation counts the ones before it.
        const { limits } = await getLicense(uid);
        const active = (await rows('qr_codes', 'user_uid', uid)).filter(q => q.is_active !== false);
        for (const qr of mine) {
          if (qr.is_active !== false) { done.push(qr.slug); continue; }
          const capped = await capError(uid, limits, qr, active);
          if (capped) { failed.push({ slug: qr.slug, error: capped.code }); continue; }
          active.push({ ...qr, is_active: true });
          done.push(qr.slug);
        }
        if (done.length) {
          const { error: e } = await supabase.from('qr_codes').update({ is_active: true, updated_at: nowIso() }).in('slug', done);
          if (e) throw e;
        }
      } else {
        // tag / untag: each row keeps its own list (at most 10 tags).
        for (const qr of mine) {
          const tagsNow = action === 'tag' ? normTags([...(qr.tags || []), tag])! : (qr.tags || []).filter((t: string) => t !== tag);
          if (action === 'tag' && !tagsNow.includes(tag!)) { failed.push({ slug: qr.slug, error: 'already has 10 tags' }); continue; }
          const { error: e } = await supabase.from('qr_codes').update({ tags: tagsNow, updated_at: nowIso() }).eq('slug', qr.slug);
          if (e) { failed.push({ slug: qr.slug, error: 'failed' }); continue; }
          done.push(qr.slug);
        }
      }
      // Folders and tags never reach the Worker; only status changes need an edge purge.
      if (action === 'activate' || action === 'deactivate' || action === 'delete') await Promise.all(done.map(purgeEdge));
      res.json({ done, failed });
    } catch (error: any) {
      logger.error('Bulk action error:', { message: error.message });
      res.status(500).json({ error: 'Bulk action failed' });
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
      if (req.body.domain !== undefined && (req as any).qr) {
        updateData.domain = req.body.domain ? String(req.body.domain).toLowerCase() : null;
        if (updateData.domain && !(await activeDomains((req as any).qr.user_uid)).includes(updateData.domain)) {
          return res.status(400).json({ error: 'domain must be one of your verified custom domains', code: 'INVALID_DOMAIN' });
        }
      }
      if (req.body.tags !== undefined) {
        updateData.tags = normTags(req.body.tags);
        if (!updateData.tags) return res.status(400).json({ error: 'tags must be an array of strings' });
      }
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
        if (type === 'form' && formDefError(content_data ?? cur.content_data)) {
          return res.status(400).json({ error: formDefError(content_data ?? cur.content_data), code: 'INVALID_FORM' });
        }
        if (type === 'form' && !(await notifyAllowed(cur.user_uid, (content_data ?? cur.content_data)?.notify_email))) {
          return res.status(400).json({ error: "Notifications can go to your account email or a team member's", code: 'INVALID_FORM' });
        }
        if (content_data !== undefined) {
          const routeErr = rulesError(content_data?.rules);
          if (routeErr) return res.status(400).json({ error: routeErr, code: 'INVALID_RULES' });
          if (content_data?.rules?.length || content_data?.gps === true) {
            const { limits } = await getLicense(cur.user_uid);
            if (content_data?.rules?.length && !limits.smart_routing) return res.status(403).json({ error: 'Smart routing needs the Pro plan or above', code: 'FEATURE_ROUTING' });
            if (content_data?.gps === true && !limits.gps_tracking) return res.status(403).json({ error: 'GPS tracking needs the Pro plan or above', code: 'FEATURE_GPS' });
          }
        }
        // Static → dynamic (asked for, or implied by an event or a GTIN). Dynamic never goes back: the print encodes the slug.
        const toDynamic = cur.is_dynamic === false && (req.body.is_dynamic === true || type === 'event' || type === 'form' || !!(updateData.gtin ?? cur.gtin));
        if (toDynamic) updateData.is_dynamic = true;
        // Switching a row back on, or making it dynamic, must fit the plan caps like creating it.
        if ((is_active === true && cur.is_active === false) || toDynamic || (updateData.qr_type && cur.is_active !== false)) {
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
      if (cur) await deliver(cur.user_uid, 'qr.updated', { slug, ...updateData });
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
      await deliver((req as any).qr.user_uid, 'qr.deleted', { slug, title: (req as any).qr.title });
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
      const { data, error } = await supabase.from('qr_codes').select('slug, title, is_active, created_at, workspace_id').eq('user_uid', uid);
      if (error) throw error;
      const only = typeof req.query.slugs === 'string' ? req.query.slugs.split(',') : null;
      qrs = (data || []).filter(q => (!only || only.includes(q.slug)) && inWorkspace((req as any).user, q));
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
    // Phase 10: all-time maps like `countries`, and the opt-in GPS points.
    cities: ({ stats }) => Object.entries(sumMap(stats, 'cities')).map(([city, scans]) => ({ city, scans })).sort((a, b) => b.scans - a.scans).slice(0, 10),
    languages: ({ stats }) => pctRows(sumMap(stats, 'languages'), 'language').slice(0, 10),
    referrers: ({ stats }) => pctRows(sumMap(stats, 'referrers'), 'referrer').slice(0, 10),
    // ponytail: the newest 1,000 fixes; cluster server-side if a code collects far more.
    geo: async ({ slugs }) => {
      if (!slugs.length) return [];
      const { data, error } = await supabase.from('scan_events').select('lat, lng, scanned_at').in('slug', slugs)
        .not('lat', 'is', null).order('scanned_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return data || [];
    },
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
    const { data, error } = await supabase.from('workspace_members').select('*')
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
      // Optional: hold the member to one workspace (Business). Otherwise they see every workspace.
      const workspace_id = req.body?.workspace_id ? String(req.body.workspace_id) : null;
      if (workspace_id && !(await supabase.from('workspaces').select('id').eq('id', workspace_id).eq('owner_uid', uid).maybeSingle().then(r => r.data, () => null))) {
        return res.status(400).json({ error: 'Unknown workspace' });
      }
      const { data, error } = await supabase.from('workspace_members').insert({ owner_uid: uid, member_email: email, ...(workspace_id ? { workspace_id } : {}) }).select('id, member_email, workspace_id').single();
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
      const { data, error } = await supabase.from('custom_domains').select('id, hostname, cf_id, status').eq('uid', (req as any).user.uid).order('created_at');
      if (error) throw error;
      for (const d of data || []) {
        if (d.status === 'pending' && d.cf_id && process.env.CF_API_TOKEN) {
          const r = await cf(`/custom_hostnames/${d.cf_id}`);
          const status = cfStatus(r.body?.result);
          if (status !== d.status) await supabase.from('custom_domains').update({ status }).eq('id', d.id);
          d.status = status;
        }
      }
      res.json((data || []).map(d => ({ id: d.id, hostname: d.hostname, status: d.status, cname_target: process.env.CF_CNAME_TARGET || null })));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load domains' });
    }
  });

  app.post('/api/domains', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const license = await getLicense(uid);
      if (license.limits.custom_domains < 1) return res.status(403).json({ error: 'A custom domain needs the Pro plan or above', code: 'FEATURE_CUSTOM_DOMAIN' });
      const hostname = String(req.body?.hostname || '').trim().toLowerCase();
      if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(hostname)) return res.status(400).json({ error: 'Enter a hostname like qr.yourbusiness.lk' });
      const { count } = await supabase.from('custom_domains').select('id', { count: 'exact', head: true }).eq('uid', uid);
      if ((count || 0) >= license.limits.custom_domains) {
        return res.status(403).json({ error: `Your plan includes ${license.limits.custom_domains} custom domain${license.limits.custom_domains === 1 ? '' : 's'}`, code: 'LIMIT_DOMAINS', limit: license.limits.custom_domains });
      }
      if (await row('custom_domains', 'hostname', hostname)) return res.status(409).json({ error: 'This hostname is already connected' });
      if (!process.env.CF_API_TOKEN || !process.env.CF_ZONE_ID) return res.status(503).json({ error: 'Custom domains are not enabled yet' });
      const r = await cf('/custom_hostnames', { method: 'POST', body: JSON.stringify({ hostname, ssl: { method: 'http', type: 'dv' } }) });
      if (!r.ok) return res.status(400).json({ error: r.body?.errors?.[0]?.message || 'Cloudflare rejected this hostname' });
      const { data, error } = await supabase.from('custom_domains').insert({ uid, hostname, cf_id: r.body.result.id, status: cfStatus(r.body.result) }).select('id').single();
      if (error) throw error;
      res.status(201).json({ id: data.id, hostname, status: cfStatus(r.body.result), cname_target: process.env.CF_CNAME_TARGET || null });
    } catch (error: any) {
      logger.error('Custom domain error', { message: error.message });
      res.status(500).json({ error: 'Failed to add domain' });
    }
  });

  app.delete('/api/domains/:id', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    const { data: d } = await supabase.from('custom_domains').select('id, cf_id, hostname').eq('id', req.params.id).eq('uid', (req as any).user.uid).maybeSingle().then(r => r, () => ({ data: null }));
    if (!d) return res.status(404).json({ error: 'Not found' });
    if (d.cf_id && process.env.CF_API_TOKEN) await cf(`/custom_hostnames/${d.cf_id}`, { method: 'DELETE' });
    await supabase.from('custom_domains').delete().eq('id', d.id);
    // Codes that printed with it fall back to the account default.
    await supabase.from('qr_codes').update({ domain: null }).eq('user_uid', (req as any).user.uid).eq('domain', d.hostname);
    res.json({ success: true });
  });

  // ── Workspaces (Business: up to 10, the default one included) ─────────────
  app.get('/api/workspaces', authenticate, async (req, res) => {
    const u = (req as any).user;
    let q = supabase.from('workspaces').select('id, name, created_at').eq('owner_uid', u.uid).order('created_at');
    if (u.workspaceLocked) q = q.eq('id', u.workspace);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: 'Failed to list workspaces' });
    res.json(data || []);
  });
  app.post('/api/workspaces', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    const uid = (req as any).user.uid;
    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: 'Name your workspace' });
    const { limits } = await getLicense(uid);
    const { count } = await supabase.from('workspaces').select('id', { count: 'exact', head: true }).eq('owner_uid', uid);
    if ((count || 0) + 1 >= limits.workspaces) {
      return res.status(403).json({ error: `Your plan includes ${limits.workspaces} workspace${limits.workspaces === 1 ? '' : 's'}`, code: 'LIMIT_WORKSPACES', limit: limits.workspaces });
    }
    const { data, error } = await supabase.from('workspaces').insert({ owner_uid: uid, name }).select('id, name, created_at').single();
    if (error) return res.status(500).json({ error: 'Failed to create workspace' });
    res.status(201).json(data);
  });
  app.patch('/api/workspaces/:id', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: 'Name your workspace' });
    const { data, error } = await supabase.from('workspaces').update({ name }).eq('id', req.params.id).eq('owner_uid', (req as any).user.uid).select('id').maybeSingle();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  });
  // Deleting a workspace moves its codes and members back to the default one (on delete set null).
  app.delete('/api/workspaces/:id', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    const { data, error } = await supabase.from('workspaces').delete().eq('id', req.params.id).eq('owner_uid', (req as any).user.uid).select('id').maybeSingle();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  });

  // ── Webhooks (Business) ────────────────────────────────────────────────────
  // ponytail: https only and no obvious private hosts; a public name that resolves to a private IP is not caught.
  // Upgrade path: resolve the name and check the address before each delivery.
  const webhookUrlError = (u: unknown): string | null => {
    let url: URL;
    try { url = new URL(String(u)); } catch { return 'Enter a full URL'; }
    const local = /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
    if (process.env.NODE_ENV === 'test' && local && url.protocol === 'http:') return null; // QA's local receiver
    if (url.protocol !== 'https:') return 'Webhook URLs must use https';
    if (local || /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[|.*\.(local|internal)$)/i.test(url.hostname)) return 'Webhook URLs must be public';
    return null;
  };

  // Delivers one event to the owner's endpoints that subscribed to it, signed like Standard Webhooks.
  // ponytail: retries 3 times inside the request (0.5 s, 1 s); move to a queue if endpoints are slow or many.
  async function deliver(uid: string | undefined, event: string, data: any, onlyId?: string): Promise<number[]> {
    if (!uid) return [];
    let q = supabase.from('webhooks').select('id, url, secret, events').eq('uid', uid);
    if (onlyId) q = q.eq('id', onlyId);
    const { data: hooks, error } = await q;
    const targets = (hooks || []).filter(h => onlyId || (h.events || []).includes(event));
    if (error || !targets.length) return [];
    if (!onlyId && !(await getLicense(uid)).limits.webhooks) return []; // stops when the plan lapses
    return Promise.all(targets.map(async h => {
      const id = `msg_${crypto.randomUUID()}`, body = JSON.stringify({ type: event, timestamp: nowIso(), data });
      let status = 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await new Promise(r => setTimeout(r, attempt * 500));
        const ts = Math.floor(Date.now() / 1000);
        try {
          const r = await fetch(h.url, {
            method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(4000), body,
            headers: { 'Content-Type': 'application/json', 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': signStandardWebhook(id, ts, body, h.secret) },
          });
          status = r.status;
          if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) break; // 4xx is the receiver's answer
        } catch { status = 0; }
      }
      await supabase.from('webhooks').update({ last_status: status, last_delivery_at: nowIso() }).eq('id', h.id);
      return status;
    }));
  }

  app.get('/api/webhooks', authenticate, sessionOwner, async (req, res) => {
    const { data, error } = await supabase.from('webhooks').select('id, url, events, created_at, last_status, last_delivery_at')
      .eq('uid', (req as any).user.uid).order('created_at');
    if (error) return res.status(500).json({ error: 'Failed to list webhooks' });
    res.json(data || []);
  });
  app.post('/api/webhooks', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    const uid = (req as any).user.uid;
    if (!(await getLicense(uid)).limits.webhooks) return res.status(403).json({ error: 'Webhooks are part of the Business plan', code: 'FEATURE_WEBHOOKS' });
    const urlErr = webhookUrlError(req.body?.url);
    if (urlErr) return res.status(400).json({ error: urlErr });
    const events: string[] = Array.isArray(req.body?.events) ? [...new Set<string>(req.body.events.map(String))] : [];
    if (!events.length || events.some(e => !(WEBHOOK_EVENTS as readonly string[]).includes(e))) {
      return res.status(400).json({ error: `events must be some of ${WEBHOOK_EVENTS.join(', ')}` });
    }
    const { count } = await supabase.from('webhooks').select('id', { count: 'exact', head: true }).eq('uid', uid);
    if ((count || 0) >= 10) return res.status(403).json({ error: 'Up to 10 webhooks per account', code: 'LIMIT_WEBHOOKS' });
    const secret = newWebhookSecret();
    const { data, error } = await supabase.from('webhooks').insert({ uid, url: String(req.body.url), secret, events }).select('id, url, events, created_at').single();
    if (error) return res.status(500).json({ error: 'Failed to add webhook' });
    res.status(201).json({ ...data, secret }); // the secret is shown once
  });
  app.post('/api/webhooks/:id/test', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    const [status] = await deliver((req as any).user.uid, 'webhook.test', { message: 'Hello from Scnr' }, req.params.id);
    if (status === undefined) return res.status(404).json({ error: 'Not found' });
    res.json({ status, ok: status >= 200 && status < 300 });
  });
  app.delete('/api/webhooks/:id', writeLimiter, authenticate, sessionOwner, async (req, res) => {
    const { error } = await supabase.from('webhooks').delete().eq('id', req.params.id).eq('uid', (req as any).user.uid);
    if (error) return res.status(400).json({ error: 'Invalid webhook id' });
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

  // Transactional email through Resend (digest, form notifications). Returns false when not configured or on failure.
  const sendEmail = async (to: string, subject: string, html: string, from = process.env.DIGEST_FROM || 'Scnr <digest@scnr.app>') => {
    const key = process.env.RESEND_API_KEY;
    if (!key) return false;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    return !!r?.ok;
  };

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
        if (!dry && !(await sendEmail(o.email, d.subject, d.html))) logger.warn('Digest send failed', { uid: o.id });
        out.push({ uid: o.id, total: d.total, busiestHour: d.busiestHour, top: d.top, subject: d.subject });
      }
      res.json({ sent: dry ? 0 : out.length, digests: dry ? out : undefined });
    } catch (error: any) {
      logger.error('Digest cron error', { message: error.message });
      res.status(500).json({ error: 'Digest failed' });
    }
  });

  // One form answer: validated against the stored definition, stored, and emailed to the owner when asked.
  async function submitForm(slug: string, fields: Record<string, unknown>, visitor: unknown): Promise<[number, any]> {
    const qr = await row('qr_codes', 'slug', slug);
    if (!qr || qr.qr_type !== 'form' || qr.is_active === false) return [404, { error: 'Form not found' }];
    const result = validateSubmission(qr.content_data, fields || {});
    if ('error' in result) return [400, { error: result.error }];
    if (result.spam) return [200, { ok: true }];
    const ip_hash = typeof visitor === 'string' ? visitor.slice(0, 64) : null;
    const { error } = await supabase.from('form_submissions').insert({ slug: qr.slug, data: result.data, ip_hash });
    if (error) throw error;
    await deliver(qr.user_uid, 'form.submitted', { slug: qr.slug, data: result.data, submitted_at: nowIso() });
    const to = qr.content_data?.notify_email;
    // Awaited: on Vercel the function may freeze once the response is sent. Re-checked so an old definition cannot mail strangers.
    if (to && await notifyAllowed(qr.user_uid, to)) {
      const rowsHtml = Object.entries(result.data).map(([k, v]) => {
        const label = (qr.content_data.fields || []).find((f: any) => f.id === k)?.label || k;
        return `<tr><td style="padding:4px 12px 4px 0;color:#666">${escHtml(label)}</td><td>${escHtml(v)}</td></tr>`;
      }).join('');
      const sent = await sendEmail(String(to), `New response: ${String(qr.content_data.title || qr.title || 'your form').slice(0, 80)}`,
        `<p>Someone filled in <b>${escHtml(qr.content_data.title || qr.title)}</b>.</p><table>${rowsHtml}</table>`);
      if (!sent && process.env.RESEND_API_KEY) logger.warn('Form notification failed', { slug });
    }
    return [200, { ok: true }];
  }

  // GPS (opt-in per code): the interstitial's fix, linked to its scan by the Worker's event id. Rounded to 3 decimals (~100 m).
  app.post('/internal/geo', async (req, res) => {
    if (!process.env.INTERNAL_SECRET || req.headers['x-internal-secret'] !== process.env.INTERNAL_SECRET) return res.status(401).send('Unauthorized');
    const { slug, event_id } = req.body || {};
    const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
    if (typeof slug !== 'string' || !/^[0-9a-f-]{36}$/i.test(String(event_id)) || !(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)) {
      return res.status(400).json({ error: 'slug, event_id, lat and lng required' });
    }
    const round = (n: number) => Math.round(n * 1000) / 1000;
    // Only a scan from the last 10 minutes without a fix yet, so a replayed id cannot move old points.
    const { error } = await supabase.from('scan_events').update({ lat: round(lat), lng: round(lng) })
      .eq('id', event_id).eq('slug', slug).is('lat', null).gte('scanned_at', new Date(Date.now() - 600000).toISOString());
    if (error) { logger.error('Geo update failed', { message: error.message }); return res.status(500).send('Failed'); }
    res.status(204).end();
  });

  // Forms: the Worker forwards a POST here (after its gates and its per-visitor KV counter).
  // The stored definition is the trust boundary: unknown fields are stripped, a filled honeypot is dropped silently.
  app.post('/internal/form/:slug', async (req, res) => {
    try {
      if (!process.env.INTERNAL_SECRET || req.headers['x-internal-secret'] !== process.env.INTERNAL_SECRET) return res.status(401).send('Unauthorized');
      const [status, body] = await submitForm(req.params.slug, req.body?.fields, req.body?.visitor);
      res.status(status).json(body);
    } catch (error: any) {
      logger.error('Form submit error', { message: error.message });
      res.status(500).json({ error: 'Could not save your answer' });
    }
  });

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
      // Called by the Worker in waitUntil, so delivering here never slows a scan.
      if (req.body.status !== 'failed_password' && !isBot(req.body.ua)) {
        await deliver(qrOwnerUid, 'scan.created', { slug, scanned_at: nowIso(), country: req.body.country || null, city: req.body.city || null, referer: req.body.referer || null });
      }
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
        utm: (qr.qr_type || 'url') === 'url' ? qr.content_data?.utm : undefined, // appended on redirect; existing params win
        // Phase 10 (Pro and up): routing rules, and the opt-in GPS interstitial. Dropped when the plan lapses.
        rules: (qr.qr_type || 'url') === 'url' && license.limits.smart_routing && Array.isArray(qr.content_data?.rules) ? qr.content_data.rules : undefined,
        gps: (qr.qr_type || 'url') === 'url' && license.limits.gps_tracking && qr.content_data?.gps === true ? true : undefined,
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

  // Local dev: form answers (the Worker does this in production, with its per-visitor cap).
  app.post('/:slug', express.urlencoded({ extended: false, limit: '64kb' }), async (req, res, next) => {
    const qr = await row('qr_codes', 'slug', req.params.slug).catch(() => null);
    if (qr?.qr_type !== 'form') return next();
    const [status, body] = await submitForm(qr.slug, req.body || {}, null);
    const lang = pickLang((req.query.lang as string) || null, req.headers['accept-language'] || null);
    const r = renderGuestPage({ ...qr, branding: false }, lang, `${req.protocol}://${req.headers.host}${req.originalUrl}`, status === 200 ? { done: true } : { error: body.error, values: req.body });
    res.status(status).type('html').send((r as any).body);
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

      const ua = req.headers['user-agent'] || '';
      const ctx = routeCtx(ua, String(req.headers['cf-ipcountry'] || ''), String(req.headers['accept-language'] || ''));
      const destination = withUtm(pickRoute(qrData.content_data?.rules, ctx) || appTarget(qrData.content_data?.app, ua) || qrData.destination_url, qrData.content_data?.utm);
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
  let refHost = '';
  try { refHost = referer ? new URL(referer).hostname.replace(/^www\./, '').slice(0, 100) : ''; } catch { /* not a URL */ }
  const args = {
    p_slug: slug, p_owner: qrOwnerUid || null, p_country: country || 'Unknown',
    p_device: parsed.device, p_browser: parsed.browser, p_os: parsed.os,
    p_referer: referer || '', p_is_unique: isUnique, p_failed: status === 'failed_password',
    // Phase 10 (migration 010): the Worker's event id (links a GPS fix to this scan), city, language, referrer domain.
    p_id: /^[0-9a-f-]{36}$/i.test(payload.event_id || '') ? payload.event_id : null,
    p_city: typeof payload.city === 'string' ? payload.city.slice(0, 80) : '',
    p_lang: String(payload.lang || '').slice(0, 2).toLowerCase().replace(/[^a-z]/g, ''),
    p_ref_host: refHost,
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

