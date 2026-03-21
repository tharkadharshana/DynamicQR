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
      const snapshot = await db.collection('scan_events').where('slug', '==', slug).get();
      
      let total_scans = 0;
      let unique_visitors = 0;
      let mobile_scans = 0;
      let first_scan = null;
      let last_scan = null;

      snapshot.forEach(doc => {
        const data = doc.data();
        total_scans++;
        if (data.is_unique) unique_visitors++;
        if (data.device_type === 'mobile') mobile_scans++;
        
        const scanTime = data.scanned_at?.toDate() || new Date();
        if (!first_scan || scanTime < first_scan) first_scan = scanTime;
        if (!last_scan || scanTime > last_scan) last_scan = scanTime;
      });

      const mobile_pct = total_scans > 0 ? (mobile_scans / total_scans * 100).toFixed(1) : 0;

      res.json({
        total_scans,
        unique_visitors,
        mobile_pct,
        first_scan,
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
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const snapshot = await db.collection('scan_events').where('slug', '==', slug).get();
      
      const dailyStats: Record<string, any> = {};
      
      // Initialize all days
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        dailyStats[dateStr] = { date: dateStr, total_scans: 0, unique_scans: 0, mobile_scans: 0 };
      }

      snapshot.forEach(doc => {
        const data = doc.data();
        const scanTime = data.scanned_at?.toDate();
        if (!scanTime || scanTime < cutoff) return;
        
        const dateStr = scanTime.toISOString().split('T')[0];
        if (dailyStats[dateStr]) {
          dailyStats[dateStr].total_scans++;
          if (data.is_unique) dailyStats[dateStr].unique_scans++;
          if (data.device_type === 'mobile') dailyStats[dateStr].mobile_scans++;
        }
      });

      res.json(Object.values(dailyStats));
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/devices', async (req, res) => {
    try {
      const { slug } = req.params;
      const snapshot = await db.collection('scan_events').where('slug', '==', slug).get();
      
      const devices: Record<string, number> = {};
      let total = 0;

      snapshot.forEach(doc => {
        const data = doc.data();
        const device = data.device_type || 'unknown';
        devices[device] = (devices[device] || 0) + 1;
        total++;
      });

      const result = Object.entries(devices).map(([device_type, count]) => ({
        device_type,
        count,
        pct: total > 0 ? (count / total * 100).toFixed(1) : 0
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
      const snapshot = await db.collection('scan_events').where('slug', '==', slug).get();
      
      const countries: Record<string, { scans: number, unique_visitors: number }> = {};

      snapshot.forEach(doc => {
        const data = doc.data();
        const country = data.country || 'Unknown';
        if (!countries[country]) countries[country] = { scans: 0, unique_visitors: 0 };
        countries[country].scans++;
        if (data.is_unique) countries[country].unique_visitors++;
      });

      const result = Object.entries(countries).map(([country, stats]) => ({
        country,
        ...stats
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
      const snapshot = await db.collection('scan_events').where('slug', '==', slug).get();
      
      const osStats: Record<string, number> = {};
      let total = 0;

      snapshot.forEach(doc => {
        const data = doc.data();
        const os = data.os || 'Unknown';
        osStats[os] = (osStats[os] || 0) + 1;
        total++;
      });

      const result = Object.entries(osStats).map(([os, count]) => ({
        os,
        count,
        pct: total > 0 ? (count / total * 100).toFixed(1) : 0
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
      const snapshot = await db.collection('scan_events').where('slug', '==', slug).get();
      
      const browserStats: Record<string, number> = {};
      let total = 0;

      snapshot.forEach(doc => {
        const data = doc.data();
        const browser = data.browser || 'Unknown';
        browserStats[browser] = (browserStats[browser] || 0) + 1;
        total++;
      });

      const result = Object.entries(browserStats).map(([browser, count]) => ({
        browser,
        count,
        pct: total > 0 ? (count / total * 100).toFixed(1) : 0
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
      const snapshot = await db.collection('scan_events').where('slug', '==', slug).get();
      
      const referrerStats: Record<string, number> = {};
      let total = 0;

      snapshot.forEach(doc => {
        const data = doc.data();
        let referrer = data.referrer || 'Direct';
        if (referrer !== 'Direct') {
          try {
            const url = new URL(referrer);
            referrer = url.hostname;
          } catch (e) {
            // keep as is if invalid URL
          }
        }
        referrerStats[referrer] = (referrerStats[referrer] || 0) + 1;
        total++;
      });

      const result = Object.entries(referrerStats).map(([referrer, count]) => ({
        referrer,
        count,
        pct: total > 0 ? (count / total * 100).toFixed(1) : 0
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
      const snapshot = await db.collection('scan_events').where('slug', '==', slug).get();
      
      const allScans = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          scanned_at: data.scanned_at?.toDate(),
          country: data.country || 'Unknown',
          city: data.city || 'Unknown',
          device_type: data.device_type || 'Unknown',
          os: data.os || 'Unknown',
          browser: data.browser || 'Unknown',
          referrer: data.referrer || 'Direct',
          is_unique: data.is_unique
        };
      });

      // Sort in memory to avoid needing a composite index in Firestore
      allScans.sort((a, b) => {
        if (!a.scanned_at) return 1;
        if (!b.scanned_at) return -1;
        return b.scanned_at.getTime() - a.scanned_at.getTime();
      });

      const recent = allScans.slice(0, 10).map(scan => ({
        ...scan,
        scanned_at: scan.scanned_at?.toISOString()
      }));

      res.json(recent);
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch recent scans' });
    }
  });

  app.get('/api/analytics/account/:uid', async (req, res) => {
    try {
      const { uid } = req.params;
      // Get all QR codes for this user
      const qrSnapshot = await db.collection('qr_codes').where('user_uid', '==', uid).get();
      const slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (slugs.length === 0) {
        return res.json({ total_scans: 0, unique_visitors: 0, total_qrs: 0, active_qrs: 0 });
      }

      // Firestore 'in' query supports up to 30 items. If a user has more, we'd need to batch.
      // For simplicity in this demo, we'll chunk them.
      let total_scans = 0;
      let unique_visitors = 0;
      
      // Chunk slugs into arrays of 30
      const chunks = [];
      for (let i = 0; i < slugs.length; i += 30) {
        chunks.push(slugs.slice(i, i + 30));
      }

      for (const chunk of chunks) {
        const scanSnapshot = await db.collection('scan_events').where('slug', 'in', chunk).get();
        total_scans += scanSnapshot.size;
        scanSnapshot.forEach(doc => {
          if (doc.data().is_unique) unique_visitors++;
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
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const qrSnapshot = await db.collection('qr_codes').where('user_uid', '==', uid).get();
      const slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      const dailyStats: Record<string, any> = {};
      
      // Initialize all days
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
          const scanSnapshot = await db.collection('scan_events').where('slug', 'in', chunk).get();
          scanSnapshot.forEach(doc => {
            const data = doc.data();
            const scanTime = data.scanned_at?.toDate();
            if (!scanTime || scanTime < cutoff) return;
            
            const dateStr = scanTime.toISOString().split('T')[0];
            if (dailyStats[dateStr]) {
              dailyStats[dateStr].total_scans++;
              if (data.is_unique) dailyStats[dateStr].unique_scans++;
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

  // Mock country for demo purposes if not available in headers
  const country = req.headers['cf-ipcountry'] || 'US';

  await db.collection('scan_events').add({
    slug,
    scanned_at: admin.firestore.FieldValue.serverTimestamp(),
    country,
    region: null,
    city: null,
    timezone: null,
    device_type: parsed.device,
    os: parsed.os,
    os_version: parsed.osVersion,
    browser: parsed.browser,
    visitor_hash: visitorHash,
    is_unique: isUnique,
    is_bot: false,
    referer_type: classifyReferer(referer)
  });
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
