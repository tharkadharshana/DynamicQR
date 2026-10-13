/**
 * DynamicQR — Full API QA Test Suite
 * Run with: npx tsx qa.ts
 *
 * Creates a disposable test user, exercises every endpoint, then deletes the user.
 * The backend must be running on localhost:3000 (npm run dev).
 *
 * Sections:
 *  1.  Auth setup
 *  2.  Health check
 *  3.  User plan / profile creation
 *  4.  Auth guards
 *  5.  Input validation
 *  6.  QR CRUD
 *  7.  Analytics shapes (fresh QR)
 *  8.  Account analytics
 *  9.  Internal scan simulation + stats accuracy
 *  10. Internal slug lookup
 *  11. Profile update
 *  12. Billing
 *  13. Gate config storage (expiry, scan limit, password)
 *  14. QR type redirects (vCard, text, WiFi)
 *  15. Analytics detail (mobile UA, iOS UA, referrer, multi-country)
 *  15b. Worker gate engine, run in-process with a fake KV (redirect, cache, 404/503 pages,
 *       expiry, Visitor Guard, scan limit, PIN lockout, monthly quota, legacy rows)
 *  16. Token revocation
 *  17. Plan limit enforcement
 *  18. Deactivate all + data export
 *  19. Redirect engine
 *  20. Security: RLS (anon + signed-in), no password_hash in responses
 *  21. Edit persistence (rate_limit) + /internal/slug policy fields
 *  22. Billing: PayHere order + signed notify (tamper, replay, amount, annual, stop, chargeback)
 *  23. Billing USD: PayHere fallback + Polar signed webhooks (active, replay, canceled, revoked)
 *  24. Plan limits (caps, 365-day history), free dynamic pilot, lapse grace → pause (API + Worker)
 *  25. Guest pages (EN/SI/TA, escaping, unsafe links, branding, lang switch not a scan), dynamic
 *      vCard/Text/Email/Wi-Fi at the edge, content_data edits + size cap, activation events, waLink
 *  26. Retention: atomic record_scan (10 concurrent), real per-day uniques, hours, events.csv,
 *      range clamp, cron auth, digest dry run + opt-out, RPC not callable by anon, list hygiene
 *  27. Team plan: API keys + /api/v1 (scopes, revoke, downgrade), seats with a 2nd real user
 *      (member access, owner-only actions, seat cap, removal), client folders, custom domain
 *      (validation, edge redirect, QR content), white-label branding, CSV parser
 *  28. Plans v2: Business checkout (LKR, annual, USD), Business limits, Free caps on short links
 *      and pages (create and reactivate), links outside the QR cap, Free 90-day history, logo on Free
 *  29. Code types: URL builders, PDF signed upload + redirect + size cap, GS1 (store, 409, 400,
 *      Worker /01/ path), event .ics, app-store routing by device, brand_style
 *  30. Pages builder: block page at the edge (escaping, javascript: dropped), tracked clicks
 *      (302, 404, counted with label and CTR, not a scan), Save as contact, template save
 *  31. Short links: custom back-half (edge, reserved, api prefix, 409, charset), tag/kind/folder
 *      filters, bulk deactivate/folder/tag/delete with a foreign slug, UTM append
 *  32. Forms: Free cap 0, definition check, edge render + honeypot, valid answer, missing field,
 *      honeypot dropped, unknown field stripped, CSV, not a scan, 6th answer 429, export, delete
 *  33. Tracking: city/language/referrer maps (code and account), opt-in GPS interstitial and
 *      rounded fix (no overwrite, secret), smart routing (iOS, country, fallback, invalid, Free gate)
 *  34. Business tier: webhooks (Team 403, https/public, signed qr.created/deleted verified with the shared
 *      verifier, test ping), workspaces (scoping, member held to B, 403s, delete), domains (Team 10 → 11th 403, per-code domain)
 *  35. Cleanup
 */
import 'dotenv/config';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import worker from './worker/worker.js';
import { waLink } from './src/lib/site.ts';
import { getQRContent, setShortDomain, buildDestination, gtinValid } from './src/lib/qrContent.ts';
import { csvToObjects, toCsv } from './src/lib/csv.ts';
import { PAGE_TEMPLATES } from './src/lib/pageTemplates.ts';
import { pickRoute, routeCtx } from './src/lib/routing.ts';
import { verifyStandardWebhook } from './src/lib/webhooks.ts';
import http from 'http';

// ─── config ──────────────────────────────────────────────────────────────────
const API             = process.env.QA_API_URL || 'http://localhost:3000';
const SUPABASE_URL    = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE    = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY        = process.env.VITE_SUPABASE_ANON_KEY!;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const TEST_EMAIL      = `qa-${Date.now()}@test.dynamicqr.local`;
const TEST_PASS       = 'QA_test_pass_1234!';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
const anon  = createClient(SUPABASE_URL, ANON_KEY);

// Every QA user lives under this domain. Deleting the auth user cascades to all of its rows.
const QA_DOMAIN = '@test.dynamicqr.local';
const createdUids: string[] = [];

/** Remove QA users left behind by crashed runs. Only those older than 1 h, so a parallel CI run is safe. */
async function sweepStaleQaUsers(): Promise<number> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 }); // ponytail: first 1000 users only
  const cutoff = Date.now() - 3600_000;
  const stale = (data?.users || []).filter(u => u.email?.endsWith(QA_DOMAIN) && Date.parse(u.created_at) < cutoff);
  for (const u of stale) await admin.auth.admin.deleteUser(u.id);
  return stale.length;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const results: { name: string; ok: boolean; note: string }[] = [];

function check(name: string, ok: boolean, note = '') {
  results.push({ name, ok, note });
  if (ok) { passed++; process.stdout.write(`  ✅ ${name}\n`); }
  else     { failed++; process.stdout.write(`  ❌ ${name}${note ? ' — ' + note : ''}\n`); }
}

function section(title: string) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 55 - title.length))}`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** JSON-aware API helper. */
async function api(
  path: string,
  opts: RequestInit & { token?: string; internal?: boolean } = {}
): Promise<{ status: number; body: any }> {
  const { token, internal, ...rest } = opts;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string>),
  };
  if (token)    headers['Authorization']    = `Bearer ${token}`;
  if (internal) headers['x-internal-secret'] = INTERNAL_SECRET;

  const res = await fetch(`${API}${path}`, { ...rest, headers });
  let body: any;
  const ct = res.headers.get('content-type') || '';
  try { body = ct.includes('json') ? await res.json() : await res.text(); }
  catch { body = null; }
  return { status: res.status, body };
}

/** Raw fetch that returns full text body + headers (for non-JSON endpoints). */
async function rawGet(path: string, opts: RequestInit = {}): Promise<{ status: number; body: string; headers: Headers }> {
  const res = await fetch(`${API}${path}`, opts);
  return { status: res.status, body: await res.text(), headers: res.headers };
}

// ─── main ────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n🔬 DynamicQR API QA Suite');
  console.log(`   Server : ${API}`);
  console.log(`   User   : ${TEST_EMAIL}`);

  let token    = '';
  let uid      = '';
  let testSlug = '';

  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  section('1. Auth — create & sign in test user');

  const swept = await sweepStaleQaUsers();
  check(`Swept stale QA users from crashed runs (${swept})`, true);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: TEST_EMAIL, password: TEST_PASS, email_confirm: true,
  });
  if (createErr || !created?.user) {
    console.error(`\nFATAL: Could not create test user — ${createErr?.message}`);
    console.error('Ensure email/password auth is enabled in Supabase: Auth → Providers → Email');
    process.exit(1);
  }
  uid = created.user.id;
  createdUids.push(uid);
  check('Admin createUser', true);

  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email: TEST_EMAIL, password: TEST_PASS,
  });
  if (signInErr || !signIn?.session) {
    console.error(`\nFATAL: Sign-in failed — ${signInErr?.message}`);
    await admin.auth.admin.deleteUser(uid);
    process.exit(1);
  }
  token = signIn.session.access_token;
  check('signInWithPassword → access_token', !!token);

  // ── 2. Health ────────────────────────────────────────────────────────────────
  section('2. Health check');
  {
    const r = await api('/api/health');
    check('GET /api/health → 200',         r.status === 200,                         `status=${r.status}`);
    check('Health: status=ok',             r.body?.status === 'ok',                  `got: ${r.body?.status}`);
    check('Health: no critical_missing',   r.body?.critical_missing?.length === 0,   JSON.stringify(r.body?.critical_missing));
  }

  // ── 3. User plan ─────────────────────────────────────────────────────────────
  section('3. User plan (creates profile on first call)');
  {
    const r = await api('/api/user/plan', { token });
    check('GET /api/user/plan → 200',      r.status === 200,           `status=${r.status}`);
    check('Plan: has plan field',          typeof r.body?.plan === 'string');
    check('Plan: trial active (new user)', r.body?.is_trial === true,  `is_trial=${r.body?.is_trial}`);
    check('Plan: has limits',              !!r.body?.limits);
    check('Plan: has remaining_qr',        r.body?.remaining_qr !== undefined);
  }

  // ── 4. Auth guards ───────────────────────────────────────────────────────────
  section('4. Auth guards (no token → 401)');
  for (const ep of ['/api/user/plan', '/api/user/export', '/api/qr']) {
    const r = await api(ep);
    check(`No-token ${ep} → 401`, r.status === 401, `got ${r.status}`);
  }

  // ── 5. Input validation ──────────────────────────────────────────────────────
  section('5. Input validation (bad inputs → 400)');
  {
    const badUrl = await api('/api/qr', {
      method: 'POST', token,
      body: JSON.stringify({ destination_url: 'not-a-url', title: 'Bad URL', qr_type: 'url', is_dynamic: true }),
    });
    check('POST /api/qr bad URL → 400',   badUrl.status === 400, `got ${badUrl.status}`);

    const badTitle = await api('/api/qr', {
      method: 'POST', token,
      body: JSON.stringify({ destination_url: 'https://example.com', title: 'x'.repeat(200), qr_type: 'url', is_dynamic: true }),
    });
    check('POST /api/qr title>120 → 400', badTitle.status === 400, `got ${badTitle.status}`);

    const badPlan = await api('/api/billing/checkout', {
      method: 'POST', token,
      body: JSON.stringify({ plan: 'hacker', interval: 'monthly' }),
    });
    check('POST /api/billing/checkout bad plan → 400',     badPlan.status === 400, `got ${badPlan.status}`);

    const badInterval = await api('/api/billing/checkout', {
      method: 'POST', token,
      body: JSON.stringify({ plan: 'pro', interval: 'weekly' }),
    });
    check('POST /api/billing/checkout bad interval → 400', badInterval.status === 400, `got ${badInterval.status}`);
  }

  // ── 6. QR CRUD ───────────────────────────────────────────────────────────────
  section('6. QR create / list / get / update');
  {
    const create = await api('/api/qr', {
      method: 'POST', token,
      body: JSON.stringify({
        destination_url: 'https://example.com',
        title: 'QA Test QR',
        qr_type: 'url',
        is_dynamic: true,
        style: { dot_color: '#000000', bg_color: '#ffffff' },
      }),
    });
    check('POST /api/qr → 201',               create.status === 201, `status=${create.status} ${JSON.stringify(create.body)}`);
    check('POST /api/qr: has slug',            !!create.body?.slug);
    check('POST /api/qr: destination correct', create.body?.destination_url === 'https://example.com');
    check('POST /api/qr: is_active=true',      create.body?.is_active === true);
    testSlug = create.body?.slug || '';

    const list = await api('/api/qr', { token });
    check('GET /api/qr → 200',          list.status === 200,  `status=${list.status}`);
    check('GET /api/qr: returns array', Array.isArray(list.body));
    check('GET /api/qr: contains new QR',
      Array.isArray(list.body) && list.body.some((q: any) => q.slug === testSlug),
      `slug=${testSlug} not in ${list.body?.length} items`);

    if (testSlug) {
      const get = await api(`/api/qr/${testSlug}`, { token });
      check('GET /api/qr/:slug → 200',     get.status === 200,                `status=${get.status}`);
      check('GET /api/qr/:slug: title ok', get.body?.title === 'QA Test QR');

      const upd = await api(`/api/qr/${testSlug}`, {
        method: 'PUT', token,
        body: JSON.stringify({ destination_url: 'https://updated.example.com', title: 'Updated QA' }),
      });
      check('PUT /api/qr/:slug → 200',              upd.status === 200, `status=${upd.status}`);

      const verify = await api(`/api/qr/${testSlug}`, { token });
      check('PUT /api/qr/:slug: destination updated', verify.body?.destination_url === 'https://updated.example.com', verify.body?.destination_url);
      check('PUT /api/qr/:slug: title updated',       verify.body?.title === 'Updated QA',                           verify.body?.title);

      const noAccess = await api(`/api/qr/${testSlug}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJub2JvZHkifQ.fake' },
      });
      check('DELETE /api/qr/:slug bad token → 401', noAccess.status === 401, `got ${noAccess.status}`);
    }
  }

  // ── 7. Analytics shapes (fresh QR) ───────────────────────────────────────────
  section('7. Analytics — fresh QR returns correct empty shapes');
  if (testSlug) {
    const analyticsRoutes: [string, (b: any) => boolean, string][] = [
      [`/api/analytics/${testSlug}/summary`,    b => b.total_scans === 0 && 'unique_visitors' in b,  'summary shape'],
      [`/api/analytics/${testSlug}/timeseries`, b => Array.isArray(b) && b.length > 0,               'timeseries array'],
      [`/api/analytics/${testSlug}/devices`,    b => Array.isArray(b),                               'devices array'],
      [`/api/analytics/${testSlug}/countries`,  b => Array.isArray(b),                               'countries array'],
      [`/api/analytics/${testSlug}/os`,         b => Array.isArray(b),                               'os array'],
      [`/api/analytics/${testSlug}/browsers`,   b => Array.isArray(b),                               'browsers array'],
      [`/api/analytics/${testSlug}/recent`,     b => Array.isArray(b),                               'recent array'],
      [`/api/analytics/${testSlug}/hours`,      b => Array.isArray(b) && b.length === 24,            'hours: 24 buckets'],
    ];
    for (const [route, validate, label] of analyticsRoutes) {
      const r = await api(route, { token });
      check(`GET ${route.replace(`/${testSlug}`, '/:slug')} → 200`, r.status === 200, `status=${r.status}`);
      check(`  shape: ${label}`, validate(r.body), JSON.stringify(r.body)?.slice(0, 80));
    }
  }

  // ── 8. Account analytics ─────────────────────────────────────────────────────
  section('8. Account analytics');
  if (uid) {
    const routes = [
      `/api/analytics/account/${uid}`,
      `/api/analytics/account/${uid}/timeseries`,
      `/api/analytics/account/${uid}/devices`,
      `/api/analytics/account/${uid}/countries`,
      `/api/analytics/account/${uid}/browsers`,
      `/api/analytics/account/${uid}/os`,
      `/api/analytics/account/${uid}/summary`,
      `/api/analytics/account/${uid}/recent`,
      `/api/analytics/account/${uid}/performance`,
      `/api/analytics/account/${uid}/hours`,
    ];
    for (const route of routes) {
      const r = await api(route, { token });
      check(`GET ${route.replace(uid, ':uid')} → 200`, r.status === 200, `status=${r.status}`);
    }
    const fake = await api(`/api/analytics/account/00000000-0000-0000-0000-000000000000`, { token });
    check('Account analytics: cross-user → 403', fake.status === 403, `got ${fake.status}`);
  }

  // ── 9. Internal scan simulation + stats accuracy ──────────────────────────────
  section('9. Internal scan — simulate Worker POST and verify stats increment');
  if (testSlug) {
    const basePayload = {
      slug: testSlug,
      ip: '1.2.3.4',
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
      country: 'LK',
      referer: 'https://google.com',
      is_unique: true,
      status: 'success',
    };

    const scan1 = await api('/internal/scan', { method: 'POST', internal: true, body: JSON.stringify(basePayload) });
    check('POST /internal/scan → 200', scan1.status === 200, `status=${scan1.status} ${scan1.body}`);

    await sleep(600);
    const s1 = await api(`/api/analytics/${testSlug}/summary`, { token });
    check('Stats: total_scans=1',       s1.body?.total_scans === 1,  `got ${s1.body?.total_scans}`);
    check('Stats: unique_visitors=1',   s1.body?.unique_visitors >= 1);

    const scan2 = await api('/internal/scan', {
      method: 'POST', internal: true,
      body: JSON.stringify({ ...basePayload, is_unique: false }),
    });
    check('POST /internal/scan (2nd, non-unique) → 200', scan2.status === 200);

    await sleep(600);
    const s2 = await api(`/api/analytics/${testSlug}/summary`, { token });
    check('Stats: total_scans=2 after 2 scans',          s2.body?.total_scans === 2,  `got ${s2.body?.total_scans}`);
    check('Stats: unique still 1 after non-unique scan', s2.body?.unique_visitors === 1, `got ${s2.body?.unique_visitors}`);

    const ts = await api(`/api/analytics/${testSlug}/timeseries`, { token });
    const today = new Date().toISOString().split('T')[0];
    const todayEntry = Array.isArray(ts.body) ? ts.body.find((d: any) => d.date === today) : null;
    check('Timeseries: today entry has ≥2 scans', (todayEntry?.total_scans ?? 0) >= 2, `today=${JSON.stringify(todayEntry)}`);

    const countries = await api(`/api/analytics/${testSlug}/countries`, { token });
    check('Countries: LK recorded', Array.isArray(countries.body) && countries.body.some((c: any) => c.country === 'LK'),
      JSON.stringify(countries.body));

    const devices = await api(`/api/analytics/${testSlug}/devices`, { token });
    check('Devices: desktop recorded', Array.isArray(devices.body) && devices.body.some((d: any) => d.device_type === 'desktop'),
      JSON.stringify(devices.body));

    const browsers = await api(`/api/analytics/${testSlug}/browsers`, { token });
    check('Browsers: Chrome recorded', Array.isArray(browsers.body) && browsers.body.some((b: any) => b.browser === 'Chrome'),
      JSON.stringify(browsers.body));

    // No secret → 401
    const unauth = await api('/internal/scan', { method: 'POST', body: JSON.stringify(basePayload) });
    check('POST /internal/scan no secret → 401', unauth.status === 401, `got ${unauth.status}`);
  }

  // ── 10. Internal slug lookup ──────────────────────────────────────────────────
  section('10. Internal slug lookup (Worker KV-miss fallback)');
  if (testSlug) {
    const r = await api(`/internal/slug/${testSlug}`, { internal: true });
    check('GET /internal/slug/:slug → 200',       r.status === 200, `status=${r.status}`);
    check('Slug lookup: destination_url correct', r.body?.destination_url === 'https://updated.example.com', r.body?.destination_url);
    check('Slug lookup: is_active=true',          r.body?.is_active === true);
    check('Slug lookup: has owner_plan',          !!r.body?.owner_plan);

    const unauth = await api(`/internal/slug/${testSlug}`);
    check('GET /internal/slug/:slug no secret → 401', unauth.status === 401);
  }

  // ── 11. Profile update ───────────────────────────────────────────────────────
  section('11. Profile update');
  {
    const r = await api('/api/user/profile', {
      method: 'PUT', token,
      body: JSON.stringify({ company: 'QA Corp', jobTitle: 'Tester', country: 'LK', timezone: 'Asia/Colombo' }),
    });
    check('PUT /api/user/profile → 200', r.status === 200, `status=${r.status}`);

    const plan = await api('/api/user/plan', { token });
    check('Profile: company persisted', plan.body?.profile?.company === 'QA Corp', plan.body?.profile?.company);
  }

  // ── 12. Billing ──────────────────────────────────────────────────────────────
  section('12. Billing');
  {
    const inv = await api('/api/billing/invoices', { token });
    check('GET /api/billing/invoices → 200', inv.status === 200, `status=${inv.status}`);
    check('Invoices: returns array',         Array.isArray(inv.body));

    // PayHere not configured in CI — expect 500, but NOT 401 or 403
    const co = await api('/api/billing/checkout', {
      method: 'POST', token,
      body: JSON.stringify({ plan: 'pro', interval: 'monthly' }),
    });
    check('POST /api/billing/checkout: not 401', co.status !== 401, `got ${co.status}`);
    check('POST /api/billing/checkout: not 403', co.status !== 403, `got ${co.status}`);

    // Webhook bad signature → 401
    const wh = await api('/api/billing/notify', {
      method: 'POST',
      body: JSON.stringify({
        merchant_id: 'x', order_id: 'y', payhere_amount: '7.00',
        payhere_currency: 'USD', status_code: '2', md5sig: 'badsig',
        custom_1: uid, custom_2: 'pro',
      }),
    });
    check('POST /api/billing/notify bad sig → 401', wh.status === 401, `got ${wh.status}`);
  }

  // ── 13. Gate config storage ──────────────────────────────────────────────────
  section('13. Gate config — expiry date, scan limit, password hash');
  // Each gate QR is created, verified via /internal/slug, then deleted.
  // Count stays at 1 (testSlug) throughout this section.
  {
    // ─ Expiry date ─────────────────────────────────────────────────────────────
    const expiryQR = await api('/api/qr', {
      method: 'POST', token,
      body: JSON.stringify({
        destination_url: 'https://example.com/expiry',
        title: 'QA Expiry Gate',
        qr_type: 'url',
        is_dynamic: true,
        options: { expiry_date_enabled: true, expiry_date: '2020-01-01' },
      }),
    });
    check('Expiry gate QR → 201', expiryQR.status === 201, `status=${expiryQR.status} ${JSON.stringify(expiryQR.body)}`);
    const expirySlug = expiryQR.body?.slug || '';

    if (expirySlug) {
      const cfg = await api(`/internal/slug/${expirySlug}`, { internal: true });
      check('Expiry: /internal/slug returns expiry_date',  !!cfg.body?.expiry_date,                `got: ${cfg.body?.expiry_date}`);
      check('Expiry: expiry_date value stored correctly',  cfg.body?.expiry_date === '2020-01-01', `got: ${cfg.body?.expiry_date}`);
      // Worker would gate: new Date('2020-01-01') < new Date() → 410
      // Express fallback doesn't check expiry (Worker-only gate) — config correctness verified above

      await api(`/api/qr/${expirySlug}`, { method: 'DELETE', token });
      check('Expiry gate QR deleted', true);
    }

    // ─ Scan limit ──────────────────────────────────────────────────────────────
    const limitQR = await api('/api/qr', {
      method: 'POST', token,
      body: JSON.stringify({
        destination_url: 'https://example.com/limit',
        title: 'QA Scan Limit Gate',
        qr_type: 'url',
        is_dynamic: true,
        options: { scan_limit_enabled: true, scan_limit: 2 },
      }),
    });
    check('Scan-limit gate QR → 201', limitQR.status === 201, `status=${limitQR.status}`);
    const limitSlug = limitQR.body?.slug || '';

    if (limitSlug) {
      const cfg = await api(`/internal/slug/${limitSlug}`, { internal: true });
      check('Scan limit: /internal/slug returns scan_limit=2', cfg.body?.scan_limit === 2, `got: ${cfg.body?.scan_limit}`);
      // Worker gates on scan_count > scan_limit → 410 (KV-based, not testable without Worker)

      await api(`/api/qr/${limitSlug}`, { method: 'DELETE', token });
      check('Scan-limit gate QR deleted', true);
    }

    // ─ Password ────────────────────────────────────────────────────────────────
    const PASSWORD   = 'QAPassword1!';
    const pwQR = await api('/api/qr', {
      method: 'POST', token,
      body: JSON.stringify({
        destination_url: 'https://example.com/pw',
        title: 'QA Password Gate',
        qr_type: 'url',
        is_dynamic: true,
        options: { password_protect: true, password: PASSWORD },
      }),
    });
    check('Password gate QR → 201', pwQR.status === 201, `status=${pwQR.status}`);
    const pwSlug = pwQR.body?.slug || '';

    if (pwSlug) {
      const cfg = await api(`/internal/slug/${pwSlug}`, { internal: true });
      check('Password: /internal/slug returns non-null password_hash', !!cfg.body?.password_hash, `got: ${cfg.body?.password_hash}`);

      // Server computes: sha256(password + slug). Verify we get the same hash.
      const expectedHash = crypto.createHash('sha256').update(PASSWORD + pwSlug).digest('hex');
      check('Password: stored hash = sha256(password + slug)',
        cfg.body?.password_hash === expectedHash,
        `expected: ${expectedHash.slice(0, 16)}…  got: ${(cfg.body?.password_hash || '').slice(0, 16)}…`);

      // GET /:slug without password (Worker returns HTML form, Express returns 302 — gate is Worker-only)
      const noPassRedirect = await fetch(`${API}/${pwSlug}`, { redirect: 'manual' });
      check('Password: unauthenticated redirect (Express fallback) → 302', noPassRedirect.status === 302,
        `got ${noPassRedirect.status} (note: Worker would serve password form)`);

      await api(`/api/qr/${pwSlug}`, { method: 'DELETE', token });
      check('Password gate QR deleted', true);
    }
  }

  // ── 14. QR type redirects ────────────────────────────────────────────────────
  section('14. QR type redirects — vCard, text, WiFi');
  // Each type QR is created, redirect tested, then deleted. Count stays at 1.
  {
    // ─ vCard ───────────────────────────────────────────────────────────────────
    const vcardQR = await api('/api/qr', {
      method: 'POST', token,
      body: JSON.stringify({
        qr_type: 'vcard',
        is_dynamic: false,
        title: 'QA vCard',
        content_data: {
          first_name: 'QA', last_name: 'Tester',
          phone: '+94700000000', email: 'qa@example.com',
          company: 'QA Corp', website: 'https://example.com',
        },
      }),
    });
    check('vCard QR → 201', vcardQR.status === 201, `status=${vcardQR.status}`);
    const vcardSlug = vcardQR.body?.slug || '';

    if (vcardSlug) {
      const r = await rawGet(`/${vcardSlug}`);
      check('vCard: GET /:slug → 200',            r.status === 200, `status=${r.status}`);
      check('vCard: Content-Type text/vcard',     (r.headers.get('content-type') || '').includes('vcard'), r.headers.get('content-type') || 'missing');
      check('vCard: body has BEGIN:VCARD',         r.body.includes('BEGIN:VCARD'));
      check('vCard: body has contact name',        r.body.includes('QA') && r.body.includes('Tester'));

      await api(`/api/qr/${vcardSlug}`, { method: 'DELETE', token });
      check('vCard QR deleted', true);
    }

    // ─ Text ────────────────────────────────────────────────────────────────────
    const TEXT_CONTENT = 'Hello QA World — automated test content 12345';
    const textQR = await api('/api/qr', {
      method: 'POST', token,
      body: JSON.stringify({
        qr_type: 'text',
        is_dynamic: false,
        title: 'QA Text',
        content_data: { text: TEXT_CONTENT },
      }),
    });
    check('Text QR → 201', textQR.status === 201, `status=${textQR.status}`);
    const textSlug = textQR.body?.slug || '';

    if (textSlug) {
      const r = await rawGet(`/${textSlug}`);
      check('Text: GET /:slug → 200',          r.status === 200,                   `status=${r.status}`);
      check('Text: body contains text content', r.body.includes('Hello QA World'));

      await api(`/api/qr/${textSlug}`, { method: 'DELETE', token });
      check('Text QR deleted', true);
    }

    // ─ WiFi ────────────────────────────────────────────────────────────────────
    const SSID = 'QA-Test-Network';
    const wifiQR = await api('/api/qr', {
      method: 'POST', token,
      body: JSON.stringify({
        qr_type: 'wifi',
        is_dynamic: false,
        title: 'QA WiFi',
        content_data: { ssid: SSID, password: 'wifipass123', encryption: 'WPA' },
      }),
    });
    check('WiFi QR → 201', wifiQR.status === 201, `status=${wifiQR.status}`);
    const wifiSlug = wifiQR.body?.slug || '';

    if (wifiSlug) {
      const r = await rawGet(`/${wifiSlug}`);
      check('WiFi: GET /:slug → 200',       r.status === 200,       `status=${r.status}`);
      check('WiFi: body contains SSID',     r.body.includes(SSID));
      check('WiFi: body has WiFi details',  r.body.toLowerCase().includes('wifi') || r.body.includes('SSID') || r.body.includes('Network'));

      await api(`/api/qr/${wifiSlug}`, { method: 'DELETE', token });
      check('WiFi QR deleted', true);
    }
  }

  // ── 15. Analytics detail ─────────────────────────────────────────────────────
  section('15. Analytics detail — mobile UA, iOS, referrer, multi-country');
  if (testSlug) {
    // UA strings chosen so parseUA() returns deterministic device/os values:
    //   Android Chrome mobile → device=mobile, os=Android, browser=Chrome
    //   iPhone Safari         → device=mobile, os=iOS,     browser=Safari
    //   Windows Chrome desktop (with twitter referer) → device=desktop, os=Windows
    const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';
    const IOS_UA     = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1';
    const WIN_UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120';

    // Scan 3: Android mobile, country=US
    const s3 = await api('/internal/scan', {
      method: 'POST', internal: true,
      body: JSON.stringify({ slug: testSlug, ip: '10.1.0.1', ua: ANDROID_UA, country: 'US', is_unique: true, status: 'success' }),
    });
    check('Scan 3 (Android/US) → 200', s3.status === 200, `status=${s3.status}`);

    // Scan 4: iOS, country=DE
    const s4 = await api('/internal/scan', {
      method: 'POST', internal: true,
      body: JSON.stringify({ slug: testSlug, ip: '10.1.0.2', ua: IOS_UA, country: 'DE', is_unique: true, status: 'success' }),
    });
    check('Scan 4 (iOS/DE) → 200', s4.status === 200, `status=${s4.status}`);

    // Scan 5: Windows desktop with twitter referer, country=GB
    const s5 = await api('/internal/scan', {
      method: 'POST', internal: true,
      body: JSON.stringify({ slug: testSlug, ip: '10.1.0.3', ua: WIN_UA, country: 'GB', referer: 'https://twitter.com/scnrapp', is_unique: true, status: 'success' }),
    });
    check('Scan 5 (Windows/GB/twitter) → 200', s5.status === 200, `status=${s5.status}`);

    await sleep(800);

    // Device accuracy
    const devs = await api(`/api/analytics/${testSlug}/devices`, { token });
    check('Devices: mobile recorded (Android + iOS scans)',
      Array.isArray(devs.body) && devs.body.some((d: any) => d.device_type === 'mobile'),
      JSON.stringify(devs.body));

    // OS accuracy
    const osData = await api(`/api/analytics/${testSlug}/os`, { token });
    check('OS: Android recorded',
      Array.isArray(osData.body) && osData.body.some((o: any) => o.os === 'Android'),
      JSON.stringify(osData.body));
    check('OS: iOS recorded',
      Array.isArray(osData.body) && osData.body.some((o: any) => o.os === 'iOS'),
      JSON.stringify(osData.body));

    // Referrer appears in recent scans (scan_events table — not qr_stats.referrers)
    const recent = await api(`/api/analytics/${testSlug}/recent`, { token });
    check('Recent scans: twitter referer recorded',
      Array.isArray(recent.body) && recent.body.some((r: any) =>
        (r.referrer || r.referer || '').includes('twitter')
      ), JSON.stringify(recent.body?.map((r: any) => r.referrer || r.referer)));

    // Country accuracy
    const ctrs = await api(`/api/analytics/${testSlug}/countries`, { token });
    check('Countries: US recorded',
      Array.isArray(ctrs.body) && ctrs.body.some((c: any) => c.country === 'US'), JSON.stringify(ctrs.body));
    check('Countries: DE recorded',
      Array.isArray(ctrs.body) && ctrs.body.some((c: any) => c.country === 'DE'), JSON.stringify(ctrs.body));
    check('Countries: GB recorded',
      Array.isArray(ctrs.body) && ctrs.body.some((c: any) => c.country === 'GB'), JSON.stringify(ctrs.body));

    // Total accuracy: 2 (section 9) + 3 (this section) = 5 total, 4 unique (1 non-unique in section 9)
    const sum = await api(`/api/analytics/${testSlug}/summary`, { token });
    check('Total scans = 5 (2 from §9 + 3 from §15)', sum.body?.total_scans === 5, `got ${sum.body?.total_scans}`);
    check('Unique visitors = 4',                       sum.body?.unique_visitors === 4, `got ${sum.body?.unique_visitors}`);
  }

  // ── 15b. Worker gate engine (in-process) ─────────────────────────────────────
  // Runs worker/worker.js directly in Node against this API, with an in-memory KV.
  // Worker test helpers (also used by section 24): run worker.js in-process against this API with a fake KV.
    const runWorker = async (path: string, opts: { kv?: Map<string, string>; ua?: string; method?: string; form?: Record<string, string>; apiUrl?: string; mainHost?: string; cf?: Record<string, string>; lang?: string } = {}) => {
      const kv = opts.kv || new Map<string, string>();
      if (/\/(undefined)?$/.test(path)) return { status: 0, location: null, body: 'no slug (QR create failed)', kv };
      const env = {
        API_URL: opts.apiUrl || API,
        INTERNAL_SECRET,
        HASH_SALT: process.env.HASH_SALT || 'qa-salt',
        MAIN_HOST: opts.mainHost,
        QR_CACHE: {
          get: async (k: string, o?: { type?: string }) => {
            const v = kv.get(k);
            return v == null ? null : o?.type === 'json' ? JSON.parse(v) : v;
          },
          put: async (k: string, v: string) => { kv.set(k, v); },
          delete: async (k: string) => { kv.delete(k); },
        },
      };
      const pending: Promise<any>[] = [];
      const ctx = { waitUntil: (p: Promise<any>) => { pending.push(p); } };
      const req = new Request(`https://qa.scnr.test${path}`, {
        method: opts.method || 'GET',
        headers: { 'User-Agent': opts.ua || 'QA-Worker/1.0', 'CF-Connecting-IP': '198.51.100.7', ...(opts.lang ? { 'Accept-Language': opts.lang } : {}) },
        body: opts.form ? new URLSearchParams(opts.form) : undefined,
        redirect: 'manual',
      });
      if (opts.cf) Object.defineProperty(req, 'cf', { value: opts.cf }); // what Cloudflare adds in production
      const res: Response = await (worker as any).fetch(req, env, ctx);
      await Promise.allSettled(pending);
      return { status: res.status, location: res.headers.get('location'), type: res.headers.get('content-type'), body: await res.text(), kv };
    };
    const mkQR = async (body: any) => {
      const r = await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'url', is_dynamic: true, ...body }) });
      if (!r.body?.slug) check(`create "${body.title}" for worker test`, false, `status=${r.status} ${JSON.stringify(r.body)}`);
      return r.body?.slug as string | undefined;
    };
    const del = (slug?: string) => slug && api(`/api/qr/${slug}`, { method: 'DELETE', token });

  section('15b. Worker gate engine (in-process, fake KV)');
  {
    // Active URL code: origin lookup → 302, config cached, analytics recorded
    if (testSlug) {
      const before = (await api(`/api/analytics/${testSlug}/summary`, { token })).body?.total_scans ?? 0;
      const kv = new Map<string, string>();
      const r1 = await runWorker(`/${testSlug}`, { kv, ua: 'QA-active-1' });
      check('Worker: active code → 302', r1.status === 302, `status=${r1.status} ${r1.body.slice(0, 80)}`);
      check('Worker: Location = destination', r1.location === 'https://updated.example.com/', `got ${r1.location}`);
      check('Worker: config cached in KV', kv.has(testSlug));
      check('Worker: cached config has quota_exceeded=false', JSON.parse(kv.get(testSlug) || '{}').quota_exceeded === false);
      const r2 = await runWorker(`/${testSlug}`, { kv, ua: 'QA-active-2' });
      check('Worker: second scan served from cache → 302', r2.status === 302, `status=${r2.status}`);
      await sleep(600);
      const after = (await api(`/api/analytics/${testSlug}/summary`, { token })).body?.total_scans ?? 0;
      check('Worker: scans recorded via waitUntil (+2)', after === before + 2, `before=${before} after=${after}`);
    }

    // Unknown slug → branded 404; unreachable origin → 503 page, never a crash
    const unknown = await runWorker('/zzzzzzz');
    check('Worker: unknown slug → 404 page', unknown.status === 404 && unknown.body.includes('not found'), `status=${unknown.status}`);
    const down = await runWorker(`/${testSlug || 'zzzzzzz'}`, { apiUrl: 'http://127.0.0.1:9' });
    check('Worker: origin unreachable → 503 page (no throw)', down.status === 503 && down.body.includes('unavailable'), `status=${down.status}`);

    // Expired → 410
    const expired = await mkQR({ destination_url: 'https://example.com/old', title: 'QA W expired', options: { expiry_date_enabled: true, expiry_date: '2020-01-01' } });
    const rExp = await runWorker(`/${expired}`);
    check('Worker: expired code → 410', rExp.status === 410, `status=${rExp.status}`);
    await del(expired);

    // Visitor Guard: limit 2 per visitor → 3rd scan 429
    const guarded = await mkQR({ destination_url: 'https://example.com/g', title: 'QA W guard', options: { visitor_rate_limit: 2, visitor_rate_period: 3600 } });
    {
      const kv = new Map<string, string>();
      const g = [];
      for (let i = 0; i < 3; i++) g.push((await runWorker(`/${guarded}`, { kv, ua: 'QA-same-visitor' })).status);
      check('Worker: Visitor Guard allows 2 then 429', g[0] === 302 && g[1] === 302 && g[2] === 429, `got ${g.join(',')}`);
    }
    await del(guarded);

    // Scan limit 1 → 2nd scan 410 and code deactivated
    const limited = await mkQR({ destination_url: 'https://example.com/l', title: 'QA W limit', options: { scan_limit_enabled: true, scan_limit: 1 } });
    {
      const kv = new Map<string, string>();
      const a = await runWorker(`/${limited}`, { kv, ua: 'QA-limit-1' });
      const b = await runWorker(`/${limited}`, { kv, ua: 'QA-limit-2' });
      check('Worker: scan limit 1 → 302 then 410', a.status === 302 && b.status === 410, `got ${a.status},${b.status}`);
      const after = await api(`/api/qr/${limited}`, { token });
      check('Worker: scan limit deactivates the code', after.body?.is_active === false, `is_active=${after.body?.is_active}`);
    }
    await del(limited);

    // PIN: form → 5 wrong → locked (429); right PIN from another visitor → 302
    const PIN = '4821';
    const pinned = await mkQR({ destination_url: 'https://example.com/pin', title: 'QA W pin', options: { password_protect: true, password: PIN } });
    {
      const kv = new Map<string, string>();
      const form = await runWorker(`/${pinned}`, { kv, ua: 'QA-pin-attacker' });
      check('Worker: PIN code shows form', form.status === 200 && form.body.includes('Enter the PIN'), `status=${form.status}`);
      let lastWrong = 0;
      for (let i = 0; i < 5; i++) lastWrong = (await runWorker(`/${pinned}`, { kv, ua: 'QA-pin-attacker', method: 'POST', form: { password: `000${i}` } })).status;
      const locked = await runWorker(`/${pinned}`, { kv, ua: 'QA-pin-attacker', method: 'POST', form: { password: PIN } });
      check('Worker: 5 wrong PINs then locked → 429', lastWrong === 200 && locked.status === 429, `last wrong=${lastWrong} locked=${locked.status}`);
      const ok = await runWorker(`/${pinned}`, { kv, ua: 'QA-pin-owner', method: 'POST', form: { password: PIN } });
      check('Worker: correct PIN (other visitor) → 302', ok.status === 302, `status=${ok.status}`);
    }
    await del(pinned);

    // Monthly quota exceeded (decided by /internal/slug from the account-wide counter) → 429 page
    if (testSlug) {
      const month = new Date().toISOString().slice(0, 7);
      const { data: prof } = await admin.from('profiles').select('monthly_scans').eq('id', uid).single();
      await admin.from('profiles').update({ monthly_scans: { ...(prof?.monthly_scans || {}), [month]: 10_000_000 } }).eq('id', uid);
      const q = await runWorker(`/${testSlug}`, { ua: 'QA-quota' });
      check('Worker: account over monthly quota → 429 page', q.status === 429 && q.body.includes('Monthly limit'), `status=${q.status}`);
      await admin.from('profiles').update({ monthly_scans: prof?.monthly_scans || {} }).eq('id', uid);
    }

    // Legacy dynamic row with no destination (old vCard/Text/Email) → 404 page, not a crash
    const legacy = await mkQR({ destination_url: 'https://example.com/legacy', title: 'QA W legacy' });
    if (legacy) {
      await admin.from('qr_codes').update({ destination_url: '' }).eq('slug', legacy);
      const r = await runWorker(`/${legacy}`);
      check('Worker: URL code without destination → 404 page', r.status === 404 && r.body.includes('no destination'), `status=${r.status}`);
    }
    await del(legacy);

  }

  // ── 16. Token revocation ─────────────────────────────────────────────────────
  section('16. Token revocation');
  {
    const r = await api('/api/user/revoke-sessions', { method: 'POST', token });
    check('POST /api/user/revoke-sessions → 200', r.status === 200, `status=${r.status}`);
    check('Revoke: success=true',                 r.body?.success === true, JSON.stringify(r.body));

    // Re-sign-in to get a fresh token so the remaining sections still work
    const { data: refresh, error: refreshErr } = await anon.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASS });
    check('Re-sign-in after revocation → ok', !!refresh?.session?.access_token && !refreshErr, refreshErr?.message);
    if (refresh?.session?.access_token) token = refresh.session.access_token;
  }

  // ── 17. Plan limit enforcement ───────────────────────────────────────────────
  section('17. Plan limit enforcement');
  if (testSlug) {
    // Trial cap = 3. testSlug is 1. Create 2 more to hit the cap.
    const q2 = await api('/api/qr', {
      method: 'POST', token,
      body: JSON.stringify({ destination_url: 'https://example.com', title: 'QA QR 2', qr_type: 'url', is_dynamic: true }),
    });
    check('Create 2nd QR → 201', q2.status === 201, `status=${q2.status}`);

    const q3 = await api('/api/qr', {
      method: 'POST', token,
      body: JSON.stringify({ destination_url: 'https://example.com', title: 'QA QR 3', qr_type: 'url', is_dynamic: true }),
    });
    check('Create 3rd QR (at trial cap) → 201', q3.status === 201, `status=${q3.status}`);

    const q4 = await api('/api/qr', {
      method: 'POST', token,
      body: JSON.stringify({ destination_url: 'https://example.com', title: 'QA QR 4 (over limit)', qr_type: 'url', is_dynamic: true }),
    });
    check('Create 4th QR → 403 LIMIT_QR_CODES',
      q4.status === 403 && q4.body?.code === 'LIMIT_QR_CODES',
      `status=${q4.status} code=${q4.body?.code}`);
    check('Plan limit 403: has error message', typeof q4.body?.error === 'string');

    // Remaining QR count should be 0
    const plan = await api('/api/user/plan', { token });
    check('Plan: remaining_qr=0 at cap', plan.body?.remaining_qr === 0, `got ${plan.body?.remaining_qr}`);
  }

  // ── 18. Deactivate all + data export ─────────────────────────────────────────
  section('18. Deactivate all + data export');
  {
    const deact = await api('/api/user/deactivate-all', { method: 'PUT', token });
    check('PUT /api/user/deactivate-all → 200', deact.status === 200, `status=${deact.status}`);
    check('Deactivate all: count=3',            deact.body?.count === 3, `count=${deact.body?.count}`);

    const exp = await api('/api/user/export', { token });
    check('GET /api/user/export → 200',     exp.status === 200, `status=${exp.status}`);
    check('Export: has profile',            !!exp.body?.profile);
    check('Export: has qr_codes array',     Array.isArray(exp.body?.qr_codes));
    check('Export: 3 QR codes in export',   exp.body?.qr_codes?.length === 3, `got ${exp.body?.qr_codes?.length}`);
    check('Export: exported_at present',    !!exp.body?.exported_at);
  }

  // ── 19. Redirect engine ──────────────────────────────────────────────────────
  section('19. Redirect engine (local Express fallback)');
  if (testSlug) {
    // Re-activate so redirect works
    await api(`/api/qr/${testSlug}`, { method: 'PUT', token, body: JSON.stringify({ is_active: true }) });

    const active = await fetch(`${API}/${testSlug}`, { redirect: 'manual' });
    check('GET /:slug (active) → 302',   active.status === 302, `status=${active.status}`);
    check('GET /:slug: Location set',    !!active.headers.get('location'), active.headers.get('location') || 'missing');

    // Deactivate → 410
    await api(`/api/qr/${testSlug}`, { method: 'PUT', token, body: JSON.stringify({ is_active: false }) });
    const inactive = await fetch(`${API}/${testSlug}`, { redirect: 'manual' });
    check('GET /:slug (inactive) → 410', inactive.status === 410, `got ${inactive.status}`);

    // Unknown slug → 404 or pass-through (not 500)
    const unknown = await fetch(`${API}/zzzzzzz`, { redirect: 'manual' });
    check('GET /:unknown-slug → not 500', unknown.status !== 500, `got ${unknown.status}`);
  }

  // ── 20. Security — RLS + response hygiene ────────────────────────────────────
  section('20. Security — RLS and response hygiene');
  if (testSlug) {
    const pub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: anonRows, error: anonErr } = await pub.from('qr_codes').select('slug, password_hash').limit(5);
    check('RLS: public anon key reads 0 qr_codes rows', !anonErr && (anonRows || []).length === 0,
      anonErr ? anonErr.message : `read ${(anonRows || []).length} rows`);

    const { data: before } = await admin.from('qr_codes').select('title').eq('slug', testSlug).single();
    await pub.from('qr_codes').update({ title: 'pwned' }).eq('slug', testSlug);
    const { data: afterWrite } = await admin.from('qr_codes').select('title').eq('slug', testSlug).single();
    check('RLS: public anon key cannot update qr_codes', afterWrite?.title === before?.title, `title=${afterWrite?.title}`);

    // `anon` holds the signed-in test user's session (section 16 re-sign-in).
    const { data: ownRows } = await anon.from('qr_codes').select('slug').limit(5);
    check('RLS: signed-in user reads 0 qr_codes rows directly (API only)', (ownRows || []).length === 0, `read ${(ownRows || []).length}`);
    await anon.from('profiles').update({ plan: 'team', plan_expires_at: '2099-01-01T00:00:00Z' }).eq('id', uid);
    const { data: prof } = await admin.from('profiles').select('plan').eq('id', uid).single();
    check('RLS: signed-in user cannot set own plan', prof?.plan !== 'team', `plan=${prof?.plan}`);
    // If RLS is open the write above landed: restore so later sections test from a clean state.
    await admin.from('profiles').update({ plan: 'free', plan_expires_at: null }).eq('id', uid);
    await admin.from('qr_codes').update({ title: before?.title }).eq('slug', testSlug);

    const get = await api(`/api/qr/${testSlug}`, { token });
    check('GET /api/qr/:slug: no password_hash in response', get.body && !('password_hash' in get.body), Object.keys(get.body || {}).join(','));
    check('GET /api/qr/:slug: has_password boolean', typeof get.body?.has_password === 'boolean');
    const exp = await api('/api/user/export', { token });
    check('Export: no password_hash in qr_codes', Array.isArray(exp.body?.qr_codes) && exp.body.qr_codes.every((q: any) => !('password_hash' in q)));
  }

  // ── 21. Edit persistence + Worker policy config ──────────────────────────────
  section('21. Edit persistence (rate_limit) + /internal/slug policy fields');
  if (testSlug) {
    const upd = await api(`/api/qr/${testSlug}`, {
      method: 'PUT', token,
      body: JSON.stringify({
        is_active: true,
        options: {
          scan_limit_enabled: true, scan_limit: 7,
          expiry_date_enabled: false, password_protect: false,
          visitor_rate_limit: 3, visitor_rate_period: 60,
        },
      }),
    });
    check('PUT /api/qr/:slug with options → 200', upd.status === 200, `status=${upd.status} ${JSON.stringify(upd.body)}`);
    const got = await api(`/api/qr/${testSlug}`, { token });
    check('PUT persisted rate_limit.enabled=true', got.body?.rate_limit?.enabled === true, JSON.stringify(got.body?.rate_limit));
    check('PUT persisted rate_limit.max_scans=7', got.body?.rate_limit?.max_scans === 7, JSON.stringify(got.body?.rate_limit));
    check('PUT persisted visitor_rate_limit=3', got.body?.visitor_rate_limit === 3, `got ${got.body?.visitor_rate_limit}`);

    const cfg = await api(`/internal/slug/${testSlug}`, { internal: true });
    check('/internal/slug: scan_limit=7', cfg.body?.scan_limit === 7, `got ${cfg.body?.scan_limit}`);
    check('/internal/slug: quota_exceeded=false', cfg.body?.quota_exceeded === false, `got ${cfg.body?.quota_exceeded}`);
    check('/internal/slug: visitor_guard=true (trial)', cfg.body?.visitor_guard === true, `got ${cfg.body?.visitor_guard}`);
    check('/internal/slug: visitor_rate_limit=3 (trial honours setting)', cfg.body?.visitor_rate_limit === 3, `got ${cfg.body?.visitor_rate_limit}`);
  }

  // ── 22. Billing — PayHere notify end to end ──────────────────────────────────
  section('22. Billing — PayHere order + signed notify (idempotent, tamper-proof)');
  {
    const MID = process.env.PAYHERE_MERCHANT_ID || '';
    const SECRET = process.env.PAYHERE_SECRET || '';
    check('PayHere env set for billing QA', !!MID && !!SECRET, 'set PAYHERE_MERCHANT_ID and PAYHERE_SECRET');
    const md5 = (x: string) => crypto.createHash('md5').update(x).digest('hex').toUpperCase();
    // PayHere posts application/x-www-form-urlencoded, so the QA does too.
    const notify = async (f: { order_id: string; amount: string; currency: string; status_code: string; payment_id?: string; message_type?: string; custom_2?: string }) => {
      const md5sig = md5(`${MID}${f.order_id}${f.amount}${f.currency}${f.status_code}${md5(SECRET)}`);
      const body = new URLSearchParams({
        merchant_id: MID, order_id: f.order_id, payhere_amount: f.amount, payhere_currency: f.currency,
        status_code: f.status_code, md5sig, custom_1: uid, custom_2: f.custom_2 || 'pro',
        ...(f.payment_id ? { payment_id: f.payment_id } : {}),
        ...(f.message_type ? { message_type: f.message_type } : {}),
      });
      const res = await fetch(`${API}/api/billing/notify`, { method: 'POST', body });
      return { status: res.status, body: await res.text() };
    };
    const planNow = async () => (await api('/api/user/plan', { token })).body;
    const days = (iso: string) => (new Date(iso).getTime() - Date.now()) / 86400000;

    if (MID && SECRET) {
      const co = await api('/api/billing/checkout', { method: 'POST', token, body: JSON.stringify({ plan: 'pro', interval: 'monthly' }) });
      check('Checkout → 200 with order_id', co.status === 200 && !!co.body?.order_id, `status=${co.status}`);
      check('Checkout: charged in LKR at Pro price', co.body?.currency === 'LKR' && co.body?.amount === '2290.00', `${co.body?.currency} ${co.body?.amount}`);
      const order = co.body?.order_id as string;

      const p1 = await notify({ order_id: order, amount: '2290.00', currency: 'LKR', status_code: '2', payment_id: `QA-P1-${Date.now()}`, custom_2: 'team' });
      check('Notify (custom_2 tampered to team) → 200', p1.status === 200, `status=${p1.status} ${p1.body}`);
      const after1 = await planNow();
      check('Plan from server order, not custom_2 → pro', after1?.plan === 'pro', `plan=${after1?.plan}`);
      check('Payment ends trial', after1?.is_trial === false, `is_trial=${after1?.is_trial}`);
      const d1 = days(after1?.plan_expires_at);
      check('Monthly payment → expiry ≈ +1 month', d1 > 26 && d1 < 33, `days=${d1.toFixed(1)}`);

      // A renewal payment extends once; replaying that same payment_id must not extend again.
      const replayId = `QA-REPLAY-${Date.now()}`;
      await notify({ order_id: order, amount: '2290.00', currency: 'LKR', status_code: '2', payment_id: replayId });
      const afterA = await planNow();
      const rp = await notify({ order_id: order, amount: '2290.00', currency: 'LKR', status_code: '2', payment_id: replayId });
      const afterB = await planNow();
      check('Replayed notify → 200', rp.status === 200, `status=${rp.status}`);
      check('Replayed notify does not extend expiry', afterA?.plan_expires_at === afterB?.plan_expires_at,
        `${afterA?.plan_expires_at} vs ${afterB?.plan_expires_at}`);

      const wrongAmt = await notify({ order_id: order, amount: '1.00', currency: 'LKR', status_code: '2', payment_id: `QA-AMT-${Date.now()}` });
      check('Notify with wrong amount → 400', wrongAmt.status === 400, `status=${wrongAmt.status}`);
      const wrongCur = await notify({ order_id: order, amount: '2290.00', currency: 'USD', status_code: '2', payment_id: `QA-CUR-${Date.now()}` });
      check('Notify with wrong currency → 400', wrongCur.status === 400, `status=${wrongCur.status}`);
      const unknown = await notify({ order_id: 'ORDER_unknown_1', amount: '2290.00', currency: 'LKR', status_code: '2', payment_id: `QA-UNK-${Date.now()}` });
      check('Notify for unknown order → 400', unknown.status === 400, `status=${unknown.status}`);
      const noPid = await notify({ order_id: order, amount: '2290.00', currency: 'LKR', status_code: '2' });
      check('Notify success without payment_id → 400', noPid.status === 400, `status=${noPid.status}`);

      const inv = await api('/api/billing/invoices', { token });
      check('Invoices: paid rows listed in LKR', Array.isArray(inv.body) && inv.body.length >= 1 && inv.body.every((r: any) => r.currency === 'LKR' && r.status === 'active'),
        Array.isArray(inv.body) ? JSON.stringify(inv.body.map((r: any) => `${r.currency}:${r.status}`)) : `status=${inv.status}`);

      // Annual adds 12 months on top of the current expiry.
      const before = (await planNow())?.plan_expires_at;
      const coY = await api('/api/billing/checkout', { method: 'POST', token, body: JSON.stringify({ plan: 'pro', interval: 'annual' }) });
      check('Annual checkout amount = LKR 22,900', coY.body?.amount === '22900.00', `got ${coY.body?.amount}`);
      const pY = await notify({ order_id: coY.body?.order_id, amount: '22900.00', currency: 'LKR', status_code: '2', payment_id: `QA-PY-${Date.now()}` });
      const afterY = await planNow();
      const gain = (new Date(afterY?.plan_expires_at).getTime() - new Date(before).getTime()) / 86400000;
      check('Annual payment → +12 months on top of current expiry', pY.status === 200 && gain > 360 && gain < 370, `status=${pY.status} gain=${gain.toFixed(1)}d`);

      // Recurring stopped: plan kept until expiry.
      const stop = await notify({ order_id: coY.body?.order_id, amount: '22900.00', currency: 'LKR', status_code: '2', payment_id: `QA-STOP-${Date.now()}`, message_type: 'RECURRING_STOPPED' });
      const afterStop = await planNow();
      check('RECURRING_STOPPED → 200, plan kept, expiry unchanged', stop.status === 200 && afterStop?.plan === 'pro' && afterStop?.plan_expires_at === afterY?.plan_expires_at,
        `status=${stop.status} plan=${afterStop?.plan}`);

      // Chargeback removes access now.
      const cb = await notify({ order_id: order, amount: '2290.00', currency: 'LKR', status_code: '-3' });
      const afterCb = await planNow();
      check('Chargeback (-3) → plan free', cb.status === 200 && afterCb?.plan === 'free', `status=${cb.status} plan=${afterCb?.plan}`);
    }
  }

  // ── 23. Billing — USD: PayHere fallback + Polar webhook ──────────────────────
  section('23. Billing — USD via PayHere fallback, Polar signed webhooks');
  {
    const usd = await api('/api/billing/checkout', { method: 'POST', token, body: JSON.stringify({ plan: 'pro', interval: 'monthly', currency: 'USD' }) });
    check('PayHere USD fallback: $7.00 in USD', usd.status === 200 && usd.body?.currency === 'USD' && usd.body?.amount === '7.00', `${usd.status} ${usd.body?.currency} ${usd.body?.amount}`);

    if (!process.env.POLAR_ACCESS_TOKEN) {
      const pc = await api('/api/billing/polar/checkout', { method: 'POST', token, body: JSON.stringify({ plan: 'pro', interval: 'monthly' }) });
      check('Polar checkout without token → 503 (card payments off)', pc.status === 503, `got ${pc.status}`);
    }

    const SECRET = process.env.POLAR_WEBHOOK_SECRET || '';
    const PRODUCT = process.env.POLAR_PRODUCT_PRO_MONTHLY || '';
    check('Polar QA env set (POLAR_WEBHOOK_SECRET, POLAR_PRODUCT_PRO_MONTHLY)', !!SECRET && !!PRODUCT);
    const polar = async (event: any, opts: { badSig?: boolean; id?: string } = {}) => {
      const body = JSON.stringify(event);
      const id = opts.id || `msg_${crypto.randomUUID()}`;
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = crypto.createHmac('sha256', Buffer.from(SECRET, 'utf8')).update(`${id}.${ts}.${body}`).digest('base64');
      const res = await fetch(`${API}/api/billing/polar/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${opts.badSig ? 'AAAA' + sig.slice(4) : sig}` },
        body,
      });
      return { status: res.status, body: await res.text() };
    };
    if (SECRET && PRODUCT) {
      // Start from free, with a pending Polar order (what /polar/checkout would write).
      await admin.from('profiles').update({ plan: 'free', plan_expires_at: null }).eq('id', uid);
      const orderId = `POLAR_${uid}_${Date.now()}`;
      await admin.from('subscriptions').insert({ uid, plan: 'pro', interval: 'monthly', order_id: orderId, amount: '7.00', currency: 'USD', provider: 'polar', status: 'pending' });
      const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
      const sub = { id: `sub_qa_${Date.now()}`, status: 'active', product_id: PRODUCT, current_period_end: periodEnd, metadata: { uid, order_id: orderId } };

      const bad = await polar({ type: 'subscription.active', data: sub }, { badSig: true });
      check('Polar webhook bad signature → 401', bad.status === 401, `got ${bad.status}`);
      const ok = await polar({ type: 'subscription.active', data: sub });
      const p1 = (await api('/api/user/plan', { token })).body;
      check('Polar subscription.active → 200, plan pro', ok.status === 200 && p1?.plan === 'pro', `status=${ok.status} plan=${p1?.plan}`);
      check('Polar: plan_expires_at = current_period_end', p1?.plan_expires_at && new Date(p1.plan_expires_at).getTime() === new Date(periodEnd).getTime(), `${p1?.plan_expires_at} vs ${periodEnd}`);
      const replay = await polar({ type: 'subscription.updated', data: sub });
      const p2 = (await api('/api/user/plan', { token })).body;
      check('Polar same period replay → no change', replay.status === 200 && p2?.plan_expires_at === p1?.plan_expires_at, `${p2?.plan_expires_at}`);
      const { data: rows } = await admin.from('subscriptions').select('status, payment_id').eq('provider', 'polar').eq('order_id', orderId);
      check('Polar: pending order claimed (1 active row)', (rows || []).length === 1 && rows?.[0]?.status === 'active', JSON.stringify(rows));
      const cancel = await polar({ type: 'subscription.canceled', data: { ...sub, status: 'active' } });
      const p3 = (await api('/api/user/plan', { token })).body;
      check('Polar subscription.canceled → plan kept until period end', cancel.status === 200 && p3?.plan === 'pro', `plan=${p3?.plan}`);
      const revoke = await polar({ type: 'subscription.revoked', data: { ...sub, status: 'canceled' } });
      const p4 = (await api('/api/user/plan', { token })).body;
      check('Polar subscription.revoked → plan free', revoke.status === 200 && p4?.plan === 'free', `plan=${p4?.plan}`);
      const unknownProduct = await polar({ type: 'subscription.active', data: { ...sub, id: 'sub_other', product_id: 'prod_unknown' } });
      check('Polar unknown product → 400', unknownProduct.status === 400, `got ${unknownProduct.status}`);
    }
  }

  // ── 24. Plan limits, free dynamic pilot, lapse → pause ───────────────────────
  section('24. Plan limits (caps, history), free dynamic pilot, lapse grace → pause');
  if (testSlug) {
    const month = 30 * 86400000;
    // Pro limits
    await admin.from('profiles').update({ plan: 'pro', plan_expires_at: new Date(Date.now() + month).toISOString(), is_trial: false }).eq('id', uid);
    const pro = (await api('/api/user/plan', { token })).body;
    check('Pro: 100 QR codes (no unlimited)', pro?.limits?.qr_codes === 100, `got ${pro?.limits?.qr_codes}`);
    check('Pro: 365 days of statistics', pro?.limits?.analytics_days === 365, `got ${pro?.limits?.analytics_days}`);
    const ts = await api(`/api/analytics/${testSlug}/timeseries?days=500`, { token });
    check('Pro: timeseries capped at 365 days', Array.isArray(ts.body) && ts.body.length === 365, `got ${ts.body?.length}`);

    // Second dynamic code while on Pro, then the plan lapses past the grace period.
    // Reactivate and clear section 21's scan limit so only the lapse rule decides below.
    await api(`/api/qr/${testSlug}`, { method: 'PUT', token, body: JSON.stringify({ is_active: true, options: { scan_limit_enabled: false } }) });
    const d2 = await mkQR({ destination_url: 'https://example.com/second', title: 'QA second dynamic' });
    check('Pro: 2nd dynamic code → 201', !!d2);
    await admin.from('profiles').update({
      plan: 'free', is_trial: false,
      plan_expires_at: new Date(Date.now() - 40 * 86400000).toISOString(),
      trial_expires_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    }).eq('id', uid);

    const lapsed = (await api('/api/user/plan', { token })).body;
    check('Lapsed: Free limits = 3 codes, 1 dynamic', lapsed?.limits?.qr_codes === 3 && lapsed?.limits?.dynamic_qr_codes === 1, JSON.stringify(lapsed?.limits));
    check('Lapsed: pause_on set, 1 dynamic code over allowance', !!lapsed?.pause_on && lapsed?.dynamic_over_allowance === 1, `pause_on=${lapsed?.pause_on} over=${lapsed?.dynamic_over_allowance}`);

    const older = await api(`/internal/slug/${testSlug}`, { internal: true });
    const newer = await api(`/internal/slug/${d2}`, { internal: true });
    check('Lapse: oldest dynamic code stays live (paused=false)', older.body?.paused === false, `got ${older.body?.paused}`);
    check('Lapse: newer dynamic code paused, title included', newer.body?.paused === true && newer.body?.title === 'QA second dynamic', JSON.stringify({ p: newer.body?.paused, t: newer.body?.title }));
    const wOld = await runWorker(`/${testSlug}`, { ua: 'QA-lapse-1' });
    const wNew = await runWorker(`/${d2}`, { ua: 'QA-lapse-2' });
    check('Worker: live code → 302 after lapse', wOld.status === 302, `got ${wOld.status}`);
    check('Worker: paused code → holding page (not deleted)', wNew.status === 410 && wNew.body.includes('paused by its owner') && wNew.body.includes('QA second dynamic'), `got ${wNew.status}`);
    const still = await api(`/api/qr/${d2}`, { token });
    check('Lapse: paused code still exists in the account', still.status === 200, `got ${still.status}`);

    // Free dynamic pilot: no new dynamic code while 2 are active.
    const blocked = await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ destination_url: 'https://example.com/x', title: 'QA blocked', qr_type: 'url', is_dynamic: true }) });
    check('Free: new dynamic code over allowance → 403 LIMIT_DYNAMIC_QR', blocked.status === 403 && blocked.body?.code === 'LIMIT_DYNAMIC_QR', `status=${blocked.status} code=${blocked.body?.code}`);
    await del(d2);
    // Exactly at the pilot allowance: grace no longer shown.
    const atAllowance = (await api('/api/user/plan', { token })).body;
    check('Free at allowance: no pause warning', atAllowance?.pause_on === null && atAllowance?.dynamic_over_allowance === 0, `pause_on=${atAllowance?.pause_on}`);
  }

  // ── 25. Restaurant Kit: guest pages, non-URL types, events, WhatsApp ─────────
  section('25. Guest pages (EN/SI/TA), dynamic vCard/Text/Email/Wi-Fi, offer edits, events');
  if (testSlug) {
    // Pro owner for room to create codes; free branding checked further down.
    await admin.from('profiles').update({ plan: 'pro', plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), is_trial: false }).eq('id', uid);

    const content = {
      name: 'Café <Lagoon>', subtitle: 'Galle Road', color: '#2B4A3A',
      offer: { text: 'Kottu night 20% off' },
      links: [
        { kind: 'menu', label: 'Menu', url: 'https://example.com/menu.pdf' },
        { kind: 'whatsapp', label: 'WhatsApp us', url: waLink('+94 77 123 4567', 'Hi') },
        { kind: 'evil', label: 'Evil', url: 'javascript:alert(1)' },
      ],
      wifi: { ssid: 'Lagoon-Guest', password: 'kottu2026' },
      i18n: { si: { name: 'කැෆේ ලගූන්', labels: ['මෙනුව', 'WhatsApp කරන්න', 'x'] }, ta: { labels: ['மெனு', 'WhatsApp செய்யுங்கள்', 'x'] } },
    };
    const page = await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ title: 'QA Kit', qr_type: 'page', is_dynamic: false, content_data: content }) });
    check('POST page QR → 201, always dynamic', page.status === 201 && page.body?.is_dynamic === true, `status=${page.status} dyn=${page.body?.is_dynamic}`);
    const pageSlug = page.body?.slug;

    if (pageSlug) {
      const en = await runWorker(`/${pageSlug}`, { ua: 'QA-kit-en' });
      check('Guest page → 200 HTML with name (escaped) and links', en.status === 200 && en.body.includes('Café &lt;Lagoon&gt;') && en.body.includes('https://example.com/menu.pdf'), `status=${en.status}`);
      check('Guest page: WhatsApp link is wa.me with digits', en.body.includes('https://wa.me/94771234567?text=Hi'));
      check('Guest page: javascript: link dropped', !en.body.includes('javascript:'));
      check('Guest page: offer + Wi-Fi shown', en.body.includes('Kottu night 20% off') && en.body.includes('Lagoon-Guest'));
      check('Guest page: Pro owner has no "Made with Scnr"', !en.body.includes('Made with Scnr'));
      const si = await runWorker(`/${pageSlug}?lang=si`, { ua: 'QA-kit-si' });
      check('Guest page ?lang=si → Sinhala name + labels', si.body.includes('කැෆේ ලගූන්') && si.body.includes('මෙනුව'), `status=${si.status}`);
      const before = (await api(`/api/analytics/${pageSlug}/summary`, { token })).body?.total_scans ?? 0;
      await runWorker(`/${pageSlug}?lang=ta`, { ua: 'QA-kit-switch' });
      await sleep(400);
      const after = (await api(`/api/analytics/${pageSlug}/summary`, { token })).body?.total_scans ?? 0;
      check('Language switch is not counted as a new scan', after === before, `before=${before} after=${after}`);

      // Offer edit after printing: PUT content_data → live config, event recorded.
      const upd = await api(`/api/qr/${pageSlug}`, { method: 'PUT', token, body: JSON.stringify({ content_data: { ...content, offer: { text: 'Weekend brunch LKR 2,200' } } }) });
      const cfg = await api(`/internal/slug/${pageSlug}`, { internal: true });
      check('PUT content_data → 200 and live in /internal/slug', upd.status === 200 && cfg.body?.content_data?.offer?.text === 'Weekend brunch LKR 2,200', `status=${upd.status}`);
      const big = await api(`/api/qr/${pageSlug}`, { method: 'PUT', token, body: JSON.stringify({ content_data: { blob: 'x'.repeat(25000) } }) });
      check('content_data over 20 KB → 400', big.status === 400, `got ${big.status}`);
      await sleep(500);
      const { data: evs } = await admin.from('events').select('name').eq('uid', uid);
      const names = new Set((evs || []).map((e: any) => e.name));
      check('Events: qr_created, first_scan, offer_changed recorded', names.has('qr_created') && names.has('first_scan') && names.has('offer_changed'), JSON.stringify([...names]));
      const ev = await api('/api/events', { method: 'POST', token, body: JSON.stringify({ name: 'print_opened', slug: pageSlug }) });
      const evBad = await api('/api/events', { method: 'POST', token, body: JSON.stringify({ name: 'hacked' }) });
      check('POST /api/events print_opened → 200, unknown name → 400', ev.status === 200 && evBad.status === 400, `${ev.status}/${evBad.status}`);

      // Free owner (not lapsed): "Made with Scnr" footer.
      await admin.from('profiles').update({ plan: 'free', plan_expires_at: null, is_trial: false, trial_expires_at: new Date(Date.now() - 86400000).toISOString() }).eq('id', uid);
      const free = await runWorker(`/${pageSlug}`, { ua: 'QA-kit-free' });
      check('Free owner guest page shows "Made with Scnr"', free.status === 200 && free.body.includes('Made with Scnr'), `status=${free.status}`);
      await admin.from('profiles').update({ plan: 'pro', plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString() }).eq('id', uid);
      await del(pageSlug);
    }

    // Other types can now be dynamic and render at the edge.
    const mk = async (body: any) => (await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ is_dynamic: true, ...body }) })).body;
    const vc = await mk({ qr_type: 'vcard', title: 'QA dyn vCard', content_data: { first_name: 'QA', last_name: 'Tester', phone: '+94700000000' } });
    check('Dynamic vCard stored as dynamic', vc?.is_dynamic === true, JSON.stringify(vc?.is_dynamic));
    const rv = await runWorker(`/${vc?.slug}`, { ua: 'QA-vcard' });
    check('Worker: dynamic vCard → .vcf download', rv.status === 200 && rv.body.includes('BEGIN:VCARD') && rv.body.includes('Tester'), `status=${rv.status}`);
    await del(vc?.slug);
    const tx = await mk({ qr_type: 'text', title: 'QA dyn text', content_data: { text: 'Hello <b>QA</b>' } });
    const rt = await runWorker(`/${tx?.slug}`, { ua: 'QA-text' });
    check('Worker: dynamic text → escaped HTML', rt.status === 200 && rt.body.includes('Hello &lt;b&gt;QA&lt;/b&gt;'), `status=${rt.status}`);
    await del(tx?.slug);
    const em = await mk({ qr_type: 'email', title: 'QA dyn email', content_data: { email: 'qa@example.com', subject: 'Hi' } });
    const re = await runWorker(`/${em?.slug}`, { ua: 'QA-email' });
    check('Worker: dynamic email → 302 mailto:', re.status === 302 && (re.location || '').startsWith('mailto:qa@example.com'), `status=${re.status} loc=${re.location}`);
    await del(em?.slug);
    const wf = await mk({ qr_type: 'wifi', title: 'QA dyn wifi', content_data: { ssid: 'QA-Net', password: 'p@ss' } });
    const rw = await runWorker(`/${wf?.slug}`, { ua: 'QA-wifi' });
    check('Worker: dynamic Wi-Fi → page with SSID', rw.status === 200 && rw.body.includes('QA-Net'), `status=${rw.status}`);
    await del(wf?.slug);
    const badType = await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'sms', title: 'QA bad type' }) });
    check('Unknown qr_type → 400', badType.status === 400, `got ${badType.status}`);
    check('waLink builds wa.me/<digits>?text=', waLink('+94 (77) 123-4567', 'Hi there') === 'https://wa.me/94771234567?text=Hi%20there');
  }

  // ── 26. Retention: atomic counters, real uniques, hours, CSV, crons, digest ──
  section('26. Retention — atomic record_scan, per-day uniques, hours, CSV, cron auth, digest');
  if (testSlug) {
    await admin.from('profiles').update({ plan: 'pro', plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), is_trial: false }).eq('id', uid);
    const fresh = await mkQR({ destination_url: 'https://example.com/retention', title: 'QA retention' });
    if (fresh) {
      // 10 concurrent scans must all count (record_scan is one transaction per scan).
      const scan = (i: number) => api('/internal/scan', { method: 'POST', internal: true, body: JSON.stringify({
        slug: fresh, ip: `10.9.0.${i}`, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1', country: 'LK', is_unique: i < 4, status: 'success' }) });
      await Promise.all(Array.from({ length: 10 }, (_, i) => scan(i)));
      await sleep(600);
      const sum = (await api(`/api/analytics/${fresh}/summary`, { token })).body;
      check('10 concurrent scans → total_scans = 10 (atomic)', sum?.total_scans === 10, `got ${sum?.total_scans}`);
      const today = new Date().toISOString().slice(0, 10);
      const ts = (await api(`/api/analytics/${fresh}/timeseries?days=7`, { token })).body;
      const t = Array.isArray(ts) ? ts.find((d: any) => d.date === today) : null;
      check('Per-day uniques are real (4 of 10)', t?.unique_scans === 4, JSON.stringify(t));
      const hrs = (await api(`/api/analytics/${fresh}/hours`, { token })).body;
      const nowHour = new Date().getUTCHours();
      check('Hours: 24 buckets, current UTC hour has the scans', Array.isArray(hrs) && hrs.length === 24 && hrs[nowHour]?.scans >= 10, JSON.stringify(hrs?.[nowHour]));
      const acctHrs = (await api(`/api/analytics/account/${uid}/hours`, { token })).body;
      check('Account hours: 24 buckets', Array.isArray(acctHrs) && acctHrs.length === 24);

      const csv = await rawGet(`/api/analytics/${fresh}/events.csv`, { headers: { Authorization: `Bearer ${token}` } });
      check('events.csv → text/csv with header + rows', csv.status === 200 && (csv.headers.get('content-type') || '').includes('text/csv') && csv.body.startsWith('scanned_at,country') && csv.body.split('\n').length >= 11, `status=${csv.status}`);

      // Custom range is clamped to the plan's history (Pro = 365 days).
      const longRange = (await api(`/api/analytics/${fresh}/timeseries?start=2000-01-01&end=${today}`, { token })).body;
      check('Custom range clamped to plan history (≤ 365 days)', Array.isArray(longRange) && longRange.length === 365, `got ${longRange?.length}`);

      // Digest (dry run builds without sending) and opt-out.
      const CRON = process.env.CRON_SECRET || '';
      check('CRON_SECRET set for QA', !!CRON);
      const noAuth = await api('/api/cron/cleanup');
      check('Cron without secret → 401', noAuth.status === 401, `got ${noAuth.status}`);
      const clean = await api('/api/cron/cleanup', { headers: { Authorization: `Bearer ${CRON}` } });
      check('Cleanup cron with secret → 200 {deleted}', clean.status === 200 && typeof clean.body?.deleted === 'number', `status=${clean.status}`);
      const dg = await api(`/api/cron/digest?dry=1&uid=${uid}`, { headers: { Authorization: `Bearer ${CRON}` } });
      const mine = dg.body?.digests?.[0];
      check('Digest dry run → this week\'s scans and top code', dg.status === 200 && mine?.total >= 10 && typeof mine?.busiestHour === 'number', `status=${dg.status} ${JSON.stringify(mine)}`);
      await api('/api/user/profile', { method: 'PUT', token, body: JSON.stringify({ company: 'QA Corp', digestOptOut: true }) });
      const off = (await api('/api/user/plan', { token })).body;
      const dg2 = await api(`/api/cron/digest?dry=1&uid=${uid}`, { headers: { Authorization: `Bearer ${CRON}` } });
      check('Digest opt-out saved and respected', off?.profile?.digestOptOut === true && (dg2.body?.digests || []).length === 0, `optOut=${off?.profile?.digestOptOut} n=${dg2.body?.digests?.length}`);
      await del(fresh);
    }
    // The scan RPC must not be callable with the public anon key.
    const pub = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { error: rpcErr } = await pub.rpc('record_scan', { p_slug: testSlug, p_owner: null, p_country: 'XX', p_device: 'desktop', p_browser: 'Other', p_os: 'Unknown', p_referer: '', p_is_unique: true, p_failed: false });
    check('record_scan not callable with the anon key', !!rpcErr, 'anon call succeeded');
    const list = await api('/api/qr', { token });
    check('GET /api/qr list: no password_hash on any row', Array.isArray(list.body) && list.body.every((q: any) => !('password_hash' in q)));
  }

  // ── 27. Team plan: API keys, seats, client folders, custom domain, white-label ─
  section('27. Team plan — API keys + /api/v1, team seats, client folders, custom domain, branding');
  if (testSlug) {
    await admin.from('profiles').update({ plan: 'team', plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), is_trial: false }).eq('id', uid);
    const team = (await api('/api/user/plan', { token })).body;
    check('Team limits: 10 seats, bulk, API, 10 custom domains', team?.limits?.seats === 10 && team?.limits?.bulk_create === true && team?.limits?.api_access === true && team?.limits?.custom_domains === 10, JSON.stringify(team?.limits));

    // v1 alias with a session token
    const v1 = await api('/api/v1/qr', { token });
    check('/api/v1/qr with session token → 200', v1.status === 200 && Array.isArray(v1.body), `got ${v1.status}`);

    // API keys
    const k = await api('/api/keys', { method: 'POST', token, body: JSON.stringify({ name: 'QA key' }) });
    const key = k.body?.key as string;
    check('Create API key → 201, sk_live_ shown once', k.status === 201 && /^sk_live_/.test(key || ''), `status=${k.status}`);
    if (key) {
      const list = await api('/api/v1/qr', { token: key });
      check('API key: GET /api/v1/qr → 200 with codes', list.status === 200 && list.body?.some((q: any) => q.slug === testSlug), `got ${list.status}`);
      const sum = await api(`/api/v1/analytics/${testSlug}/summary`, { token: key });
      check('API key: analytics summary → 200', sum.status === 200 && typeof sum.body?.total_scans === 'number', `got ${sum.status}`);
      const created = await api('/api/v1/qr', { method: 'POST', token: key, body: JSON.stringify({ title: 'QA via API', destination_url: 'https://example.com/api', qr_type: 'url', is_dynamic: true, client: 'API Client' }) });
      check('API key: create code with client folder → 201', created.status === 201 && created.body?.client === 'API Client', `status=${created.status} client=${created.body?.client}`);
      const moved = await api(`/api/qr/${created.body?.slug}`, { method: 'PUT', token, body: JSON.stringify({ client: 'Moved Client' }) });
      const after = await api(`/api/qr/${created.body?.slug}`, { token });
      check('PUT client → folder changed', moved.status === 200 && after.body?.client === 'Moved Client', `client=${after.body?.client}`);
      await del(created.body?.slug);
      const bill = await api('/api/billing/checkout', { method: 'POST', token: key, body: JSON.stringify({ plan: 'pro', interval: 'monthly' }) });
      const keys2 = await api('/api/keys', { token: key });
      check('API key cannot reach billing or key management → 403', bill.status === 403 && keys2.status === 403, `${bill.status}/${keys2.status}`);
      const keyList = (await api('/api/keys', { token })).body;
      check('Key list shows prefix, never the key', Array.isArray(keyList) && keyList.length >= 1 && !JSON.stringify(keyList).includes(key), '');
      await api(`/api/keys/${k.body.id}`, { method: 'DELETE', token });
      const revoked = await api('/api/v1/qr', { token: key });
      check('Revoked key → 401', revoked.status === 401, `got ${revoked.status}`);
    }

    // Team seats: invite a second real user, who then sees the owner's workspace.
    const memberEmail = `qa-member-${Date.now()}@test.dynamicqr.local`;
    const { data: mUser } = await admin.auth.admin.createUser({ email: memberEmail, password: TEST_PASS, email_confirm: true });
    if (mUser?.user?.id) createdUids.push(mUser.user.id);
    const inv = await api('/api/team', { method: 'POST', token, body: JSON.stringify({ email: memberEmail }) });
    check('Invite member → 201', inv.status === 201, `got ${inv.status} ${JSON.stringify(inv.body)}`);
    const member = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: ms } = await member.auth.signInWithPassword({ email: memberEmail, password: TEST_PASS });
    const mToken = ms?.session?.access_token || '';
    if (mToken) {
      const mp = (await api('/api/user/plan', { token: mToken })).body;
      check('Member sees the owner\'s Team plan (is_member)', mp?.is_member === true && mp?.plan === 'team', JSON.stringify({ m: mp?.is_member, p: mp?.plan }));
      const mq = (await api('/api/qr', { token: mToken })).body;
      check('Member lists the owner\'s codes', Array.isArray(mq) && mq.some((q: any) => q.slug === testSlug), `n=${mq?.length}`);
      const ma = await api(`/api/analytics/account/${mUser?.user?.id}/summary`, { token: mToken });
      check('Member account analytics (own id in URL) → 200', ma.status === 200, `got ${ma.status}`);
      const mb = await api('/api/billing/checkout', { method: 'POST', token: mToken, body: JSON.stringify({ plan: 'pro', interval: 'monthly' }) });
      const mt = await api('/api/team', { method: 'POST', token: mToken, body: JSON.stringify({ email: 'x@y.lk' }) });
      check('Member cannot pay or invite → 403 OWNER_ONLY', mb.status === 403 && mt.status === 403 && mb.body?.code === 'OWNER_ONLY', `${mb.status}/${mt.status}`);
    } else check('Member sign-in', false, 'no session');
    // Owner + 1 member so far: fill the remaining seats, then one more.
    for (let i = 0; i < (team?.limits?.seats ?? 10) - 2; i++) await api('/api/team', { method: 'POST', token, body: JSON.stringify({ email: `qa-seat-${i}-${Date.now()}@test.dynamicqr.local` }) });
    const over = await api('/api/team', { method: 'POST', token, body: JSON.stringify({ email: `qa-seat-over-${Date.now()}@test.dynamicqr.local` }) });
    check('11th user (owner + 10 invites) → 403 LIMIT_SEATS', over.status === 403 && over.body?.code === 'LIMIT_SEATS', `status=${over.status}`);
    const teamList = (await api('/api/team', { token })).body;
    const members = Array.isArray(teamList) ? teamList : [];
    for (const m of members) await api(`/api/team/${m.id}`, { method: 'DELETE', token });
    if (mToken) {
      const gone = (await api('/api/user/plan', { token: mToken })).body;
      check('Removed member no longer acts on the workspace', gone?.is_member === false, `is_member=${gone?.is_member}`);
    }
    if (mUser?.user?.id) await admin.auth.admin.deleteUser(mUser.user.id);

    // Custom domain: validation, gating, and edge behaviour on a customer hostname.
    const badHost = await api('/api/domains', { method: 'POST', token, body: JSON.stringify({ hostname: 'not a host' }) });
    check('Custom domain: invalid hostname → 400', badHost.status === 400, `got ${badHost.status}`);
    if (!process.env.CF_API_TOKEN) {
      const noCf = await api('/api/domains', { method: 'POST', token, body: JSON.stringify({ hostname: 'qr.example.lk' }) });
      check('Custom domain without Cloudflare env → 503', noCf.status === 503, `got ${noCf.status}`);
    }
    const onCustom = await runWorker('/pricing', { mainHost: 'scnr.tharkak.com' });
    check('Worker: non-code path on a custom host → 302 to main site', onCustom.status === 302 && (onCustom.location || '').startsWith('https://scnr.tharkak.com/pricing'), `${onCustom.status} ${onCustom.location}`);
    const codeOnCustom = await runWorker(`/${testSlug}`, { mainHost: 'scnr.tharkak.com', ua: 'QA-custom-host' });
    check('Worker: code on a custom host still served', codeOnCustom.status === 302 && codeOnCustom.location !== null && !codeOnCustom.location.includes('scnr.tharkak.com'), `${codeOnCustom.status} ${codeOnCustom.location}`);
    setShortDomain('qr.example.lk');
    check('getQRContent uses the verified custom domain', getQRContent({ slug: 'abcdefg' }) === 'https://qr.example.lk/abcdefg');
    setShortDomain(null);

    // White-label report branding + bulk CSV parsing.
    await api('/api/user/profile', { method: 'PUT', token, body: JSON.stringify({ company: 'QA Corp', agencyName: 'Lanka Print Studio' }) });
    const br = (await api('/api/user/plan', { token })).body;
    check('Agency name saved for white-label reports', br?.profile?.agencyName === 'Lanka Print Studio', `got ${br?.profile?.agencyName}`);
    const parsed = csvToObjects('title,destination_url,client\n"Menu, main",https://a.lk,"Café ""L"""');
    check('CSV import parser: quotes, commas, escaped quotes', parsed[0]?.title === 'Menu, main' && parsed[0]?.client === 'Café "L"');

    // Downgrade: keys stop working when the plan loses API access.
    await admin.from('profiles').update({ plan: 'pro' }).eq('id', uid);
    const noApi = await api('/api/keys', { method: 'POST', token, body: JSON.stringify({ name: 'x' }) });
    check('Pro: creating an API key → 403 FEATURE_API', noApi.status === 403 && noApi.body?.code === 'FEATURE_API', `got ${noApi.status}`);
  }

  // ── 28. Plans v2: Business tier and per-object caps ───────────────────────────
  section('28. Plans v2 — Business checkout, short link / page caps, Free history, logo on Free');
  {
    const co = (plan: string, interval: string, currency = 'LKR') =>
      api('/api/billing/checkout', { method: 'POST', token, body: JSON.stringify({ plan, interval, currency }) });
    const bm = await co('business', 'monthly'), by = await co('business', 'annual'), bu = await co('business', 'monthly', 'USD');
    check('Business checkout: LKR 25,990 / month', bm.body?.amount === '25990.00' && bm.body?.currency === 'LKR', JSON.stringify(bm.body?.amount ?? bm.body));
    check('Business checkout: LKR 259,900 / year', by.body?.amount === '259900.00', JSON.stringify(by.body?.amount ?? by.body));
    check('Business checkout: $79.00 USD fallback', bu.body?.amount === '79.00' && bu.body?.currency === 'USD', JSON.stringify(bu.body?.amount ?? bu.body));
    const bad = await co('enterprise', 'monthly');
    check('Unknown plan → 400', bad.status === 400, `got ${bad.status}`);

    await admin.from('profiles').update({ plan: 'business', plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), is_trial: false }).eq('id', uid);
    const biz = (await api('/api/user/plan', { token })).body?.limits;
    check('Business limits: 2,000 codes, 25 seats, 10 workspaces, 50 domains, webhooks', biz?.qr_codes === 2000 && biz?.seats === 25 && biz?.workspaces === 10 && biz?.custom_domains === 50 && biz?.webhooks === true, JSON.stringify(biz));

    // Free (not lapsed, no trial), with every earlier code switched off so only this section's rows count.
    await admin.from('qr_codes').update({ is_active: false }).eq('user_uid', uid);
    await admin.from('profiles').update({ plan: 'free', plan_expires_at: null, is_trial: false, trial_expires_at: new Date(Date.now() - 86400000).toISOString() }).eq('id', uid);
    const mk = (body: any) => api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'url', is_dynamic: true, ...body }) });

    const links: number[] = [];
    for (let i = 0; i < 4; i++) links.push((await mk({ kind: 'link', destination_url: `https://example.com/l${i}`, title: `QA link ${i}` })).status);
    check('Free: 3 short links → 201', links.slice(0, 3).every(s => s === 201), links.join(','));
    const l4 = await mk({ kind: 'link', destination_url: 'https://example.com/l4', title: 'QA link 4' });
    check('Free: 4th short link → 403 LIMIT_SHORT_LINKS', links[3] === 403 && l4.body?.code === 'LIMIT_SHORT_LINKS', `status=${links[3]} code=${l4.body?.code}`);
    const badKind = await mk({ kind: 'link', qr_type: 'vcard', content_data: { first_name: 'x' } });
    check('kind=link on a non-url type → 400', badKind.status === 400, `got ${badKind.status}`);
    const noDest = await mk({ kind: 'link', title: 'QA link without destination' });
    check('kind=link without destination_url → 400', noDest.status === 400, `got ${noDest.status}`);
    // Reactivating must fit the caps too: switch one link off, fill its slot, switch it back on.
    const mine = (await api('/api/qr', { token })).body;
    const link1 = Array.isArray(mine) ? mine.find((q: any) => q.title === 'QA link 1') : null;
    await api(`/api/qr/${link1?.slug}`, { method: 'PUT', token, body: JSON.stringify({ is_active: false }) });
    const refill = await mk({ kind: 'link', destination_url: 'https://example.com/refill', title: 'QA link refill' });
    const back = await api(`/api/qr/${link1?.slug}`, { method: 'PUT', token, body: JSON.stringify({ is_active: true }) });
    check('Free: reactivating a 4th short link → 403 LIMIT_SHORT_LINKS', refill.status === 201 && back.status === 403 && back.body?.code === 'LIMIT_SHORT_LINKS', `refill=${refill.status} back=${back.status} ${back.body?.code}`);

    // Links do not use the dynamic pilot: the one dynamic slot is still free for a page.
    const p1 = await mk({ qr_type: 'page', title: 'QA page 1', content_data: { name: 'QA' } });
    check('Free: 1st page → 201 (links outside the QR cap)', p1.status === 201, `status=${p1.status} ${JSON.stringify(p1.body)}`);
    const p2 = await mk({ qr_type: 'page', title: 'QA page 2', content_data: { name: 'QA' } });
    check('Free: 2nd page → 403 LIMIT_PAGES', p2.status === 403 && p2.body?.code === 'LIMIT_PAGES', `status=${p2.status} code=${p2.body?.code}`);

    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    const lq = await mk({ is_dynamic: false, destination_url: 'https://example.com/logo', title: 'QA logo', style: { dot_color: '#000000', bg_color: '#ffffff', logo_url: logo } });
    const lqGet = lq.body?.slug ? (await api(`/api/qr/${lq.body.slug}`, { token })).body : null;
    check('Free: QR with a logo saves', lq.status === 201 && lqGet?.style?.logo_url === logo, `status=${lq.status}`);

    const free = (await api('/api/user/plan', { token })).body;
    check('Free: 90 days of history', free?.limits?.analytics_days === 90, `got ${free?.limits?.analytics_days}`);
    const ts = p1.body?.slug ? await api(`/api/analytics/${p1.body.slug}/timeseries?days=500`, { token }) : { body: null };
    check('Free: timeseries capped at 90 days', Array.isArray(ts.body) && ts.body.length === 90, `got ${ts.body?.length}`);

    const link0 = (await api('/api/qr', { token })).body?.find?.((q: any) => q.title === 'QA link 0');
    const w = link0 ? await runWorker(`/${link0.slug}`, { ua: 'QA-link' }) : { status: 0, location: null };
    check('Short link redirects at the edge', w.status === 302 && w.location === 'https://example.com/l0', `status=${w.status} loc=${w.location}`);
  }

  // ── 29. Code types and design: PDF, GS1, events, app links, brand style ──────
  section('29. Code types — URL builders, PDF upload, GS1, event .ics, app routing, brand style');
  {
    await admin.from('profiles').update({ plan: 'pro', plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), is_trial: false }).eq('id', uid);
    const mk = (body: any) => api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'url', is_dynamic: true, ...body }) });

    check('URL builders: review, social, phone, location', buildDestination('google_review', { place_id: 'abc' }).endsWith('placeid=abc')
      && buildDestination('instagram', { handle: '@x' }) === 'https://www.instagram.com/x' && buildDestination('phone', { phone: '+94 77' }) === 'tel:+9477'
      && buildDestination('location', { address: 'Kandy' }) === 'https://maps.google.com/?q=Kandy');

    // PDF: signed upload straight to Storage, then a URL code that redirects to the public file.
    const big = await api('/api/files', { method: 'POST', token, body: JSON.stringify({ type: 'pdf', size: 21 * 1024 * 1024 }) });
    check('Pro: 21 MB upload → 403 LIMIT_FILE_SIZE', big.status === 403 && big.body?.code === 'LIMIT_FILE_SIZE' && big.body?.limit_mb === 20, `status=${big.status}`);
    const badType = await api('/api/files', { method: 'POST', token, body: JSON.stringify({ type: 'exe', size: 10 }) });
    check('Upload of an unknown type → 400', badType.status === 400, `got ${badType.status}`);
    const pdfBytes = Buffer.from('%PDF-1.4\n%QA\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const up = await api('/api/files', { method: 'POST', token, body: JSON.stringify({ type: 'pdf', size: pdfBytes.length }) });
    check('POST /api/files → 201 with a signed upload token', up.status === 201 && !!up.body?.token && up.body?.path?.startsWith(`${uid}/`), `status=${up.status} ${JSON.stringify(up.body)}`);
    if (up.body?.token) {
      const { error: upErr } = await admin.storage.from('files').uploadToSignedUrl(up.body.path, up.body.token, pdfBytes, { contentType: 'application/pdf' });
      check('Signed upload to Storage succeeds', !upErr, upErr?.message);
      const file = await fetch(up.body.publicUrl);
      check('Public file URL serves the PDF', file.status === 200 && (file.headers.get('content-type') || '').includes('pdf'), `status=${file.status}`);
      const pdfSlug = (await mk({ title: 'QA PDF', destination_url: up.body.publicUrl, content_data: { kind: 'pdf', file_url: up.body.publicUrl } })).body?.slug;
      const w = await runWorker(`/${pdfSlug}`, { ua: 'QA-pdf' });
      check('PDF code redirects to the uploaded file', w.status === 302 && w.location === up.body.publicUrl, `status=${w.status} loc=${w.location}`);
    }

    // GS1 Digital Link: a random valid GTIN-13 so parallel QA runs never collide.
    const base = String(Date.now()).slice(-12).padStart(12, '7');
    const gtin = [...'0123456789'].map(d => base + d).find(g => gtinValid(g))!;
    const g1 = await mk({ title: 'QA GS1', destination_url: 'https://example.com/product', gtin, is_dynamic: false });
    check('GS1 code → 201, stored as GTIN-14, forced dynamic', g1.status === 201 && g1.body?.gtin === gtin.padStart(14, '0') && g1.body?.is_dynamic === true, `status=${g1.status} ${JSON.stringify(g1.body)}`);
    check('GS1 QR content is /01/<GTIN-14>', getQRContent({ ...g1.body, slug: g1.body?.slug }, 'https://s.lk') === `https://s.lk/01/${gtin.padStart(14, '0')}`);
    const dup = await mk({ title: 'QA GS1 dup', destination_url: 'https://example.com/p2', gtin });
    check('Same GTIN twice → 409 GTIN_TAKEN', dup.status === 409 && dup.body?.code === 'GTIN_TAKEN', `status=${dup.status}`);
    // Editing: a static code switched to Event becomes dynamic; taking another code's GTIN → 409.
    const st = await mk({ title: 'QA static to event', destination_url: 'https://example.com/s', is_dynamic: false });
    const toEv = await api(`/api/qr/${st.body?.slug}`, { method: 'PUT', token, body: JSON.stringify({ qr_type: 'event', content_data: { title: 'E', start: '2026-12-02T10:00' } }) });
    const evRow = (await api(`/api/qr/${st.body?.slug}`, { token })).body;
    check('PUT: static URL → event, now dynamic', toEv.status === 200 && evRow?.qr_type === 'event' && evRow?.is_dynamic === true, `status=${toEv.status} ${evRow?.qr_type}/${evRow?.is_dynamic}`);
    const takeG = await api(`/api/qr/${st.body?.slug}`, { method: 'PUT', token, body: JSON.stringify({ gtin }) });
    check('PUT: another code\'s GTIN → 409 GTIN_TAKEN', takeG.status === 409 && takeG.body?.code === 'GTIN_TAKEN', `got ${takeG.status}`);
    const noStart = await mk({ qr_type: 'event', title: 'QA event without start', content_data: { title: 'x' } });
    check('Event without a start time → 400', noStart.status === 400, `got ${noStart.status}`);
    const badG = await mk({ title: 'QA GS1 bad', destination_url: 'https://example.com/p3', gtin: gtin.slice(0, -1) + ((Number(gtin.slice(-1)) + 1) % 10) });
    check('Wrong GTIN check digit → 400 INVALID_GTIN', badG.status === 400 && badG.body?.code === 'INVALID_GTIN', `status=${badG.status}`);
    const wg = await runWorker(`/01/${gtin.padStart(14, '0')}/10/LOT7`, { ua: 'QA-gs1' });
    check('Worker: /01/<gtin>/10/<batch> → 302 to the product', wg.status === 302 && wg.location === 'https://example.com/product', `status=${wg.status} loc=${wg.location}`);
    const wb = await runWorker(`/01/${gtin.slice(0, -1)}${(Number(gtin.slice(-1)) + 1) % 10}`, { ua: 'QA-gs1-bad' });
    check('Worker: bad check digit → 400 page', wb.status === 400, `got ${wb.status}`);
    const gi = await api(`/internal/gs1/${gtin}`);
    check('/internal/gs1 without the secret → 401', gi.status === 401, `got ${gi.status}`);

    // Event: scanning downloads an .ics file.
    const ev = await mk({ qr_type: 'event', title: 'QA event', content_data: { title: 'QA Launch', start: '2026-12-01T18:00', end: '2026-12-01T20:00', location: 'Colombo' } });
    const we = await runWorker(`/${ev.body?.slug}`, { ua: 'QA-event' });
    check('Event code → text/calendar with the VEVENT', we.status === 200 && (we.type || '').startsWith('text/calendar') && we.body.includes('SUMMARY:QA Launch') && we.body.includes('DTSTART:20261201T180000'), `status=${we.status} type=${we.type}`);

    // App store: the device picks the store, everyone else gets the fallback.
    const app = { ios: 'https://apps.apple.com/app/id123', android: 'https://play.google.com/store/apps/details?id=lk.qa' };
    const ap = (await mk({ title: 'QA app', destination_url: 'https://example.com/app', content_data: { kind: 'app', app } })).body?.slug;
    const ios = await runWorker(`/${ap}`, { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
    const droid = await runWorker(`/${ap}`, { ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' });
    const desk = await runWorker(`/${ap}`, { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    check('App code: iPhone → App Store', ios.location === app.ios, `got ${ios.location}`);
    check('App code: Android → Play Store', droid.location === app.android, `got ${droid.location}`);
    check('App code: desktop → fallback URL', desk.location === 'https://example.com/app', `got ${desk.location}`);

    // Saved brand style.
    const brand = { dot_color: '#2B4A3A', bg_color: '#FFF8F2', dot_style: 'extra-rounded', shape: 'circle', frame: { text: 'Menu', color: '#2B4A3A' } };
    const sv = await api('/api/user/profile', { method: 'PUT', token, body: JSON.stringify({ brand_style: brand }) });
    const got = (await api('/api/user/plan', { token })).body?.profile?.brand_style;
    check('brand_style persists', sv.status === 200 && got?.frame?.text === 'Menu' && got?.shape === 'circle', JSON.stringify(got));
  }

  // ── 30. Pages builder: blocks, tracked links, Save as contact ────────────────
  section('30. Pages builder — blocks at the edge, click tracking, Save as contact, templates');
  {
    await admin.from('profiles').update({ plan: 'pro', plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), is_trial: false }).eq('id', uid);
    const blocks = [
      { kind: 'header', name: 'QA <Page>', tagline: 'Tagline' },
      { kind: 'socials', items: [{ network: 'instagram', handle: 'qa.lk' }] },
      { kind: 'button', label: 'Order now', url: 'https://example.com/order' },
      { kind: 'button', label: 'Evil', url: 'javascript:alert(1)' },
      { kind: 'contact', phone: '+94 77 123 4567', email: 'qa@example.com' },
    ];
    const pg = await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'page', title: 'QA blocks page', content_data: { blocks, theme: { accent: '#7C3AED', button: 'pill' } } }) });
    const ps = pg.body?.slug;
    check('Create a block page → 201', pg.status === 201 && !!ps, `status=${pg.status} ${JSON.stringify(pg.body)}`);
    const view = await runWorker(`/${ps}`, { ua: 'QA-page-view' });
    check('Block page renders at the edge, escaped', view.status === 200 && view.body.includes('QA &lt;Page&gt;') && !view.body.includes('<Page>'), `status=${view.status}`);
    check('javascript: link dropped; buttons tracked', !view.body.includes('javascript:') && view.body.includes(`/${ps}/l/2`) && !view.body.includes(`/${ps}/l/3`));
    const c1 = await runWorker(`/${ps}/l/2`, { ua: 'QA-click-1' });
    const c2 = await runWorker(`/${ps}/l/1-0`, { ua: 'QA-click-2' });
    check('Click on /l/2 → 302 to the button URL', c1.status === 302 && c1.location === 'https://example.com/order', `status=${c1.status} loc=${c1.location}`);
    check('Click on a social → 302 to the profile', c2.status === 302 && c2.location === 'https://www.instagram.com/qa.lk', `loc=${c2.location}`);
    const bad = await runWorker(`/${ps}/l/3`, { ua: 'QA-click-bad' });
    check('Click on a dropped link → 404', bad.status === 404, `got ${bad.status}`);
    const clicks = (await api(`/api/analytics/${ps}/clicks`, { token })).body;
    const order = Array.isArray(clicks) ? clicks.find((c: any) => c.key === '2') : null;
    check('Engagements: the click is counted with its label and CTR', order?.clicks === 1 && order?.label === 'Order now' && order?.ctr === 100, JSON.stringify(clicks));
    const sum = (await api(`/api/analytics/${ps}/summary`, { token })).body;
    check('Clicks are not scans (1 scan from the page view)', sum?.total_scans === 1, `got ${sum?.total_scans}`);
    const vcf = await runWorker(`/${ps}?vcf=1`, { ua: 'QA-vcf' });
    check('Save as contact → text/vcard with the contact', vcf.status === 200 && (vcf.type || '').startsWith('text/vcard') && vcf.body.includes('EMAIL:qa@example.com'), `status=${vcf.status} type=${vcf.type}`);
    const ic = await api('/internal/click', { method: 'POST', body: JSON.stringify({ slug: ps, key: '2' }) });
    check('/internal/click without the secret → 401', ic.status === 401, `got ${ic.status}`);
    const tpl = PAGE_TEMPLATES[0];
    const fromTpl = await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'page', title: tpl.name, content_data: tpl.content }) });
    check('A page from a template saves (fits the 20 KB cap)', fromTpl.status === 201, `status=${fromTpl.status}`);
  }

  // ── 31. Short links and organisation: back-halves, tags, bulk, UTM ───────────
  section('31. Short links — custom back-half, reserved words, tags, bulk actions, UTM');
  {
    await admin.from('profiles').update({ plan: 'pro', plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), is_trial: false }).eq('id', uid);
    const mk = (body: any) => api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'url', is_dynamic: true, ...body }) });
    const half = `qa-${Date.now().toString(36)}`;
    const l1 = await mk({ kind: 'link', slug: half, destination_url: 'https://example.com/half', title: 'QA back-half', tags: ['Menu', 'qa'] });
    check('Short link with a custom back-half → 201', l1.status === 201 && l1.body?.slug === half && l1.body?.kind === 'link', `status=${l1.status} ${JSON.stringify(l1.body)}`);
    const w = await runWorker(`/${half}`, { ua: 'QA-half' });
    check('Custom back-half resolves at the edge', w.status === 302 && w.location === 'https://example.com/half', `status=${w.status} loc=${w.location}`);
    const res = await mk({ kind: 'link', slug: 'pricing', destination_url: 'https://example.com/x', title: 'QA reserved' });
    check('Reserved back-half (pricing) → 400 RESERVED_SLUG', res.status === 400 && res.body?.code === 'RESERVED_SLUG', `status=${res.status} code=${res.body?.code}`);
    const apiPrefix = await mk({ kind: 'link', slug: 'apix', destination_url: 'https://example.com/x', title: 'QA api prefix' });
    check('Back-half starting with "api" → 400', apiPrefix.status === 400, `got ${apiPrefix.status}`);
    const dup = await mk({ kind: 'link', slug: half, destination_url: 'https://example.com/y', title: 'QA dup' });
    check('Duplicate back-half → 409 SLUG_TAKEN', dup.status === 409 && dup.body?.code === 'SLUG_TAKEN', `status=${dup.status}`);
    const badHalf = await mk({ kind: 'link', slug: 'a/b', destination_url: 'https://example.com/z', title: 'QA bad' });
    check('Back-half with a slash → 400 INVALID_SLUG', badHalf.status === 400 && badHalf.body?.code === 'INVALID_SLUG', `got ${badHalf.status}`);

    // Tags filter.
    const tagged = (await api('/api/qr?tag=menu', { token })).body;
    const untagged = (await api('/api/qr?tag=nothing-here', { token })).body;
    check('GET /api/qr?tag=menu finds the tagged link (tags lower-cased)', Array.isArray(tagged) && tagged.some((q: any) => q.slug === half) && tagged.every((q: any) => q.tags.includes('menu')), `n=${tagged?.length}`);
    check('An unknown tag lists nothing', Array.isArray(untagged) && untagged.length === 0, `n=${untagged?.length}`);
    const links = (await api('/api/qr?kind=link', { token })).body;
    check('GET /api/qr?kind=link lists only short links', Array.isArray(links) && links.length > 0 && links.every((q: any) => q.kind === 'link'), `n=${links?.length}`);

    // Bulk: 3 codes deactivated, moved to a folder, tagged; a foreign slug is reported, not touched.
    const three = (await Promise.all([1, 2, 3].map(i => mk({ destination_url: `https://example.com/b${i}`, title: `QA bulk ${i}` })))).map(r => r.body?.slug);
    const off = await api('/api/qr/bulk', { method: 'POST', token, body: JSON.stringify({ slugs: [...three, 'notmine1'], action: 'deactivate' }) });
    check('Bulk deactivate → 3 done, foreign slug failed', off.status === 200 && off.body?.done?.length === 3 && off.body?.failed?.[0]?.slug === 'notmine1', JSON.stringify(off.body));
    const rows3 = (await admin.from('qr_codes').select('slug, is_active').in('slug', three)).data || [];
    check('Bulk deactivate: all 3 inactive', rows3.length === 3 && rows3.every(r => r.is_active === false));
    const wOff = await runWorker(`/${three[0]}`, { ua: 'QA-bulk-off' });
    check('Bulk-deactivated code → 410 at the edge', wOff.status === 410, `got ${wOff.status}`);
    await api('/api/qr/bulk', { method: 'POST', token, body: JSON.stringify({ slugs: three, action: 'folder', value: 'QA Campaign' }) });
    await api('/api/qr/bulk', { method: 'POST', token, body: JSON.stringify({ slugs: three, action: 'tag', value: 'Spring' }) });
    const folder = (await api('/api/qr?folder=QA%20Campaign&tag=spring', { token })).body;
    check('Bulk folder + tag, then filter by both', Array.isArray(folder) && folder.length === 3, `n=${folder?.length}`);
    const badAct = await api('/api/qr/bulk', { method: 'POST', token, body: JSON.stringify({ slugs: three, action: 'explode' }) });
    check('Bulk with an unknown action → 400', badAct.status === 400, `got ${badAct.status}`);
    const gone = await api('/api/qr/bulk', { method: 'POST', token, body: JSON.stringify({ slugs: three, action: 'delete' }) });
    check('Bulk delete → 3 done', gone.body?.done?.length === 3, JSON.stringify(gone.body));

    // UTM appended on redirect; a parameter already in the destination wins.
    const utm = await mk({ title: 'QA UTM', destination_url: 'https://example.com/p?utm_source=keep&x=1', content_data: { utm: { source: 'qr', medium: 'print', campaign: 'avurudu' } } });
    const wu = await runWorker(`/${utm.body?.slug}`, { ua: 'QA-utm' });
    check('UTM appended without clobbering existing params', wu.location === 'https://example.com/p?utm_source=keep&x=1&utm_medium=print&utm_campaign=avurudu', `got ${wu.location}`);
  }

  // ── 32. Forms: definition, edge submit, validation, spam control, owner API ──
  section('32. Forms — cap on Free, submit at the edge, validation, honeypot, 429, CSV, export');
  {
    const def = { title: 'QA feedback', intro: 'Tell us', submit_label: 'Send', thank_you: 'Thanks, QA!', fields: [
      { id: 'name', type: 'text', label: 'Name', required: true },
      { id: 'email', type: 'email', label: 'Email' },
      { id: 'stars', type: 'rating', label: 'Stars' },
    ] };
    await admin.from('profiles').update({ plan: 'free', plan_expires_at: null, is_trial: false, trial_expires_at: new Date(Date.now() - 86400000).toISOString() }).eq('id', uid);
    const freeForm = await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'form', title: 'QA form', content_data: def }) });
    check('Free: a form → 403 LIMIT_FORMS (Free has 0)', freeForm.status === 403 && freeForm.body?.code === 'LIMIT_FORMS', `status=${freeForm.status} code=${freeForm.body?.code}`);
    await admin.from('profiles').update({ plan: 'pro', plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), is_trial: false }).eq('id', uid);
    const badDef = await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'form', title: 'QA bad form', content_data: { fields: [{ id: 'x', type: 'select', label: 'Pick' }] } }) });
    check('A select field without options → 400 INVALID_FORM', badDef.status === 400 && badDef.body?.code === 'INVALID_FORM', `got ${badDef.status}`);
    const stranger = await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'form', title: 'QA relay', content_data: { ...def, notify_email: 'someone-else@example.com' } }) });
    check('notify_email outside the account → 400 (no mail relay)', stranger.status === 400 && stranger.body?.code === 'INVALID_FORM', `got ${stranger.status}`);
    const f = await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'form', title: 'QA form', content_data: { ...def, notify_email: TEST_EMAIL } }) });
    const fs = f.body?.slug;
    check('Pro: create a form → 201, dynamic', f.status === 201 && f.body?.is_dynamic === true, `status=${f.status}`);

    const kv = new Map<string, string>();
    const view = await runWorker(`/${fs}`, { kv, ua: 'QA-form' });
    check('Form renders native inputs and a honeypot', view.status === 200 && view.body.includes('name="name"') && view.body.includes('required') && view.body.includes('name="_hp"'), `status=${view.status}`);
    const ok = await runWorker(`/${fs}`, { kv, ua: 'QA-form', method: 'POST', form: { name: 'Ann', email: 'ann@example.com', stars: '5', sneaky: 'drop me' } });
    check('Valid answer → thank-you page', ok.status === 200 && ok.body.includes('Thanks, QA!'), `status=${ok.status}`);
    const missing = await runWorker(`/${fs}`, { kv, ua: 'QA-form', method: 'POST', form: { email: 'x@example.com' } });
    check('Missing required field → 400, the form again with the error', missing.status === 400 && missing.body.includes('Name is required') && missing.body.includes('value="x@example.com"'), `status=${missing.status}`);
    const bot = await runWorker(`/${fs}`, { kv, ua: 'QA-form', method: 'POST', form: { name: 'Bot', _hp: 'http://spam' } });
    check('Filled honeypot → looks accepted', bot.status === 200 && bot.body.includes('Thanks, QA!'), `status=${bot.status}`);
    const subs = (await api(`/api/forms/${fs}/submissions`, { token })).body;
    check('Only the real answer is stored, unknown field stripped', Array.isArray(subs) && subs.length === 1 && subs[0].data.name === 'Ann' && subs[0].data.stars === 5 && !('sneaky' in subs[0].data), JSON.stringify(subs));
    check('CSV export includes the answer', toCsv([['name', 'email'], ...(subs || []).map((x: any) => [x.data.name, x.data.email])]).includes('Ann,ann@example.com'));
    const sum = (await api(`/api/analytics/${fs}/summary`, { token })).body;
    check('Answers are not scans (1 scan from the view)', sum?.total_scans === 1, `got ${sum?.total_scans}`);
    // Accepted so far: Ann and the bot (2). A typo (400) does not count, so 3 more are accepted, then the 6th is refused.
    for (const n of ['Four', 'Five', 'Six']) await runWorker(`/${fs}`, { kv, ua: 'QA-form', method: 'POST', form: { name: n } });
    const sixth = await runWorker(`/${fs}`, { kv, ua: 'QA-form', method: 'POST', form: { name: 'Seven' } });
    check('6th accepted answer from one visitor in 15 min → 429', sixth.status === 429, `got ${sixth.status}`);
    const direct = await api(`/internal/form/${fs}`, { method: 'POST', body: JSON.stringify({ fields: { name: 'x' } }) });
    check('/internal/form without the secret → 401', direct.status === 401, `got ${direct.status}`);
    const exp = (await api('/api/user/export', { token })).body;
    check('Data export includes form submissions', Array.isArray(exp?.form_submissions) && exp.form_submissions.some((x: any) => x.slug === fs), `n=${exp?.form_submissions?.length}`);
    const del = subs?.[0] ? await api(`/api/forms/${fs}/submissions/${subs[0].id}`, { method: 'DELETE', token }) : { status: 0 };
    const after = (await api(`/api/forms/${fs}/submissions`, { token })).body;
    check('Delete one submission', del.status === 200 && Array.isArray(after) && !after.some((x: any) => x.id === subs?.[0]?.id), `status=${del.status}`);
  }

  // ── 33. Tracking and smart routing: city, language, referrer, GPS, rules ─────
  section('33. Tracking — city/language/referrer maps, opt-in GPS, smart routing rules');
  {
    await admin.from('profiles').update({ plan: 'pro', plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), is_trial: false }).eq('id', uid);
    const mk = (body: any) => api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'url', is_dynamic: true, ...body }) });
    check('pickRoute self-check: iOS rule, weekday hours, fallback', pickRoute([{ if: { os: ['iOS'] }, url: 'https://i.lk' }], routeCtx('iPhone', '', '')) === 'https://i.lk'
      && pickRoute([{ if: { os: ['iOS'] }, url: 'https://i.lk' }], routeCtx('Windows NT', '', '')) === '');

    // City, language and referrer domain recorded per scan and summed like countries.
    const t = (await mk({ title: 'QA tracking', destination_url: 'https://example.com/t' })).body?.slug;
    await runWorker(`/${t}`, { ua: 'QA-city-1', cf: { country: 'LK', city: 'Kandy' }, lang: 'si-LK,si;q=0.9' });
    const cities = (await api(`/api/analytics/${t}/cities`, { token })).body;
    const langs = (await api(`/api/analytics/${t}/languages`, { token })).body;
    check('City recorded (Kandy)', Array.isArray(cities) && cities[0]?.city === 'Kandy' && cities[0]?.scans === 1, JSON.stringify(cities));
    check('Language recorded (si)', Array.isArray(langs) && langs[0]?.language === 'si', JSON.stringify(langs));
    const acc = (await api(`/api/analytics/account/${uid}/cities`, { token })).body;
    check('City appears in account analytics', Array.isArray(acc) && acc.some((c: any) => c.city === 'Kandy'), JSON.stringify(acc));
    await api('/internal/scan', { method: 'POST', internal: true, body: JSON.stringify({ slug: t, ua: 'Mozilla/5.0 (Windows NT 10.0)', country: 'LK', referer: 'https://www.instagram.com/p/xyz', is_unique: true, status: 'success' }) });
    const refs = (await api(`/api/analytics/${t}/referrers`, { token })).body;
    check('Referrer domain recorded (instagram.com)', Array.isArray(refs) && refs.some((x: any) => x.referrer === 'instagram.com'), JSON.stringify(refs));

    // Opt-in GPS: an interstitial is served, and a posted fix is stored rounded to 3 decimals.
    const g = (await mk({ title: 'QA GPS', destination_url: 'https://example.com/gps', content_data: { gps: true } })).body?.slug;
    const page = await runWorker(`/${g}`, { ua: 'QA-gps' });
    const eventId = page.body.match(/e:"([0-9a-f-]{36})"/)?.[1];
    check('GPS on: interstitial with the destination and a consent line', page.status === 200 && page.body.includes('getCurrentPosition') && page.body.includes('https://example.com/gps') && page.body.includes('You can say no') && !!eventId, `status=${page.status}`);
    await sleep(500);
    const fix = await api('/internal/geo', { method: 'POST', internal: true, body: JSON.stringify({ slug: g, event_id: eventId, lat: 6.927123, lng: 79.861987 }) });
    const geo = (await api(`/api/analytics/${g}/geo`, { token })).body;
    check('A posted fix is stored rounded to 3 decimals', fix.status === 204 && Array.isArray(geo) && geo[0]?.lat === 6.927 && geo[0]?.lng === 79.862, `status=${fix.status} ${JSON.stringify(geo)}`);
    const again = await api('/internal/geo', { method: 'POST', internal: true, body: JSON.stringify({ slug: g, event_id: eventId, lat: 1, lng: 1 }) });
    const geo2 = (await api(`/api/analytics/${g}/geo`, { token })).body;
    check('A second fix for the same scan does not move it', again.status === 404 && geo2?.[0]?.lat === 6.927, JSON.stringify(geo2));
    const nullFix = await api('/internal/geo', { method: 'POST', internal: true, body: JSON.stringify({ slug: g, event_id: eventId, lat: null, lng: null }) });
    check('A null fix is refused, not stored as 0,0', nullFix.status === 400, `got ${nullFix.status}`);
    const lost = await api('/internal/geo', { method: 'POST', internal: true, body: JSON.stringify({ slug: g, event_id: '00000000-0000-4000-8000-000000000000', lat: 1, lng: 1 }) });
    check('A fix for a scan that is not recorded (yet) → 404, so the Worker retries', lost.status === 404, `got ${lost.status}`);
    const noSecret = await api('/internal/geo', { method: 'POST', body: JSON.stringify({ slug: g, event_id: eventId, lat: 1, lng: 1 }) });
    check('/internal/geo without the secret → 401', noSecret.status === 401, `got ${noSecret.status}`);

    // Smart routing: first matching rule wins, else the destination.
    const rules = [{ if: { os: ['iOS'] }, url: 'https://apps.apple.com/app/id9' }, { if: { country: ['LK'] }, url: 'https://example.com/lk' }];
    const rt = (await mk({ title: 'QA routing', destination_url: 'https://example.com/default', content_data: { rules } })).body?.slug;
    const ios = await runWorker(`/${rt}`, { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', cf: { country: 'US' } });
    const lk = await runWorker(`/${rt}`, { ua: 'Mozilla/5.0 (Windows NT 10.0)', cf: { country: 'LK' } });
    const other = await runWorker(`/${rt}`, { ua: 'Mozilla/5.0 (Windows NT 10.0)', cf: { country: 'GB' } });
    check('Routing: iPhone → iOS rule', ios.location === 'https://apps.apple.com/app/id9', `got ${ios.location}`);
    check('Routing: Sri Lanka → country rule', lk.location === 'https://example.com/lk', `got ${lk.location}`);
    check('Routing: no match → destination', other.location === 'https://example.com/default', `got ${other.location}`);
    const badRules = await mk({ title: 'QA bad rules', destination_url: 'https://example.com/x', content_data: { rules: [{ if: { days: [9] }, url: 'https://x.lk' }] } });
    check('Invalid rules → 400 INVALID_RULES', badRules.status === 400 && badRules.body?.code === 'INVALID_RULES', `got ${badRules.status}`);
    await admin.from('profiles').update({ plan: 'free', plan_expires_at: null, is_trial: false, trial_expires_at: new Date(Date.now() - 86400000).toISOString() }).eq('id', uid);
    const freeRules = await api(`/api/qr/${rt}`, { method: 'PUT', token, body: JSON.stringify({ content_data: { rules } }) });
    check('Free: saving rules → 403 FEATURE_ROUTING', freeRules.status === 403 && freeRules.body?.code === 'FEATURE_ROUTING', `got ${freeRules.status}`);
    const keep = await api(`/api/qr/${rt}`, { method: 'PUT', token, body: JSON.stringify({ title: 'QA routing renamed', content_data: { rules } }) });
    check('On Free, an edit that leaves the stored rules unchanged still saves', keep.status === 200, `got ${keep.status}`);
    const lapsedCfg = (await api(`/internal/slug/${rt}`, { internal: true })).body;
    check('On Free, stored rules are not served to the edge', lapsedCfg?.rules === undefined, JSON.stringify(lapsedCfg?.rules));
    await admin.from('profiles').update({ plan: 'pro', plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString() }).eq('id', uid);
  }

  // ── 34. Business tier: webhooks, workspaces, several custom domains ──────────
  section('34. Business tier — signed webhooks, workspace isolation, domains per plan');
  {
    const bizUntil = () => new Date(Date.now() + 30 * 86400000).toISOString();
    await admin.from('profiles').update({ plan: 'team', plan_expires_at: bizUntil(), is_trial: false }).eq('id', uid);
    const hook = (body: any) => api('/api/webhooks', { method: 'POST', token, body: JSON.stringify(body) });

    // Webhooks need Business.
    const teamHook = await hook({ url: 'https://example.com/hook', events: ['qr.created'] });
    check('Team: adding a webhook → 403 FEATURE_WEBHOOKS', teamHook.status === 403 && teamHook.body?.code === 'FEATURE_WEBHOOKS', `got ${teamHook.status}`);
    await admin.from('profiles').update({ plan: 'business', plan_expires_at: bizUntil(), is_trial: false }).eq('id', uid);
    const biz = (await api('/api/user/plan', { token })).body?.limits;
    check('Business limits apply after a Business payment state', biz?.webhooks === true && biz?.workspaces === 10 && biz?.seats === 25 && biz?.custom_domains === 50, JSON.stringify(biz));
    const plain = await hook({ url: 'http://example.com/hook', events: ['qr.created'] });
    const priv = await hook({ url: 'https://192.168.1.5/hook', events: ['qr.created'] });
    const badEvt = await hook({ url: 'https://example.com/hook', events: ['everything'] });
    check('Webhook URL must be https and public; events must be known', plain.status === 400 && priv.status === 400 && badEvt.status === 400, `${plain.status}/${priv.status}/${badEvt.status}`);

    // A local receiver: records each delivery and verifies the signature with the shared verifier.
    const received: { ok: boolean; type: string; slug?: string }[] = [];
    let secret = '';
    const receiver = http.createServer((rq, rs) => {
      let raw = '';
      rq.on('data', c => (raw += c));
      rq.on('end', () => {
        const ok = verifyStandardWebhook(rq.headers as any, raw, secret);
        const body = JSON.parse(raw || '{}');
        received.push({ ok, type: body.type, slug: body.data?.slug });
        rs.writeHead(200).end('ok');
      });
    });
    await new Promise<void>(r => receiver.listen(0, '127.0.0.1', r));
    const rport = (receiver.address() as any).port;
    const made = await hook({ url: `http://127.0.0.1:${rport}/hook`, events: ['qr.created', 'qr.deleted'] });
    secret = made.body?.secret || '';
    check('Business: webhook created, secret shown once', made.status === 201 && secret.startsWith('whsec_'), `status=${made.status} ${JSON.stringify(made.body)}`);
    const listed = (await api('/api/webhooks', { token })).body;
    check('The list never shows the secret', Array.isArray(listed) && listed.length === 1 && !('secret' in listed[0]));

    const wq = await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'url', is_dynamic: true, destination_url: 'https://example.com/wh', title: 'QA webhook' }) });
    await sleep(300);
    const got = received.find(r => r.type === 'qr.created' && r.slug === wq.body?.slug);
    check('qr.created delivered with a signature that verifies', !!got && got.ok, JSON.stringify(received));
    await api(`/api/qr/${wq.body?.slug}`, { method: 'PUT', token, body: JSON.stringify({ title: 'QA webhook renamed' }) });
    await sleep(300);
    check('An event the endpoint did not subscribe to (qr.updated) is not sent', !received.some(r => r.type === 'qr.updated'));
    const test = await api(`/api/webhooks/${made.body?.id}/test`, { method: 'POST', token });
    check('Test ping → 200 from the receiver', test.status === 200 && test.body?.ok === true && received.some(r => r.type === 'webhook.test' && r.ok), JSON.stringify(test.body));
    await api(`/api/qr/${wq.body?.slug}`, { method: 'DELETE', token });
    await sleep(300);
    check('qr.deleted delivered', received.some(r => r.type === 'qr.deleted' && r.slug === wq.body?.slug && r.ok));
    check('A tampered body fails the shared verifier', !verifyStandardWebhook({ 'webhook-id': 'm', 'webhook-timestamp': String(Math.floor(Date.now() / 1000)), 'webhook-signature': 'v1,AAAA' }, '{}', secret));
    await api(`/api/webhooks/${made.body?.id}`, { method: 'DELETE', token });
    await new Promise(r => receiver.close(r));

    // Workspaces: two workspaces, a member held to B cannot see A's codes.
    const wsA = (await api('/api/workspaces', { method: 'POST', token, body: JSON.stringify({ name: 'QA A' }) })).body;
    const wsB = (await api('/api/workspaces', { method: 'POST', token, body: JSON.stringify({ name: 'QA B' }) })).body;
    check('Create two workspaces', !!wsA?.id && !!wsB?.id, JSON.stringify({ wsA, wsB }));
    const inA = await api('/api/qr', { method: 'POST', token: token, headers: { 'X-Workspace': wsA.id }, body: JSON.stringify({ qr_type: 'url', is_dynamic: true, destination_url: 'https://example.com/a', title: 'QA in A' }) });
    const inB = await api('/api/qr', { method: 'POST', token: token, headers: { 'X-Workspace': wsB.id }, body: JSON.stringify({ qr_type: 'url', is_dynamic: true, destination_url: 'https://example.com/b', title: 'QA in B' }) });
    const listA = (await api('/api/qr', { token, headers: { 'X-Workspace': wsA.id } })).body;
    const listAll = (await api('/api/qr', { token })).body;
    check('Header X-Workspace scopes the list to that workspace', listA.some((q: any) => q.slug === inA.body?.slug) && !listA.some((q: any) => q.slug === inB.body?.slug) && listAll.some((q: any) => q.slug === inB.body?.slug), `A=${listA?.length} all=${listAll?.length}`);
    const crossGet = await api(`/api/qr/${inB.body?.slug}`, { token, headers: { 'X-Workspace': wsA.id } });
    check('A code from workspace B is not reachable while in workspace A', crossGet.status === 403, `got ${crossGet.status}`);
    const strangeWs = await api('/api/qr', { token, headers: { 'X-Workspace': '00000000-0000-4000-8000-000000000000' } });
    check('An unknown workspace id → 403', strangeWs.status === 403, `got ${strangeWs.status}`);

    const memEmail = `qa-wsmember-${Date.now()}@test.dynamicqr.local`;
    const { data: wm } = await admin.auth.admin.createUser({ email: memEmail, password: TEST_PASS, email_confirm: true });
    if (wm?.user?.id) createdUids.push(wm.user.id);
    const invB = await api('/api/team', { method: 'POST', token, body: JSON.stringify({ email: memEmail, workspace_id: wsB.id }) });
    const mclient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: msess } = await mclient.auth.signInWithPassword({ email: memEmail, password: TEST_PASS });
    const wmTok = msess?.session?.access_token || '';
    if (invB.status === 201 && wmTok) {
      const mList = (await api('/api/qr', { token: wmTok })).body;
      check('A member of workspace B lists only B\'s codes', Array.isArray(mList) && mList.some((q: any) => q.slug === inB.body?.slug) && !mList.some((q: any) => q.slug === inA.body?.slug), `n=${mList?.length}`);
      const mOther = await api('/api/qr', { token: wmTok, headers: { 'X-Workspace': wsA.id } });
      check('…and cannot switch to workspace A', mOther.status === 403, `got ${mOther.status}`);
      const mGet = await api(`/api/qr/${inA.body?.slug}`, { token: wmTok });
      check('…nor open a code from workspace A', mGet.status === 403, `got ${mGet.status}`);
    } else check('Invite and sign in a workspace member', false, `invite=${invB.status} token=${!!wmTok}`);
    if (wm?.user?.id) await admin.auth.admin.deleteUser(wm.user.id);
    const delWs = await api(`/api/workspaces/${wsA.id}`, { method: 'DELETE', token });
    const afterDel = (await api('/api/qr', { token, headers: { 'X-Workspace': 'default' } })).body;
    check('Deleting a workspace moves its codes to the default one', delWs.status === 200 && afterDel.some((q: any) => q.slug === inA.body?.slug), `status=${delWs.status}`);
    await admin.from('profiles').update({ plan: 'team', plan_expires_at: bizUntil() }).eq('id', uid);
    const teamWs = await api('/api/workspaces', { method: 'POST', token, body: JSON.stringify({ name: 'QA over' }) });
    check('Team: a 2nd workspace → 403 LIMIT_WORKSPACES', teamWs.status === 403 && teamWs.body?.code === 'LIMIT_WORKSPACES', `got ${teamWs.status}`);

    // Domains: Team has 10 (not 1); the (N+1)th is refused. Rows are inserted directly (no Cloudflare in CI).
    const hosts = Array.from({ length: 10 }, (_, i) => `qa${i}-${Date.now().toString(36)}.example.lk`);
    await admin.from('custom_domains').insert(hosts.map(hostname => ({ uid, hostname, status: 'active' })));
    const doms = (await api('/api/domains', { token })).body;
    check('Team: 10 domains stored and listed', Array.isArray(doms) && doms.length === 10, `n=${doms?.length}`);
    const eleventh = await api('/api/domains', { method: 'POST', token, body: JSON.stringify({ hostname: `qa11-${Date.now().toString(36)}.example.lk` }) });
    check('Team: the 11th domain → 403 LIMIT_DOMAINS', eleventh.status === 403 && eleventh.body?.code === 'LIMIT_DOMAINS', `got ${eleventh.status}`);
    const withDom = await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'url', is_dynamic: true, destination_url: 'https://example.com/d', title: 'QA domain', domain: hosts[3] }) });
    check('A code prints with a chosen verified domain', withDom.status === 201 && getQRContent(withDom.body) === `https://${hosts[3]}/${withDom.body?.slug}`, JSON.stringify(withDom.body?.domain));
    const badDom = await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'url', is_dynamic: true, destination_url: 'https://example.com/d', title: 'QA bad domain', domain: 'evil.example.com' }) });
    check('A domain that is not yours → 400 INVALID_DOMAIN', badDom.status === 400 && badDom.body?.code === 'INVALID_DOMAIN', `got ${badDom.status}`);
    await admin.from('custom_domains').delete().eq('uid', uid);
  }

  // ── 35. Cleanup ──────────────────────────────────────────────────────────────
  section('35. Cleanup');
  {
    const del = await api('/api/user/account', { method: 'DELETE', token });
    check('DELETE /api/user/account → 200', del.status === 200, `status=${del.status} ${JSON.stringify(del.body)}`);

    await sleep(1000);
    const { data: gone } = await admin.auth.admin.getUserById(uid);
    check('Auth user removed from Supabase', !gone?.user, `user still exists: ${gone?.user?.id}`);
    const { data: left } = await admin.storage.from('files').list(uid);
    check('Account delete removes the user\'s uploads', (left || []).length === 0, `left=${left?.length}`);
  }

  // ─── Results ──────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(58));
  console.log(`  Results: ${passed} passed, ${failed} failed out of ${passed + failed} checks`);
  console.log('═'.repeat(58));

  if (failed > 0) {
    console.log('\nFailed checks:');
    results.filter(r => !r.ok).forEach(r =>
      console.log(`  ❌ ${r.name}${r.note ? ' — ' + r.note : ''}`)
    );
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(async err => {
  console.error('\nFATAL:', err);
  // Do not leave this run's users (and their codes) in the database.
  await Promise.all(createdUids.map(id => admin.auth.admin.deleteUser(id).catch(() => {})));
  process.exit(1);
});
