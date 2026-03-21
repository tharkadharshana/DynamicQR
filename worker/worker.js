export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const slug = url.pathname.slice(1);

    // 1. Ignore static assets, favicon, robots.txt, api routes
    if (!slug || slug.includes('.') || slug.startsWith('api/') || slug.startsWith('internal/') || slug.startsWith('assets/')) {
      return fetch(request); // Passthrough to origin
    }

    // Validate slug format
    if (!/^[23456789a-zA-Z]{5,12}$/.test(slug)) {
      return new Response("Not Found", { status: 404 });
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
    const internalSecret = env.INTERNAL_SECRET;
    
    let config = await env.QR_CACHE.get(slug, { type: "json" });

    if (!config) {
      const res = await fetch(`${apiUrl}/internal/slug/${slug}`, {
        headers: { "x-internal-secret": internalSecret },
        signal: AbortSignal.timeout(3000)
      });
      if (res.status === 404) return new Response("QR Not Found", { status: 404 });
      if (!res.ok) return new Response("Service Unavailable", { status: 503 });
      
      config = await res.json();
      config.scan_count = config.total_scans || 0;
      ctx.waitUntil(env.QR_CACHE.put(slug, JSON.stringify(config), { expirationTtl: 300 }));
    }

    // --- GATE ENGINE ---
    
    if (!config.is_active) return new Response("This QR code is inactive.", { status: 410 });

    if (config.expiry_date && new Date(config.expiry_date) < new Date()) {
      return new Response("This QR code has expired.", { status: 410 });
    }

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
    ctx.waitUntil(env.QR_CACHE.put(slug, JSON.stringify(config), { expirationTtl: 300 }));

    if (config.password_hash) {
      const sessionKey = `uniq:${slug}:${visitorHash}:pw_ok`;
      const isUnlocked = await env.QR_CACHE.get(sessionKey);
      
      if (!isUnlocked) {
        if (request.method === "POST") {
          const body = await request.formData();
          const submittedPw = body.get("password");
          const pwUint8 = new TextEncoder().encode(submittedPw);
          const pwBuffer = await crypto.subtle.digest('SHA-256', pwUint8);
          const pwArray = Array.from(new Uint8Array(pwBuffer));
          const submittedHash = pwArray.map(b => b.toString(16).padStart(2, '0')).join('');
          
          if (submittedHash === config.password_hash) {
            await env.QR_CACHE.put(sessionKey, "1", { expirationTtl: 86400 });
            return Response.redirect(request.url, 302);
          }
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
            </style>
          </head>
          <body>
            <div class="card">
              <h2>🔒 Protected</h2>
              <p>Enter the PIN to continue</p>
              <form method="POST">
                <input type="password" name="password" placeholder="Enter PIN" autofocus required>
                <button type="submit">Unlock →</button>
              </form>
            </div>
          </body>
          </html>
        `, { headers: { "Content-Type": "text/html" } });
      }
    }

    // --- ANALYTICS ---
    const visitorKey = `uniq:${slug}:${visitorHash}`;
    let isUnique = false;
    
    const existing = await env.QR_CACHE.get(visitorKey);
    if (!existing) {
      isUnique = true;
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
      ctx.waitUntil(
        fetch(`${apiUrl}/internal/scan`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": internalSecret
          },
          body: JSON.stringify(payload)
        }).catch(err => {})
      );
    }

    return Response.redirect(config.destination_url, 302);
  }
};
