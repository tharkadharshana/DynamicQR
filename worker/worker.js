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

    // 2. Check KV cache for destination
    const cacheKey = `qr:${slug}`;
    let destinationData = await env.QR_CACHE.get(cacheKey, "json");

    if (!destinationData) {
      const apiUrl = env.API_URL;
      if (!apiUrl) return new Response("Configuration Error", { status: 500 });
      const res = await fetch(`${apiUrl}/internal/slug/${slug}`, {
        headers: { 'Authorization': `Bearer ${env.INTERNAL_SECRET}` }
      });
      
      if (!res.ok) {
        return new Response("QR Code not found or inactive", { status: 404 });
      }
      destinationData = await res.json();
      
      // Store in KV for 5 minutes
      if (destinationData.is_active) {
        ctx.waitUntil(env.QR_CACHE.put(cacheKey, JSON.stringify(destinationData), { expirationTtl: 300 }));
      } else {
        return new Response("QR code inactive", { status: 410 });
      }
    }

    const destinationUrl = destinationData.destination_url;

    // 3. Extract rich Cloudflare properties & Headers
    const cf = request.cf || {};
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ua = request.headers.get('User-Agent') || '';
    const today = new Date().toISOString().slice(0, 10);
    
    // Compute visitor hash for uniqueness
    const fingerprint = `${ip}:${ua.slice(0, 100)}:${today}:${env.HASH_SALT || ''}`;
    const msgUint8 = new TextEncoder().encode(fingerprint);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const visitorHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
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

    // 4. Send Analytics async
    const apiUrl = env.API_URL;
    if (apiUrl) {
      ctx.waitUntil(
        fetch(`${apiUrl}/internal/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.INTERNAL_SECRET}`
        },
        body: JSON.stringify(payload)
      }).catch(err => console.error("Worker analytics send failed:", err))
      );
    }

    // 5. Instantly redirect the user
    return Response.redirect(destinationUrl, 302);
  }
};
