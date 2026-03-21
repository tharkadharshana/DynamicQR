// ════════════════════════════════════════════════════════════════
// Cloudflare Worker — QR Redirect Engine (Module 3)
// Deploy: cd worker && wrangler deploy
// ════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const slug = url.pathname.slice(1); // '/abc123' → 'abc123'

    // Validate slug format — reject garbage immediately
    if (!/^[23456789a-zA-Z]{5,12}$/.test(slug)) {
      return new Response('Not found', { status: 404 });
    }

    // 1. Look up destination — KV cache first, API fallback
    let destination = await env.QR_KV.get(`qr:${slug}`);

    if (!destination) {
      // KV miss — fetch from Cloud Run API
      const res = await fetch(`${env.API_URL}/internal/slug/${slug}`, {
        headers: { 'Authorization': `Bearer ${env.INTERNAL_SECRET}` }
      });
      if (!res.ok) return new Response('Not found', { status: 404 });
      const data = await res.json();
      if (!data.is_active) return new Response('QR code inactive', { status: 410 });
      destination = data.destination_url;
      // Cache for 5 minutes — balances freshness vs API load
      await env.QR_KV.put(`qr:${slug}`, destination, { expirationTtl: 300 });
    }

    // 2. Fire analytics async — NEVER block the redirect
    ctx.waitUntil(captureAnalytics(request, slug, env));

    // 3. Redirect immediately — 302 so browsers don't cache
    return Response.redirect(destination, 302);
  }
};

async function captureAnalytics(request, slug, env) {
  const cf = request.cf || {};
  const ua = request.headers.get('User-Agent') || '';
  const ip = request.headers.get('CF-Connecting-IP') || '';

  // Bot detection — drop silently
  if (isBot(ua)) return;

  // Privacy-safe visitor fingerprint
  // SHA-256(ip + truncated_ua + YYYY-MM-DD)
  const today = new Date().toISOString().slice(0, 10);
  const fingerprint = `${ip}:${ua.slice(0, 100)}:${today}`;
  const visitorHash = await sha256(fingerprint);

  // Check uniqueness using KV with TTL = end of day
  const uniqueKey = `uniq:${slug}:${visitorHash}`;
  const seen = await env.QR_KV.get(uniqueKey);
  const isUnique = !seen;
  if (isUnique) {
    const secondsUntilMidnight = 86400 - (Date.now() / 1000 % 86400);
    await env.QR_KV.put(uniqueKey, '1', { expirationTtl: Math.ceil(secondsUntilMidnight) });
  }

  const parsed = parseUA(ua);
  const referer = request.headers.get('Referer') || '';

  // Write to Cloud Run API
  await fetch(`${env.API_URL}/internal/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.INTERNAL_SECRET}`
    },
    body: JSON.stringify({
      slug,
      country: cf.country || null,
      region: cf.region || null,
      city: cf.city || null,
      timezone: cf.timezone || null,
      device_type: parsed.device,
      os: parsed.os,
      os_version: parsed.osVersion,
      browser: parsed.browser,
      visitor_hash: visitorHash,
      is_unique: isUnique ? 1 : 0,
      is_bot: 0,
      referer_type: classifyReferer(referer)
    })
  });
}

// ── User-Agent parsing ──────────────────────────────────────────
function parseUA(ua) {
  const ua_lower = ua.toLowerCase();

  const device =
    /mobile|android|iphone/.test(ua_lower) ? 'mobile' :
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

// ── Bot detection ───────────────────────────────────────────────
function isBot(ua) {
  return /bot|crawler|spider|preview|facebookexternalhit|googlebot|twitterbot|slackbot|whatsapp|telegram/i.test(ua);
}

// ── Referer classification ──────────────────────────────────────
function classifyReferer(referer) {
  if (!referer) return 'direct';
  if (/android-app:|ios-app:/.test(referer)) return 'app';
  return 'browser';
}

// ── SHA-256 helper ──────────────────────────────────────────────
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
