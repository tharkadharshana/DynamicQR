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
 *  23. Cleanup
 */
import 'dotenv/config';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import worker from './worker/worker.js';

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

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: TEST_EMAIL, password: TEST_PASS, email_confirm: true,
  });
  if (createErr || !created?.user) {
    console.error(`\nFATAL: Could not create test user — ${createErr?.message}`);
    console.error('Ensure email/password auth is enabled in Supabase: Auth → Providers → Email');
    process.exit(1);
  }
  uid = created.user.id;
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
      [`/api/analytics/${testSlug}/referrers`,  b => Array.isArray(b),                               'referrers array'],
      [`/api/analytics/${testSlug}/recent`,     b => Array.isArray(b),                               'recent array'],
      [`/api/analytics/${testSlug}/advanced`,   b => 'regions' in b && 'hours' in b,                 'advanced shape'],
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
      `/api/analytics/account/${uid}/referrers`,
      `/api/analytics/account/${uid}/summary`,
      `/api/analytics/account/${uid}/recent`,
      `/api/analytics/account/${uid}/performance`,
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
  section('15b. Worker gate engine (in-process, fake KV)');
  {
    const runWorker = async (path: string, opts: { kv?: Map<string, string>; ua?: string; method?: string; form?: Record<string, string>; apiUrl?: string } = {}) => {
      const kv = opts.kv || new Map<string, string>();
      const env = {
        API_URL: opts.apiUrl || API,
        INTERNAL_SECRET,
        HASH_SALT: process.env.HASH_SALT || 'qa-salt',
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
        headers: { 'User-Agent': opts.ua || 'QA-Worker/1.0', 'CF-Connecting-IP': '198.51.100.7' },
        body: opts.form ? new URLSearchParams(opts.form) : undefined,
        redirect: 'manual',
      });
      const res: Response = await (worker as any).fetch(req, env, ctx);
      await Promise.allSettled(pending);
      return { status: res.status, location: res.headers.get('location'), body: await res.text(), kv };
    };
    const mkQR = async (body: any) => {
      const r = await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'url', is_dynamic: true, ...body }) });
      return r.body?.slug as string | undefined;
    };
    const del = (slug?: string) => slug && api(`/api/qr/${slug}`, { method: 'DELETE', token });

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
      await admin.from('qr_codes').update({ destination_url: '', qr_type: 'vcard' }).eq('slug', legacy);
      const r = await runWorker(`/${legacy}`);
      check('Worker: dynamic row without destination → 404 page', r.status === 404 && r.body.includes('no destination'), `status=${r.status}`);
    }
    await del(legacy);

    // Non-URL types are forced static until the Worker renders them (Phase 2)
    const vc = await api('/api/qr', { method: 'POST', token, body: JSON.stringify({ qr_type: 'vcard', is_dynamic: true, title: 'QA W vcard', content_data: { first_name: 'A' } }) });
    check('POST /api/qr vCard with is_dynamic=true → stored static', vc.status === 201 && vc.body?.is_dynamic === false, `status=${vc.status} is_dynamic=${vc.body?.is_dynamic}`);
    await del(vc.body?.slug);
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
        JSON.stringify(inv.body?.map((r: any) => `${r.currency}:${r.status}`)));

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

  // ── 23. Cleanup ──────────────────────────────────────────────────────────────
  section('23. Cleanup');
  {
    const del = await api('/api/user/account', { method: 'DELETE', token });
    check('DELETE /api/user/account → 200', del.status === 200, `status=${del.status} ${JSON.stringify(del.body)}`);

    await sleep(1000);
    const { data: gone } = await admin.auth.admin.getUserById(uid);
    check('Auth user removed from Supabase', !gone?.user, `user still exists: ${gone?.user?.id}`);
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

run().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
