import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import admin from 'firebase-admin';
import crypto from 'crypto';

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Analytics API
  app.get('/api/analytics/:slug/summary', async (req, res) => {
    try {
      const { slug } = req.params;
      const statsDoc = await db.collection('qr_stats').doc(slug).get();
      
      if (!statsDoc.exists) {
        return res.json({
          total_scans: 0,
          unique_visitors: 0,
          mobile_pct: 0,
          first_scan: null,
          last_scan: null
        });
      }

      const data = statsDoc.data()!;
      const total_scans = data.total_scans || 0;
      const unique_visitors = data.unique_scans || 0;
      const mobile_scans = data.mobile_scans || 0;
      const mobile_pct = total_scans > 0 ? ((mobile_scans / total_scans) * 100).toFixed(1) : 0;
      
      const last_scan = data.last_scan_at?.toDate() || null;

      res.json({
        total_scans,
        unique_visitors,
        mobile_pct,
        first_scan: null,
        last_scan
      });
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/timeseries', async (req, res) => {
    try {
      const { slug } = req.params;
      const days = parseInt(req.query.days as string) || 30;
      
      const statsDoc = await db.collection('qr_stats').doc(slug).get();
      const dailyStats: Record<string, any> = {};
      
      // Initialize all days
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        dailyStats[dateStr] = { date: dateStr, total_scans: 0, unique_scans: 0, mobile_scans: 0 };
      }

      if (statsDoc.exists) {
        const data = statsDoc.data()!;
        const daysData = data.days || {};
        
        for (const [dateStr, count] of Object.entries(daysData)) {
          if (dailyStats[dateStr]) {
            dailyStats[dateStr].total_scans = count;
          }
        }
      }

      res.json(Object.values(dailyStats));
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/devices', async (req, res) => {
    try {
      const { slug } = req.params;
      const statsDoc = await db.collection('qr_stats').doc(slug).get();
      
      if (!statsDoc.exists) return res.json([]);
      
      const data = statsDoc.data()!;
      const devices = {
        mobile: data.mobile_scans || 0,
        desktop: data.desktop_scans || 0,
        tablet: data.tablet_scans || 0
      };
      
      const total = devices.mobile + devices.desktop + devices.tablet;

      const result = Object.entries(devices)
        .filter(([_, count]) => count > 0)
        .map(([device_type, count]) => ({
          device_type,
          count,
          pct: total > 0 ? ((count / total) * 100).toFixed(1) : 0
        })).sort((a, b) => b.count - a.count);

      res.json(result);
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/countries', async (req, res) => {
    try {
      const { slug } = req.params;
      const statsDoc = await db.collection('qr_stats').doc(slug).get();
      
      if (!statsDoc.exists) return res.json([]);
      
      const data = statsDoc.data()!;
      const countries = data.countries || {};
      
      const result = Object.entries(countries).map(([country, scans]) => ({
        country,
        scans: scans as number,
        unique_visitors: 0 // Not tracked per country in new schema
      })).sort((a, b) => b.scans - a.scans).slice(0, 10);

      res.json(result);
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/os', async (req, res) => {
    try {
      const { slug } = req.params;
      const statsDoc = await db.collection('qr_stats').doc(slug).get();
      
      if (!statsDoc.exists) return res.json([]);
      
      const data = statsDoc.data()!;
      const osData = data.os || {};
      let total = 0;
      Object.values(osData).forEach(v => total += (v as number));

      const result = Object.entries(osData).map(([os, count]) => ({
        os,
        count: count as number,
        pct: total > 0 ? (((count as number) / total) * 100).toFixed(1) : 0
      })).sort((a, b) => b.count - a.count);

      res.json(result);
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/browsers', async (req, res) => {
    try {
      const { slug } = req.params;
      const statsDoc = await db.collection('qr_stats').doc(slug).get();
      
      if (!statsDoc.exists) return res.json([]);
      
      const data = statsDoc.data()!;
      const browsersData = data.browsers || {};
      let total = 0;
      Object.values(browsersData).forEach(v => total += (v as number));

      const result = Object.entries(browsersData).map(([browser, count]) => ({
        browser,
        count: count as number,
        pct: total > 0 ? (((count as number) / total) * 100).toFixed(1) : 0
      })).sort((a, b) => b.count - a.count);

      res.json(result);
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/referrers', async (req, res) => {
    try {
      const { slug } = req.params;
      const statsDoc = await db.collection('qr_stats').doc(slug).get();
      
      if (!statsDoc.exists) return res.json([]);
      
      const data = statsDoc.data()!;
      const referrersData = data.referrers || {};
      let total = 0;
      Object.values(referrersData).forEach(v => total += (v as number));

      const result = Object.entries(referrersData).map(([referrer, count]) => ({
        referrer: referrer.replace(/_/g, '.'), // Restore dots
        count: count as number,
        pct: total > 0 ? (((count as number) / total) * 100).toFixed(1) : 0
      })).sort((a, b) => b.count - a.count).slice(0, 10);

      res.json(result);
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/recent', async (req, res) => {
    try {
      const { slug } = req.params;
      // For recent, we still query scan_events but limit it to 10
      const snapshot = await db.collection('scan_events')
        .where('slug', '==', slug)
        .orderBy('scanned_at', 'desc')
        .limit(10)
        .get();
      
      const recent = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          scanned_at: data.scanned_at?.toDate()?.toISOString(),
          country: data.country || 'Unknown',
          city: data.city || 'Unknown',
          device_type: data.device || 'Unknown',
          os: data.os || 'Unknown',
          browser: data.browser || 'Unknown',
          referrer: data.referer || 'Direct',
          is_unique: data.is_unique
        };
      });

      res.json(recent);
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch recent scans' });
    }
  });

  app.get('/api/analytics/account/:uid', async (req, res) => {
    try {
      const { uid } = req.params;
      const qrSnapshot = await db.collection('qr_codes').where('user_uid', '==', uid).get();
      const slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (slugs.length === 0) {
        return res.json({ total_scans: 0, unique_visitors: 0, total_qrs: 0, active_qrs: 0 });
      }

      let total_scans = 0;
      let unique_visitors = 0;
      
      const chunks = [];
      for (let i = 0; i < slugs.length; i += 30) {
        chunks.push(slugs.slice(i, i + 30));
      }

      for (const chunk of chunks) {
        const statsSnapshot = await db.collection('qr_stats').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
        statsSnapshot.forEach(doc => {
          const data = doc.data();
          total_scans += (data.total_scans || 0);
          unique_visitors += (data.unique_scans || 0);
        });
      }

      const active_qrs = qrSnapshot.docs.filter(doc => doc.data().is_active).length;

      res.json({
        total_scans,
        unique_visitors,
        total_qrs: slugs.length,
        active_qrs
      });
    } catch (error) {
      console.error('Account analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch account analytics' });
    }
  });

  app.get('/api/analytics/account/:uid/timeseries', async (req, res) => {
    try {
      const { uid } = req.params;
      const days = parseInt(req.query.days as string) || 30;

      const qrSnapshot = await db.collection('qr_codes').where('user_uid', '==', uid).get();
      const slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      const dailyStats: Record<string, any> = {};
      
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        dailyStats[dateStr] = { date: dateStr, total_scans: 0, unique_scans: 0 };
      }

      if (slugs.length > 0) {
        const chunks = [];
        for (let i = 0; i < slugs.length; i += 30) {
          chunks.push(slugs.slice(i, i + 30));
        }

        for (const chunk of chunks) {
          const statsSnapshot = await db.collection('qr_stats').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
          statsSnapshot.forEach(doc => {
            const data = doc.data();
            const daysData = data.days || {};
            for (const [dateStr, count] of Object.entries(daysData)) {
              if (dailyStats[dateStr]) {
                dailyStats[dateStr].total_scans += (count as number);
              }
            }
          });
        }
      }

      res.json(Object.values(dailyStats));
    } catch (error) {
      console.error('Account timeseries error:', error);
      res.status(500).json({ error: 'Failed to fetch account timeseries' });
    }
  });

  // Redirect Engine
  app.get('/:slug', async (req, res, next) => {
    const { slug } = req.params;
    
    // Ignore static assets and API routes
    if (slug.startsWith('api') || slug.startsWith('assets') || slug.includes('.')) {
      return next();
    }

    try {
      // 1. Look up destination
      const qrDoc = await db.collection('qr_codes').doc(slug).get();
      
      if (!qrDoc.exists) {
        return next(); // Let Vite handle it (might be a frontend route)
      }

      const qrData = qrDoc.data()!;

      if (!qrData.is_active) {
        return res.status(410).send('QR code inactive');
      }

      const destination = qrData.destination_url;

      // 2. Fire analytics async (don't block redirect)
      captureAnalytics(req, slug).catch(err => console.error('Analytics capture failed:', err));

      // 3. Redirect immediately
      return res.redirect(302, destination);
    } catch (error) {
      console.error('Redirect error:', error);
      next();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Analytics Capture Logic
async function captureAnalytics(req: express.Request, slug: string) {
  const ua = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  
  if (isBot(ua)) return;

  const today = new Date().toISOString().slice(0, 10);
  const fingerprint = `${ip}:${ua.slice(0, 100)}:${today}`;
  const visitorHash = crypto.createHash('sha256').update(fingerprint).digest('hex');

  // Check uniqueness (in a real app, use Redis/KV. Here we query Firestore for simplicity)
  const snapshot = await db.collection('scan_events')
    .where('slug', '==', slug)
    .where('visitor_hash', '==', visitorHash)
    .get();
  const isUnique = snapshot.empty;

  const parsed = parseUA(ua);
  const referer = req.headers.referer || '';
  
  let refererHost = 'Direct';
  if (referer) {
    try {
      refererHost = new URL(referer).hostname;
    } catch (e) {
      refererHost = 'Unknown';
    }
  }

  // Mock country for demo purposes if not available in headers
  const country = (req.headers['cf-ipcountry'] as string) || 'US';
  
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const hourStr = now.getHours().toString();

  // 1. Write to scan_events
  await db.collection('scan_events').add({
    slug,
    date: dateStr,
    country,
    device: parsed.device,
    browser: parsed.browser,
    os: parsed.os,
    referer: refererHost,
    is_unique: isUnique,
    scanned_at: admin.firestore.FieldValue.serverTimestamp(),
    visitor_hash: visitorHash, // Keep this for uniqueness check
  });

  // 2. Update qr_stats/{slug}
  const statsRef = db.collection('qr_stats').doc(slug);
  const increment = admin.firestore.FieldValue.increment(1);
  
  const updateData: any = {
    total_scans: increment,
    [`${parsed.device}_scans`]: increment,
    [`countries.${country}`]: increment,
    [`days.${dateStr}`]: increment,
    [`hours.${hourStr}`]: increment,
    [`browsers.${parsed.browser}`]: increment,
    [`os.${parsed.os}`]: increment,
    [`referrers.${refererHost.replace(/\./g, '_')}`]: increment,
    last_scan_at: admin.firestore.FieldValue.serverTimestamp()
  };

  if (isUnique) {
    updateData.unique_scans = increment;
  }

  await statsRef.set(updateData, { merge: true });
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

function classifyReferer(referer: string) {
  if (!referer) return 'direct';
  if (/android-app:|ios-app:/.test(referer)) return 'app';
  return 'browser';
}

startServer();
