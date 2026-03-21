import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import admin from 'firebase-admin';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, writeBatch, query, where, orderBy, limit, serverTimestamp, increment, documentId } from 'firebase/firestore';
import crypto from 'crypto';
import { customAlphabet } from 'nanoid';
import QRCode from 'qrcode';
import logger from "./logger.ts";
import fs from 'fs';

// Load Firebase config
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));

// Initialize Firebase Admin for Auth
admin.initializeApp({
  projectId: firebaseConfig.projectId,
});

// Initialize Firebase Client SDK for Firestore
const clientApp = initializeApp(firebaseConfig);
const db = getFirestore(clientApp, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors({ origin: process.env.APP_URL }));
  app.use(express.json());

  // Middlewares
  const authenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return res.status(401).send('Unauthorized');
      const token = authHeader.split('Bearer ')[1];
      const decoded = await admin.auth().verifyIdToken(token);
      (req as any).user = decoded;
      next();
    } catch (error) {
      logger.error('Auth error:', error);
      res.status(401).send('Unauthorized');
    }
  };

  const requireOwnership = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const { slug } = req.params;
      const user = (req as any).user;
      if (!user) return res.status(401).send('Unauthorized');

      const qrDoc = await getDoc(doc(db, 'qr_codes', slug));
      if (!qrDoc.exists()) return res.status(404).send('Not found');
      
      if (qrDoc.data().user_uid !== user.uid) {
        return res.status(403).send('Forbidden');
      }
      
      next();
    } catch (error) {
      logger.error('Ownership check error:', error);
      res.status(500).send('Internal Server Error');
    }
  };

  // API routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // User Plan API
  app.get('/api/user/plan', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return res.status(401).send('Unauthorized');
      const token = authHeader.split('Bearer ')[1];
      const decoded = await admin.auth().verifyIdToken(token);
      
      const uid = decoded.uid;
      
      // Get user's plan from Firestore (or default to free)
      const userDoc = await getDoc(doc(db, 'users', uid));
      const plan = userDoc.exists() ? userDoc.data()?.plan || 'free' : 'free';
      
      // Get number of active QR codes
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid), where('is_active', '==', true)));
        
      const activeQrs = qrSnapshot.size;
      
      const plans: Record<string, any> = {
        free: { qr_codes: 3, analytics_days: 7, custom_domain: false, logo: false },
        pro: { qr_codes: Infinity, analytics_days: 30, custom_domain: true, logo: true },
        team: { qr_codes: Infinity, analytics_days: 365, custom_domain: true, logo: true }
      };
      
      const limits = plans[plan] || plans.free;
      const remaining_qr = limits.qr_codes === Infinity ? Infinity : Math.max(0, limits.qr_codes - activeQrs);
      
      res.json({
        plan,
        limits,
        remaining_qr
      });
    } catch (error) {
      logger.error('Plan fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch plan' });
    }
  });

  // Billing Checkout API
  app.post('/api/billing/checkout', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return res.status(401).send('Unauthorized');
      const token = authHeader.split('Bearer ')[1];
      const decoded = await admin.auth().verifyIdToken(token);
      
      const { plan } = req.body;
      const uid = decoded.uid;
      
      const prices: Record<string, number> = {
        pro: 7,
        team: 29
      };
      
      if (!prices[plan]) {
        return res.status(400).json({ error: 'Invalid plan' });
      }

      const merchant_id = process.env.PAYHERE_MERCHANT_ID;
      const merchant_secret = process.env.PAYHERE_SECRET;
      
      if (!merchant_id || !merchant_secret) {
        logger.error('Missing PayHere credentials');
        return res.status(500).json({ error: 'Billing configuration error' });
      }
      const order_id = `ORDER_${uid}_${Date.now()}`;
      const amount = prices[plan].toFixed(2);
      const currency = 'USD';
      
      // Generate PayHere Hash
      // md5(merchant_id + order_id + amount + currency + md5(merchant_secret))
      const hashedSecret = crypto.createHash('md5').update(merchant_secret).digest('hex').toUpperCase();
      const hashString = `${merchant_id}${order_id}${amount}${currency}${hashedSecret}`;
      const hash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

      const checkoutData = {
        merchant_id,
        return_url: `${appUrl}/settings`,
        cancel_url: `${appUrl}/pricing`,
        notify_url: `${appUrl}/api/billing/notify`,
        order_id,
        items: `${plan.toUpperCase()} Plan Subscription`,
        currency,
        amount,
        first_name: decoded.name?.split(' ')[0] || 'User',
        last_name: decoded.name?.split(' ').slice(1).join(' ') || '',
        email: decoded.email || '',
        phone: '0000000000',
        address: 'N/A',
        city: 'N/A',
        country: 'Sri Lanka',
        hash,
        custom_1: uid,
        custom_2: plan,
        recurrence: '1 Month',
        duration: 'Forever'
      };

      res.json(checkoutData);
    } catch (error) {
      logger.error('Checkout error:', error);
      res.status(500).json({ error: 'Failed to generate checkout' });
    }
  });

  const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const generateSlug = customAlphabet(ALPHABET, 7);

  // PayHere Webhook
  app.post('/api/billing/notify', express.urlencoded({ extended: true }), async (req, res) => {
    try {
      const {
        merchant_id,
        order_id,
        payhere_amount,
        payhere_currency,
        status_code,
        md5sig,
        custom_1: uid,
        custom_2: plan
      } = req.body;

      const merchant_secret = process.env.PAYHERE_SECRET;
      if (!merchant_secret) return res.status(500).send('Config Missing');

      // Verify Signature
      const hashedSecret = crypto.createHash('md5').update(merchant_secret).digest('hex').toUpperCase();
      const hashString = `${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${hashedSecret}`;
      const localSig = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

      if (localSig !== md5sig) {
        logger.error('PayHere Signature Mismatch');
        return res.status(401).send('Invalid Signature');
      }

      if (status_code === '2') {
        // Success - Upgrade Plan
        await setDoc(doc(db, 'users', uid), { plan }, { merge: true });
        logger.info(`User ${uid} upgraded to ${plan}`);
      } else if (status_code === '0') {
        logger.info(`Payment pending for user ${uid}`);
      } else {
        logger.warn(`Payment failed for user ${uid} (Status ${status_code})`);
      }

      res.send('OK');
    } catch (error) {
      logger.error('Billing Notify Error:', error);
      res.status(500).send('Error');
    }
  });
  async function createUniqueSlug(): Promise<string> {
    let slug: string, exists: boolean, attempts = 0;
    do {
      slug = generateSlug();
      const docSnap = await getDoc(doc(db, "qr_codes", slug));
      exists = docSnap.exists();
      if (++attempts > 10) throw new Error("Slug gen failed");
    } while (exists);
    return slug;
  }

  // ── EXACT SCHEMA CREATION for qr_codes AND qr_stats ─────────
  app.post('/api/qr', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return res.status(401).send('Unauthorized');
      const token = authHeader.split('Bearer ')[1];
      const decoded = await admin.auth().verifyIdToken(token);
      
      const { destination_url, title, style, rate_limit, is_dynamic, qr_type, content_data, expiry_date, password } = req.body;
      const uid = decoded.uid;

      // Plan Limit Enforcement
      const userDoc = await getDoc(doc(db, 'users', uid));
      const plan = userDoc.exists() ? userDoc.data()?.plan || 'free' : 'free';
      const plans: Record<string, any> = {
        free: { qr_codes: 3 },
        pro: { qr_codes: Infinity },
        team: { qr_codes: Infinity }
      };
      const limits = plans[plan] || plans.free;

      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid), where('is_active', '==', true)));
      if (limits.qr_codes !== Infinity && qrSnapshot.size >= limits.qr_codes) {
        return res.status(403).json({ error: 'Plan limit reached. Upgrade to create more QRs.' });
      }

      const slug = await createUniqueSlug();
      
      const defaultStyle = { dot_color: '#000000', bg_color: '#ffffff' };
      const activeStyle = style || defaultStyle;

      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host;
      let qrContent = `${protocol}://${host}/${slug}`;
      if (is_dynamic === false) {
        if (qr_type === 'wifi') {
          qrContent = `WIFI:S:${content_data?.ssid || ''};T:${content_data?.encryption || 'WPA'};P:${content_data?.password || ''};;`;
        } else if (qr_type === 'vcard') {
          qrContent = `BEGIN:VCARD\nVERSION:3.0\nN:${content_data?.last_name || ''};${content_data?.first_name || ''}\nFN:${content_data?.first_name || ''} ${content_data?.last_name || ''}\nTEL:${content_data?.phone || ''}\nEMAIL:${content_data?.email || ''}\nORG:${content_data?.company || ''}\nURL:${content_data?.website || ''}\nEND:VCARD`;
        } else if (qr_type === 'email') {
          qrContent = `mailto:${content_data?.email || ''}?subject=${encodeURIComponent(content_data?.subject || '')}&body=${encodeURIComponent(content_data?.body || '')}`;
        } else if (qr_type === 'text') {
          qrContent = content_data?.text || '';
        } else {
          qrContent = destination_url;
        }
      }

      // Generate raw SVG
      const qrSvg = await QRCode.toString(qrContent, {
        type: 'svg',
        color: { dark: activeStyle.dot_color, light: activeStyle.bg_color },
        margin: 1
      });

      let passwordHash = null;
      if (password) {
        passwordHash = crypto.createHash('sha256').update(password + slug).digest('hex');
      }

      // EXACT SCHEMA for /qr_codes/{slug}
      const qrDoc = {
        slug,
        user_uid: decoded.uid,
        destination_url: destination_url || '',
        qr_type: qr_type || 'url',
        content_data: content_data || null,
        is_dynamic: is_dynamic !== false,
        title: title || 'My QR',
        is_active: true,
        qr_svg: qrSvg,
        style: activeStyle,
        rate_limit: rate_limit || { enabled: false, max_scans: 100, period: 'total' },
        expiry_date: expiry_date || null,
        password_hash: passwordHash,
        created_at: serverTimestamp()
      };

      // EXACT SCHEMA for /qr_stats/{slug} initialization
      const statsDoc = {
        total_scans: 0,
        unique_scans: 0,
        mobile_scans: 0,
        desktop_scans: 0,
        tablet_scans: 0,
        countries: {},
        days: {},
        hours: {},
        browsers: {},
        os: {},
        last_scan_at: null
      };

      const batch = writeBatch(db);
      batch.set(doc(db, 'qr_codes', slug), qrDoc);
      batch.set(doc(db, 'qr_stats', slug), statsDoc);
      await batch.commit();

      res.status(201).json(qrDoc);
    } catch (error) {
      logger.error('QR creation error:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  // List user's QR codes
  app.get('/api/qr', authenticate, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid), where('is_active', '==', true)));
      const qrs = qrSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(qrs);
    } catch (error) {
      logger.error('QR list error:', error);
      res.status(500).json({ error: 'Failed to list QR codes' });
    }
  });

  // Get single QR code
  app.get('/api/qr/:slug', authenticate, requireOwnership, async (req, res) => {
    try {
      const { slug } = req.params;
      const qrDoc = await getDoc(doc(db, 'qr_codes', slug));
      res.json(qrDoc.data());
    } catch (error) {
      logger.error('QR fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch QR code' });
    }
  });

  // Update QR code
  app.put('/api/qr/:slug', async (req, res, next) => {
    const internalSecret = req.headers['x-internal-secret'];
    if (internalSecret && internalSecret === process.env.INTERNAL_SECRET) {
      return next();
    }
    authenticate(req, res, next);
  }, async (req, res, next) => {
    const internalSecret = req.headers['x-internal-secret'];
    if (internalSecret && internalSecret === process.env.INTERNAL_SECRET) {
      return next();
    }
    requireOwnership(req, res, next);
  }, async (req, res) => {
    try {
      const { slug } = req.params;
      const { destination_url, title, style, is_active, options } = req.body;
      const updateData: any = {};
      
      if (destination_url !== undefined) updateData.destination_url = destination_url;
      if (title !== undefined) updateData.title = title;
      if (style !== undefined) updateData.style = style;
      if (is_active !== undefined) updateData.is_active = is_active;
      
      if (options) {
        if (options.expiry_date_enabled !== undefined) {
          updateData.expiry_date = options.expiry_date_enabled ? options.expiry_date : null;
        }
        if (options.scan_limit_enabled !== undefined) {
          updateData['rate_limit.enabled'] = options.scan_limit_enabled;
          updateData['rate_limit.max_scans'] = options.scan_limit;
        }
        if (options.password_protect !== undefined) {
          if (options.password_protect && options.password) {
            updateData.password_hash = crypto.createHash('sha256').update(options.password + slug).digest('hex');
          } else if (!options.password_protect) {
            updateData.password_hash = null;
          }
        }
      }
      
      await updateDoc(doc(db, 'qr_codes', slug), updateData);
      res.json({ success: true, slug });
    } catch (error) {
      logger.error('QR update error:', error);
      res.status(500).json({ error: 'Failed to update QR code' });
    }
  });

  // Delete QR code (soft delete)
  app.delete('/api/qr/:slug', authenticate, requireOwnership, async (req, res) => {
    try {
      const { slug } = req.params;
      // Soft delete by setting is_active to false
      await updateDoc(doc(db, 'qr_codes', slug), { is_active: false });
      res.json({ success: true, message: 'QR deleted' });
    } catch (error) {
      logger.error('QR delete error:', error);
      res.status(500).json({ error: 'Failed to delete QR code' });
    }
  });

  // Analytics API
  app.get('/api/analytics/:slug/summary', authenticate, requireOwnership, async (req, res) => {
    try {
      const { slug } = req.params;
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      
      if (!statsDoc.exists()) {
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
      logger.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/timeseries', authenticate, requireOwnership, async (req, res) => {
    try {
      const { slug } = req.params;
      const days = parseInt(req.query.days as string) || 30;
      
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      const dailyStats: Record<string, any> = {};
      
      // Initialize all days
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        dailyStats[dateStr] = { date: dateStr, total_scans: 0, unique_scans: 0, mobile_scans: 0 };
      }

      if (statsDoc.exists()) {
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
      logger.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/devices', authenticate, requireOwnership, async (req, res) => {
    try {
      const { slug } = req.params;
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      
      if (!statsDoc.exists()) return res.json([]);
      
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
      logger.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/countries', authenticate, requireOwnership, async (req, res) => {
    try {
      const { slug } = req.params;
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      
      if (!statsDoc.exists()) return res.json([]);
      
      const data = statsDoc.data()!;
      const countries = data.countries || {};
      
      const result = Object.entries(countries).map(([country, scans]) => ({
        country,
        scans: scans as number,
        unique_visitors: 0 // Not tracked per country in new schema
      })).sort((a, b) => b.scans - a.scans).slice(0, 10);

      res.json(result);
    } catch (error) {
      logger.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/os', authenticate, requireOwnership, async (req, res) => {
    try {
      const { slug } = req.params;
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      
      if (!statsDoc.exists()) return res.json([]);
      
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
      logger.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/browsers', authenticate, requireOwnership, async (req, res) => {
    try {
      const { slug } = req.params;
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      
      if (!statsDoc.exists()) return res.json([]);
      
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
      logger.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/referrers', authenticate, requireOwnership, async (req, res) => {
    try {
      const { slug } = req.params;
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      
      if (!statsDoc.exists()) return res.json([]);
      
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
      logger.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/recent', authenticate, requireOwnership, async (req, res) => {
    try {
      const { slug } = req.params;
      // For recent, we still query scan_events but limit it to 10
      const snapshot = await getDocs(query(collection(db, 'scan_events'), where('slug', '==', slug), orderBy('scanned_at', 'desc'), limit(10)));
      
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
      logger.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch recent scans' });
    }
  });

  app.get('/api/analytics/:slug/advanced', authenticate, requireOwnership, async (req, res) => {
    try {
      const { slug } = req.params;
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      
      if (!statsDoc.exists()) {
        return res.json({
          regions: [],
          isps: [],
          languages: [],
          hours: [],
          os_versions: [],
          tls_protocols: [],
          eu_scans: 0
        });
      }
      
      const data = statsDoc.data()!;
      
      const formatData = (obj: any = {}) => {
        let total = 0;
        Object.values(obj).forEach(v => total += (v as number));
        return Object.entries(obj).map(([name, count]) => ({
          name,
          count: count as number,
          pct: total > 0 ? (((count as number) / total) * 100).toFixed(1) : 0
        })).sort((a, b) => b.count - a.count).slice(0, 10);
      };

      res.json({
        regions: formatData(data.regions),
        isps: formatData(data.isps),
        languages: formatData(data.languages),
        hours: formatData(data.hours),
        os_versions: formatData(data.os_versions),
        tls_protocols: formatData(data.tls_protocols),
        eu_scans: data.eu_scans || 0
      });
    } catch (error) {
      logger.error('Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch advanced analytics' });
    }
  });

  app.get('/api/analytics/account/:uid', authenticate, async (req, res) => {
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      
      if (decodedUser.uid !== uid) {
        return res.status(403).send('Forbidden');
      }
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
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
        const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
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
      logger.error('Account analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch account analytics' });
    }
  });

  app.get('/api/analytics/account/:uid/timeseries', authenticate, async (req, res) => {
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      
      if (decodedUser.uid !== uid) {
        return res.status(403).send('Forbidden');
      }
      const days = parseInt(req.query.days as string) || 30;

      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
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
          const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
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
      logger.error('Account timeseries error:', error);
      res.status(500).json({ error: 'Failed to fetch account timeseries' });
    }
  });

  app.get('/api/analytics/account/:uid/devices', authenticate, async (req, res) => {
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      
      if (decodedUser.uid !== uid) {
        return res.status(403).send('Forbidden');
      }
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      const slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      let mobile = 0, desktop = 0, tablet = 0;
      
      if (slugs.length > 0) {
        const chunks = [];
        for (let i = 0; i < slugs.length; i += 30) {
          chunks.push(slugs.slice(i, i + 30));
        }

        for (const chunk of chunks) {
          const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
          statsSnapshot.forEach(doc => {
            const data = doc.data();
            mobile += (data.mobile_scans || 0);
            desktop += (data.desktop_scans || 0);
            tablet += (data.tablet_scans || 0);
          });
        }
      }

      const total = mobile + desktop + tablet;

      const result = [
        { device_type: 'mobile', count: mobile, pct: total > 0 ? ((mobile / total) * 100).toFixed(1) : 0 },
        { device_type: 'desktop', count: desktop, pct: total > 0 ? ((desktop / total) * 100).toFixed(1) : 0 },
        { device_type: 'tablet', count: tablet, pct: total > 0 ? ((tablet / total) * 100).toFixed(1) : 0 }
      ].filter(d => d.count > 0).sort((a, b) => b.count - a.count);

      res.json(result);
    } catch (error) {
      logger.error('Account devices error:', error);
      res.status(500).json({ error: 'Failed to fetch account devices' });
    }
  });

  app.get('/api/analytics/account/:uid/countries', authenticate, async (req, res) => {
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      
      if (decodedUser.uid !== uid) {
        return res.status(403).send('Forbidden');
      }
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      const slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      const countries: Record<string, number> = {};
      
      if (slugs.length > 0) {
        const chunks = [];
        for (let i = 0; i < slugs.length; i += 30) {
          chunks.push(slugs.slice(i, i + 30));
        }

        for (const chunk of chunks) {
          const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
          statsSnapshot.forEach(doc => {
            const data = doc.data();
            const c = data.countries || {};
            for (const [country, count] of Object.entries(c)) {
              countries[country] = (countries[country] || 0) + (count as number);
            }
          });
        }
      }

      const result = Object.entries(countries).map(([country, scans]) => ({
        country,
        scans,
        unique_visitors: 0
      })).sort((a, b) => b.scans - a.scans).slice(0, 10);

      res.json(result);
    } catch (error) {
      logger.error('Account countries error:', error);
      res.status(500).json({ error: 'Failed to fetch account countries' });
    }
  });

  app.get('/api/analytics/account/:uid/recent', authenticate, async (req, res) => {
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      
      if (decodedUser.uid !== uid) {
        return res.status(403).send('Forbidden');
      }
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      const slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (slugs.length === 0) return res.json([]);
      
      const recentScans: any[] = [];
      
      const chunks = [];
      for (let i = 0; i < slugs.length; i += 30) {
        chunks.push(slugs.slice(i, i + 30));
      }

      for (const chunk of chunks) {
        const scansSnapshot = await getDocs(query(collection(db, 'scan_events'), where('slug', 'in', chunk), orderBy('scanned_at', 'desc'), limit(20)));
        scansSnapshot.forEach(doc => {
          const data = doc.data();
          recentScans.push({
            id: doc.id,
            slug: data.slug,
            scanned_at: data.scanned_at?.toDate()?.toISOString(),
            country: data.country || 'Unknown',
            city: data.city || 'Unknown',
            device_type: data.device || 'Unknown',
            os: data.os || 'Unknown',
            browser: data.browser || 'Unknown',
            referrer: data.referer || 'Direct',
            is_unique: data.is_unique,
            _timestamp: data.scanned_at?.toMillis ? data.scanned_at.toMillis() : 0
          });
        });
      }

      recentScans.sort((a, b) => b._timestamp - a._timestamp);

      res.json(recentScans.slice(0, 20).map(s => {
        const { _timestamp, ...rest } = s;
        return rest;
      }));
    } catch (error) {
      logger.error('Account recent scans error:', error);
      res.status(500).json({ error: 'Failed to fetch account recent scans' });
    }
  });

  app.get('/api/analytics/account/:uid/performance', authenticate, async (req, res) => {
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      
      if (decodedUser.uid !== uid) {
        return res.status(403).send('Forbidden');
      }
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      
      const performanceData = [];
      
      for (const docSnap of qrSnapshot.docs) {
        const qrData = docSnap.data();
        const statsDoc = await getDoc(doc(db, 'qr_stats', qrData.slug));
        const statsData = statsDoc.exists() ? statsDoc.data() : { total_scans: 0, unique_scans: 0 };
        
        performanceData.push({
          id: docSnap.id,
          slug: qrData.slug,
          title: qrData.title,
          total_scans: statsData.total_scans || 0,
          unique_scans: statsData.unique_scans || 0
        });
      }
      
      performanceData.sort((a, b) => b.total_scans - a.total_scans);
      
      res.json(performanceData);
    } catch (error) {
      logger.error('Account performance error:', error);
      res.status(500).json({ error: 'Failed to fetch account performance' });
    }
  });

  // Internal endpoint for Cloudflare Worker to send rich CF payload
  app.post('/internal/scan', async (req, res) => {
    try {
      const secret = req.headers['x-internal-secret'];
      if (!secret || secret !== process.env.INTERNAL_SECRET) {
        return res.status(401).send('Unauthorized');
      }
      await captureAnalyticsFromPayload(req.body);
      res.send('OK');
    } catch (error) {
      logger.error('Internal scan error:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });
  // Internal endpoint for Worker KV-miss fallback
  app.get('/internal/slug/:slug', async (req, res) => {
    try {
      const secret = req.headers['x-internal-secret'];
      if (!secret || secret !== process.env.INTERNAL_SECRET) {
        return res.status(401).send('Unauthorized');
      }

      const { slug } = req.params;
      const [qrDoc, statsDoc] = await Promise.all([
        getDoc(doc(db, 'qr_codes', slug)),
        getDoc(doc(db, 'qr_stats', slug))
      ]);

      if (!qrDoc.exists()) {
        return res.status(404).send('Not Found');
      }

      const qr = qrDoc.data();
      const stats = statsDoc.exists() ? statsDoc.data() : { total_scans: 0 };

      // Return compact gate config for Worker
      res.json({
        destination_url: qr.destination_url,
        is_active: qr.is_active,
        expiry_date: qr.expiry_date || null,
        password_hash: qr.password_hash || null,
        scan_limit: qr.rate_limit?.enabled ? qr.rate_limit.max_scans : null,
        total_scans: stats.total_scans || 0
      });
    } catch (error) {
      logger.error('Internal fetch error:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  // Redirect Engine (Local Dev fallback)
  app.get('/:slug', async (req, res, next) => {
    const { slug } = req.params;
    
    // Ignore static assets and API routes
    if (slug.startsWith('api') || slug.startsWith('assets') || slug.includes('.')) {
      return next();
    }

    try {
      // 1. Look up destination
      const qrDoc = await getDoc(doc(db, 'qr_codes', slug));
      
      if (!qrDoc.exists()) {
        return next(); // Let Vite handle it (might be a frontend route)
      }

      const qrData = qrDoc.data()!;

      if (!qrData.is_active) {
        return res.status(410).send('QR code inactive');
      }

      // 2. Fire analytics async (don't block redirect)
      captureAnalytics(req, slug).catch(err => logger.error('Analytics capture failed', { error: err }));

      // 3. Handle different QR types
      if (qrData.qr_type === 'vcard') {
        const content = qrData.content_data;
        const vcard = `BEGIN:VCARD\nVERSION:3.0\nN:${content?.last_name || ''};${content?.first_name || ''}\nFN:${content?.first_name || ''} ${content?.last_name || ''}\nTEL:${content?.phone || ''}\nEMAIL:${content?.email || ''}\nORG:${content?.company || ''}\nURL:${content?.website || ''}\nEND:VCARD`;
        res.setHeader('Content-Type', 'text/vcard');
        res.setHeader('Content-Disposition', `attachment; filename="${content?.first_name || 'contact'}.vcf"`);
        return res.send(vcard);
      } else if (qrData.qr_type === 'text') {
        const text = qrData.content_data?.text || '';
        return res.send(`<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family: sans-serif; padding: 20px; white-space: pre-wrap; word-break: break-word;">${text}</body></html>`);
      } else if (qrData.qr_type === 'email') {
        const content = qrData.content_data;
        const mailto = `mailto:${content?.email || ''}?subject=${encodeURIComponent(content?.subject || '')}&body=${encodeURIComponent(content?.body || '')}`;
        return res.redirect(302, mailto);
      } else if (qrData.qr_type === 'wifi') {
        // WiFi should ideally be static, but if dynamic, just show the details
        const content = qrData.content_data;
        return res.send(`<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family: sans-serif; padding: 20px;"><h2>WiFi Network</h2><p><strong>SSID:</strong> ${content?.ssid}</p><p><strong>Password:</strong> ${content?.password}</p><p><strong>Security:</strong> ${content?.encryption}</p></body></html>`);
      }

      const destination = qrData.destination_url;
      if (!destination) {
        return res.status(404).send('Destination not found');
      }

      // Redirect immediately
      return res.redirect(302, destination);
    } catch (error) {
      logger.error('Redirect error', { error });
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
    logger.info(`Server running on port ${PORT}`);
  });
}

// Analytics Capture Logic
async function captureAnalyticsFromPayload(payload: any) {
  const { slug, ip, ua, country, asn, colo, tls, lang, is_eu, is_unique: payloadIsUnique } = payload;
  if (isBot(ua)) return;

  const today = new Date().toISOString().slice(0, 10);
  const fingerprint = `${ip}:${ua.slice(0, 100)}:${today}:${process.env.HASH_SALT || ''}`;
  const visitorHash = crypto.createHash('sha256').update(fingerprint).digest('hex');

  let isUnique = payloadIsUnique;
  if (isUnique === undefined) {
    const snapshot = await getDocs(query(collection(db, 'scan_events'), where('slug', '==', slug), where('visitor_hash', '==', visitorHash)));
    isUnique = snapshot.empty;
  }

  const parsed = parseUA(ua);
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const hourStr = now.getHours().toString();

  // 1. EXACT SCHEMA for scan_events per user prompt (plus CF extensions)
  await addDoc(collection(db, 'scan_events'), {
    slug,
    date: dateStr,
    country: country || 'Unknown',
    device: parsed.device,
    is_unique: isUnique,
    scanned_at: serverTimestamp(),
    
    // Kept behind the scenes for uniqueness check / CF data
    visitor_hash: visitorHash,
    asn: asn || null,
    colo: colo || null,
    lang: lang || null,
    tls: tls || null,
    is_eu: is_eu || false
  });

  // 2. EXACT SCHEMA for qr_stats per user prompt (plus CF atomic increments)
  const statsRef = doc(db, 'qr_stats', slug);
  const inc = increment(1);
  
  const updateData: any = {
    total_scans: inc,
    [`${parsed.device}_scans`]: inc,
    [`countries.${country || 'Unknown'}`]: inc,
    [`days.${dateStr}`]: inc,
    [`hours.${hourStr}`]: inc,
    [`browsers.${parsed.browser}`]: inc,
    [`os.${parsed.os}`]: inc,
    last_scan_at: serverTimestamp()
  };

  // Extra Cloudflare enrichments 
  if (asn) updateData[`isps.AS${asn}`] = inc;
  if (colo) updateData[`regions.${colo}`] = inc;
  if (lang) updateData[`languages.${lang.substring(0, 2)}`] = inc;
  if (parsed.osVersion) updateData[`os_versions.${parsed.os} ${parsed.osVersion}`] = inc;
  if (tls) updateData[`tls_protocols.${tls}`] = inc;
  if (is_eu) updateData[`eu_scans`] = inc;

  if (isUnique) {
    updateData.unique_scans = inc;
  }

  await setDoc(statsRef, updateData, { merge: true });
}

async function captureAnalytics(req: express.Request, slug: string) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';
  const country = (req.headers['cf-ipcountry'] as string) || 'US';

  const payload = {
    slug, ip, ua, country,
    referer: req.headers.referer || '',
    lang: req.headers['accept-language'] || '',
    asn: null, colo: null, tls: null, is_eu: false
  };

  await captureAnalyticsFromPayload(payload);
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
