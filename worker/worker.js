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
      // Fallback to origin API to fetch it
      const apiUrl = env.API_URL || "https://dynamicqr.dev"; // Change to your Cloud Run URL
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
    const payload = {
      slug,
      ip: request.headers.get('CF-Connecting-IP') || '',
      ua: request.headers.get('User-Agent') || '',
      referer: request.headers.get('Referer') || '',
      lang: request.headers.get('Accept-Language') || '',
      country: cf.country || 'Unknown',
      asn: cf.asn || null,
      colo: cf.colo || 'Unknown',
      tls: cf.tlsVersion || 'Unknown',
      is_eu: cf.isEUCountry || false
    };

    // 4. Send Analytics async
    const apiUrl = env.API_URL || "https://dynamicqr.dev";
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

    // 5. Instantly redirect the user
    return Response.redirect(destinationUrl, 302);
  }
};
