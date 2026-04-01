export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const slug = url.pathname.slice(1).split('/')[0]; // only first path segment

    // Known frontend routes - always pass through to Cloud Run
    const FRONTEND_ROUTES = new Set([
      '', 'create', 'edit', 'analytics', 'settings', 'billing', 
      'login', 'legal', 'pricing', 'api-docs'
    ]);
    
    const QUOTA_EXCEEDED_HTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Limit Reached</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fdf2f2; }
          .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); width: 90%; max-width: 400px; text-align: center; border: 1px solid #fecaca; }
          h2 { color: #991b1b; margin-bottom: 12px; }
          p { color: #7f1d1d; line-height: 1.5; margin-bottom: 24px; }
          .btn { display: inline-block; padding: 12px 24px; background: #991b1b; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Monthly Limit Reached</h2>
          <p>The monthly scan quota for this QR code's owner has been exhausted. Please contact the owner or try again next month.</p>
          <a href="https://dynamicqr.app/pricing" class="btn">Upgrade Plan</a>
        </div>
      </body>
      </html>
    `;

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

    // 2. Pass through logic:
    // Pass through: empty path, known frontend routes, static files, api calls
    if (
      FRONTEND_ROUTES.has(slug) ||
      slug.includes('.') ||
      slug.startsWith('api') ||
      slug.startsWith('internal') ||
      slug.startsWith('assets') ||
      slug.startsWith('_')
    ) {
      return fetch(request); // Pass through to Cloud Run
    }

    // Validate it looks like a QR slug (our nanoid alphabet, 5-12 chars)
    if (!/^[23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ]{5,12}$/.test(slug)) {
      return fetch(request); // Unknown path - let Cloud Run handle it
    }

    // --- PREPARE ANALYTICS CONTEXT ---
    const cf = request.cf || {};
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ua = request.headers.get('User-Agent') || '';
    const today = new Date().toISOString().slice(0, 10);
    
    // Compute visitor hash for uniqueness and gate sessions
    const fingerprint = `${ip}:${ua.slice(0, 100)}:${today}:${env.HASH_SALT || ''}`;
    const msgUint8 = new TextEncoder().encode(fingerprint);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const visitorHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // --- CONFIG FETCHING ---
    const apiUrl = env.API_URL;
    
    let config = await env.QR_CACHE.get(slug, { type: "json" });

    // For better debugging and faster updates during testing, we'll check KV but fallback quickly.
    // In production, increased TTL is better.
    if (!config) {
      const res = await fetch(`${apiUrl.replace(/\/$/, '')}/internal/slug/${slug}`, {
        headers: { "x-internal-secret": internalSecret },
        signal: AbortSignal.timeout(5000)
      });
      if (res.status === 404) return new Response("QR Not Found", { status: 404 });
      if (!res.ok) return new Response("Service Unavailable (Origin error)", { status: 503 });
      
      config = await res.json();
      config.scan_count = config.total_scans || 0;
      // Set a lower TTL (60s) for more responsive updates while user is testing
      ctx.waitUntil(env.QR_CACHE.put(slug, JSON.stringify(config), { expirationTtl: 300 }));
    }

    // --- GATE ENGINE ---
    
    if (!config.is_active) return new Response("This QR code is inactive.", { status: 410 });

    if (config.expiry_date && new Date(config.expiry_date) < new Date()) {
      return new Response("This QR code has expired.", { status: 410 });
    }

    // Prepare common analytics parts
    const visitorKey = `uniq:${slug}:${visitorHash}`;
    let isUnique = await env.QR_CACHE.get(visitorKey).then(v => !v);

    // --- VISITOR RATE LIMIT CHECK (NEW) ---
    const rateLimitKey = `ratelimit:${slug}:${visitorHash}`;
    const visitorCount = await env.QR_CACHE.get(rateLimitKey).then(v => parseInt(v) || 0);
    
    // Default limit applies only to Free plan owners
    const isPaidPlan = config.owner_plan === 'pro' || config.owner_plan === 'team';
    const effectiveLimit = config.owner_plan === 'free' ? 5 : (config.visitor_rate_limit !== undefined ? config.visitor_rate_limit : (isPaidPlan ? 0 : 5));

    if (effectiveLimit > 0 && visitorCount >= effectiveLimit) {
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Too Many Scans</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fffcf0; }
            .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); width: 90%; max-width: 400px; text-align: center; border: 1px solid #fef3c7; }
            h2 { color: #92400e; margin-bottom: 12px; }
            p { color: #b45309; line-height: 1.5; margin-bottom: 24px; }
            .timer { font-weight: bold; background: #fffbeb; padding: 4px 12px; border-radius: 20px; color: #d97706; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Slow down!</h2>
            <p>You have reached the temporary scan limit for this QR code. To prevent automated spam, we limit frequent scans from the same device.</p>
            <p>Please try again in <span class="timer">1 hour</span> or wait a few minutes.</p>
          </div>
        </body>
        </html>
      `, { status: 429, headers: { "Content-Type": "text/html" } });
    }

    if (config.password_hash) {
      const sessionKey = `uniq:${slug}:${visitorHash}:pw_ok`;
      const isUnlocked = await env.QR_CACHE.get(sessionKey);
      
      if (!isUnlocked) {
        let isWrong = false;
        if (request.method === "POST") {
          const body = await request.formData();
          const submittedPw = body.get("password");
          const pwUint8 = new TextEncoder().encode(submittedPw + slug); // Salted
          const pwBuffer = await crypto.subtle.digest('SHA-256', pwUint8);
          const pwArray = Array.from(new Uint8Array(pwBuffer));
          const submittedHash = pwArray.map(b => b.toString(16).padStart(2, '0')).join('');
          
          if (submittedHash === config.password_hash) {
            await env.QR_CACHE.put(sessionKey, "1", { expirationTtl: 86400 });
            // proceed to redirect
          } else {
            isWrong = true;
          }
        }

        if (isWrong || request.method !== "POST") {
          // Send "failed/gated" analytics so user knows someone hit the wall
          if (isWrong && apiUrl) {
             const failPayload = {
               slug, ip, ua,
               referer: request.headers.get('Referer') || '',
               country: cf.country || 'Unknown',
               is_unique: isUnique,
               status: 'failed_password'
             };
             ctx.waitUntil(fetch(`${apiUrl.replace(/\/$/, '')}/internal/scan`, {
               method: "POST",
               headers: { "Content-Type": "application/json", "x-internal-secret": internalSecret },
               body: JSON.stringify(failPayload)
             }));
          }

          return new Response(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Protected QR</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f4f4f4; }
                .card { background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); width: 90%; max-width: 320px; text-align: center; }
                input { width: 100%; padding: 12px; margin: 16px 0; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; font-size: 16px; }
                button { width: 100%; padding: 12px; background: #E85D3A; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
                .error { color: #E85D3A; font-size: 13px; margin-top: -8px; margin-bottom: 8px; }
              </style>
            </head>
            <body>
              <div class="card">
                <h2>🔒 Protected</h2>
                <p>Enter the PIN to continue</p>
                <form method="POST">
                  <input type="password" name="password" placeholder="Enter PIN" autofocus required>
                  ${isWrong ? '<div class="error">Incorrect PIN. Please try again.</div>' : ''}
                  <button type="submit">Unlock →</button>
                </form>
              </div>
            </body>
            </html>
          `, { headers: { "Content-Type": "text/html" } });
        }
      }
    }

    // --- SCAN LIMIT CHECK (Only if they passed through gates) ---
    config.scan_count++;
    if (config.scan_limit !== null && config.scan_count > config.scan_limit) {
      ctx.waitUntil(fetch(`${apiUrl}/api/qr/${slug}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-internal-secret': internalSecret 
        },
        body: JSON.stringify({ is_active: false }),
        signal: AbortSignal.timeout(3000)
      }).then(() => env.QR_CACHE.delete(slug)));
      
      return new Response("Scan limit reached.", { status: 410 });
    }
    // Update cache with new count
    ctx.waitUntil(env.QR_CACHE.put(slug, JSON.stringify(config), { expirationTtl: 300 }));

    // Increment visitor rate limit counter (NEW)
    if (effectiveLimit > 0) {
      const newCount = visitorCount + 1;
      const period = config.visitor_rate_period || 3600;
      ctx.waitUntil(env.QR_CACHE.put(rateLimitKey, newCount.toString(), { expirationTtl: period }));
    }

    // --- ANALYTICS (Successful redirect) ---
    if (isUnique) {
      const now = new Date();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      const ttl = Math.floor((endOfDay.getTime() - now.getTime()) / 1000);
      ctx.waitUntil(env.QR_CACHE.put(visitorKey, "1", { expirationTtl: Math.max(ttl, 60) }));
    }

    const payload = {
      slug,
      ip,
      ua,
      referer: request.headers.get('Referer') || '',
      lang: request.headers.get('Accept-Language') || '',
      country: cf.country || 'Unknown',
      asn: cf.asn || null,
      colo: cf.colo || 'Unknown',
      tls: cf.tlsVersion || 'Unknown',
      is_eu: cf.isEUCountry || false,
      is_unique: isUnique
    };

    if (apiUrl) {
      const scanUrl = `${apiUrl.replace(/\/$/, '')}/internal/scan`;
      try {
        // We await the scanResponse to check for 429 status code (Monthly Limit Reached).
        // While this adds ~100ms latency, it is necessary to provide real-time quota enforcement
        // and serve the QUOTA_EXCEEDED_HTML before the 302 redirect.
        const scanResponse = await fetch(scanUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": internalSecret
          },
          body: JSON.stringify({ ...payload, status: 'success' }),
          signal: AbortSignal.timeout(4000)
        });

        if (scanResponse.status === 429) {
          return new Response(QUOTA_EXCEEDED_HTML, { 
            status: 429, 
            headers: { "Content-Type": "text/html" } 
          });
        }
      } catch (err) {
        console.error(`Analytics sync error: ${err.message}`);
        // Fallback: Proceed with redirect even if analytics fails
      }
    }

    return Response.redirect(config.destination_url, 302);
  }
};
