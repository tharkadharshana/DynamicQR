// Guest pages + vCard/Text/Email/Wi-Fi rendering, shared with the dev server (Wrangler bundles the TS import).
import { renderGuestPage, pickLang } from '../src/lib/guestPage';

// Small branded HTML page for every non-redirect outcome. Never show a bare error on a printed code.
const page = (title, bodyHtml, status, accent = '#E85D3A') => new Response(`<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f4f4f6; }
    .card { background: white; padding: 32px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); width: 90%; max-width: 380px; text-align: center; }
    h2 { color: #16171b; margin: 0 0 12px; }
    p { color: #55565c; line-height: 1.5; margin: 0 0 16px; }
    input { width: 100%; padding: 12px; margin: 8px 0 16px; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; font-size: 16px; }
    button, .btn { display: inline-block; width: 100%; padding: 12px; background: ${accent}; color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 15px; text-decoration: none; cursor: pointer; box-sizing: border-box; }
    .error { color: #D23030; font-size: 13px; margin: -8px 0 12px; }
  </style>
</head>
<body><div class="card">${bodyHtml}</div></body>
</html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const sha256Hex = async (s) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const PIN_MAX_FAILS = 5;
const PIN_LOCK_SECONDS = 900;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const slug = url.pathname.slice(1).split('/')[0]; // only first path segment

    // Known frontend routes - always pass through to the origin
    const FRONTEND_ROUTES = new Set([
      '', 'create', 'edit', 'analytics', 'settings', 'billing',
      'login', 'legal', 'pricing', 'api-docs'
    ]);

    // 1. Internal / Hidden Routes
    const internalSecret = env.INTERNAL_SECRET;
    if (slug === 'internal' && url.pathname.startsWith('/internal/purge/')) {
      if (request.headers.get('x-internal-secret') !== internalSecret) {
        return new Response('Unauthorized', { status: 401 });
      }
      const targetSlug = url.pathname.split('/').pop();
      await env.QR_CACHE.delete(targetSlug);
      return new Response('Purged', { status: 200 });
    }

    // Our nanoid alphabet, 5-12 chars.
    const isSlug = !FRONTEND_ROUTES.has(slug) && /^[23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ]{5,12}$/.test(slug);
    // A customer's custom short domain (Team) only serves codes; anything else goes to the main site.
    if (!isSlug && env.MAIN_HOST && url.host !== env.MAIN_HOST) {
      return Response.redirect(`https://${env.MAIN_HOST}${url.pathname}${url.search}`, 302);
    }

    // 2. Pass through: empty path, known frontend routes, static files, api calls
    if (
      FRONTEND_ROUTES.has(slug) ||
      slug.includes('.') ||
      slug.startsWith('api') ||
      slug.startsWith('internal') ||
      slug.startsWith('assets') ||
      slug.startsWith('_')
    ) {
      return fetch(request);
    }

    // Validate it looks like a QR slug (our nanoid alphabet, 5-12 chars)
    if (!isSlug) {
      return fetch(request);
    }

    // --- ANALYTICS CONTEXT ---
    const cf = request.cf || {};
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ua = request.headers.get('User-Agent') || '';
    const today = new Date().toISOString().slice(0, 10);

    // Daily visitor fingerprint for uniqueness and gate sessions. Never stored outside KV keys.
    const visitorHash = await sha256Hex(`${ip}:${ua.slice(0, 100)}:${today}:${env.HASH_SALT || ''}`);

    // --- CONFIG FETCHING ---
    const apiUrl = (env.API_URL || '').replace(/\/$/, '');
    let config = await env.QR_CACHE.get(slug, { type: 'json' });

    if (!config) {
      let res;
      try {
        res = await fetch(`${apiUrl}/internal/slug/${slug}`, {
          headers: { 'x-internal-secret': internalSecret },
          signal: AbortSignal.timeout(5000)
        });
      } catch (err) {
        console.error(`Origin lookup failed: ${err.message}`);
        res = null;
      }
      if (res && res.status === 404) {
        return page('QR not found', '<h2>QR code not found</h2><p>This code does not exist. Check that you scanned the right one.</p>', 404);
      }
      if (!res || !res.ok) {
        return page('Temporarily unavailable', '<h2>Temporarily unavailable</h2><p>We could not open this QR code right now. Please scan again in a minute.</p>', 503);
      }
      config = await res.json();
      config.scan_count = config.total_scans || 0;
      ctx.waitUntil(env.QR_CACHE.put(slug, JSON.stringify(config), { expirationTtl: 300 }));
    }

    // --- GATE ENGINE ---
    if (!config.is_active) {
      return page('QR inactive', '<h2>This QR code is inactive</h2><p>The owner has switched this code off.</p>', 410);
    }

    if (config.paused) {
      // Owner's trial/plan lapsed past the grace period and this code is above the plan's allowance.
      return page('QR paused', `<h2>${esc(config.title) || 'QR code'}</h2><p>This QR code is paused by its owner. Please contact the business that displayed it.</p>`, 410);
    }

    if (config.expiry_date && new Date(config.expiry_date) < new Date()) {
      return page('QR expired', '<h2>This QR code has expired</h2><p>The offer or event behind this code has ended.</p>', 410);
    }

    if (config.quota_exceeded) {
      return page('Limit reached', `<h2>Monthly limit reached</h2><p>This QR code's owner has used this month's scans. Please try again later.</p><a class="btn" href="${url.origin}/pricing">I'm the owner: upgrade</a>`, 429, '#991b1b');
    }

    const qrType = config.qr_type || 'url';
    if (qrType === 'url' && !config.destination_url) {
      return page('QR not available', '<h2>Nothing to open yet</h2><p>This QR code has no destination.</p>', 404);
    }

    const visitorKey = `uniq:${slug}:${visitorHash}`;
    const isUnique = await env.QR_CACHE.get(visitorKey).then(v => !v);

    // --- VISITOR GUARD --- (the origin resolves the limit from the owner's license; 0 = unlimited)
    const rateLimitKey = `ratelimit:${slug}:${visitorHash}`;
    const visitorCount = await env.QR_CACHE.get(rateLimitKey).then(v => parseInt(v) || 0);
    const effectiveLimit = config.visitor_rate_limit ?? 5;

    if (effectiveLimit > 0 && visitorCount >= effectiveLimit) {
      return page('Too many scans', '<h2>Slow down!</h2><p>You have reached the scan limit for this QR code from this device. Please try again later.</p>', 429, '#d97706');
    }

    if (config.password_hash) {
      const sessionKey = `uniq:${slug}:${visitorHash}:pw_ok`;
      const failKey = `pwfail:${slug}:${visitorHash}`;
      const isUnlocked = await env.QR_CACHE.get(sessionKey);

      if (!isUnlocked) {
        const fails = await env.QR_CACHE.get(failKey).then(v => parseInt(v) || 0);
        if (fails >= PIN_MAX_FAILS) {
          return page('Too many attempts', '<h2>Too many attempts</h2><p>Wrong PIN entered too many times. Please wait 15 minutes and try again.</p>', 429);
        }

        let isWrong = false;
        if (request.method === 'POST') {
          const body = await request.formData();
          const submittedHash = await sha256Hex(`${body.get('password')}${slug}`); // salted with slug, matches server
          if (submittedHash === config.password_hash) {
            await env.QR_CACHE.put(sessionKey, '1', { expirationTtl: 86400 });
          } else {
            isWrong = true;
            await env.QR_CACHE.put(failKey, String(fails + 1), { expirationTtl: PIN_LOCK_SECONDS });
          }
        }

        if (isWrong || request.method !== 'POST') {
          if (isWrong && apiUrl) {
            ctx.waitUntil(fetch(`${apiUrl}/internal/scan`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
              body: JSON.stringify({
                slug, ip, ua,
                referer: request.headers.get('Referer') || '',
                country: cf.country || 'Unknown',
                is_unique: isUnique,
                status: 'failed_password'
              })
            }).catch(err => console.error(`Analytics sync error: ${err.message}`)));
          }

          return page('Protected QR', `<h2>🔒 Protected</h2><p>Enter the PIN to continue</p>
            <form method="POST">
              <input type="password" name="password" placeholder="Enter PIN" autofocus required>
              ${isWrong ? '<div class="error">Incorrect PIN. Please try again.</div>' : ''}
              <button type="submit">Unlock →</button>
            </form>`, 200);
        }
      }
    }

    // Switching language on a guest page reloads with ?lang= — not a new scan.
    const isLangSwitch = qrType !== 'url' && url.searchParams.has('lang');

    // --- SCAN LIMIT CHECK (only after the other gates pass) ---
    // ponytail: count lives in a per-edge KV copy refreshed from the DB every 300s; can overshoot under bursty multi-region traffic.
    if (!isLangSwitch) config.scan_count++;
    if (!isLangSwitch && config.scan_limit !== null && config.scan_limit !== undefined && config.scan_count > config.scan_limit) {
      ctx.waitUntil(fetch(`${apiUrl}/api/qr/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({ is_active: false }),
        signal: AbortSignal.timeout(3000)
      }).then(() => env.QR_CACHE.delete(slug)).catch(err => console.error(`Deactivate failed: ${err.message}`)));
      return page('Scan limit reached', '<h2>Scan limit reached</h2><p>This QR code has been scanned the maximum number of times.</p>', 410);
    }
    if (!isLangSwitch) ctx.waitUntil(env.QR_CACHE.put(slug, JSON.stringify(config), { expirationTtl: 300 }));

    if (effectiveLimit > 0 && !isLangSwitch) {
      ctx.waitUntil(env.QR_CACHE.put(rateLimitKey, String(visitorCount + 1), { expirationTtl: config.visitor_rate_period || 3600 }));
    }

    if (isUnique && !isLangSwitch) {
      const now = new Date();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      const ttl = Math.floor((endOfDay.getTime() - now.getTime()) / 1000);
      ctx.waitUntil(env.QR_CACHE.put(visitorKey, '1', { expirationTtl: Math.max(ttl, 60) }));
    }

    // --- ANALYTICS --- never on the redirect's critical path.
    // ponytail: quota is decided from the 300s-cached config, so an owner can overshoot by <= 5 min of traffic.
    if (apiUrl && !isLangSwitch) {
      ctx.waitUntil(fetch(`${apiUrl}/internal/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({
          slug, ip, ua,
          referer: request.headers.get('Referer') || '',
          lang: request.headers.get('Accept-Language') || '',
          country: cf.country || 'Unknown',
          asn: cf.asn || null,
          colo: cf.colo || 'Unknown',
          tls: cf.tlsVersion || 'Unknown',
          is_eu: cf.isEUCountry || false,
          is_unique: isUnique,
          status: 'success'
        }),
        signal: AbortSignal.timeout(4000)
      }).catch(err => console.error(`Analytics sync error: ${err.message}`)));
    }

    const rendered = renderGuestPage(config, pickLang(url.searchParams.get('lang'), request.headers.get('Accept-Language')), request.url);
    if (rendered?.kind === 'html') {
      return new Response(rendered.body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    if (rendered?.kind === 'vcard') {
      return new Response(rendered.body, { headers: { 'Content-Type': 'text/vcard; charset=utf-8', 'Content-Disposition': `attachment; filename="${rendered.filename}"` } });
    }
    if (rendered?.kind === 'redirect') {
      return new Response(null, { status: 302, headers: { Location: rendered.location } });
    }
    return Response.redirect(config.destination_url, 302);
  }
};
