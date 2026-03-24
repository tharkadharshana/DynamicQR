import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import admin from 'firebase-admin';
import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { customAlphabet } from 'nanoid';
import QRCode from 'qrcode';
import logger from "./logger.ts";
import fs from 'fs';
import { PLANS, ADDONS, getPlan, getAddon, computeEffectiveLimits, isUnlimited, type PlanId, type ActiveAddon } from './src/shared/plans.ts';

// Initialize Firebase Admin
let firebaseConfig: any = {};
try {
  if (fs.existsSync('./firebase-applet-config.json')) {
    firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
  }
} catch (err) {
  logger.warn('Could not read firebase-applet-config.json, falling back to env vars');
}

const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
const dbId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId;

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: projectId,
  });
}
const db = getFirestore(dbId);

// Shim to keep existing call patterns working
const getDoc = (ref: any) => ref.get().then((snap: any) => {
  if (snap && typeof snap.exists === 'boolean') {
    const originalExists = snap.exists;
    try {
      Object.defineProperty(snap, 'exists', {
        value: () => originalExists,
        configurable: true
      });
    } catch (e) {
      // Fallback if defineProperty fails
      (snap as any).exists = () => originalExists;
    }
  }
  return snap;
});

async function testConnection() {
  try {
    // Test connection to the specific database
    await db.collection('test_connection').doc('ping').get();
    logger.info("Firestore connection successful to database: " + firebaseConfig.firestoreDatabaseId);
  } catch (error) {
    logger.error("Firestore connection test error:", error);
  }
}
testConnection();

const getDocs = (query: any) => query.get();
const setDoc = (ref: any, data: any, opts?: any) => opts?.merge ? ref.set(data, { merge: true }) : ref.set(data);
const updateDoc = (ref: any, data: any) => ref.update(data);
const addDoc = (col: any, data: any) => col.add(data);
const writeBatch = (_db: any) => db.batch();
const serverTimestamp = () => FieldValue.serverTimestamp();
const increment = (n: number) => FieldValue.increment(n);
const collection = (_db: any, name: string) => db.collection(name);
const doc = (_db: any, col: string, id: string) => db.collection(col).doc(id);
const query = (colRef: any, ...constraints: any[]) => {
  let q = colRef;
  for (const c of constraints) q = c(q);
  return q;
};
const where = (field: any, op: any, val: any) => (q: any) => q.where(field, op, val);
const orderBy = (field: string, dir?: any) => (q: any) => q.orderBy(field, dir || 'asc');
const limit = (n: number) => (q: any) => q.limit(n);
const documentId = () => FieldPath.documentId();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  logger.info(`Starting server in ${process.env.NODE_ENV} mode`);
  
  // CORS configuration
  const corsOrigin = process.env.APP_URL || '*';
  logger.info(`CORS Origin: ${corsOrigin}`);
  
  app.use(cors({ 
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-internal-secret']
  }));
  app.use(express.json());

  // Middlewares
  const authenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        logger.warn(`Missing or invalid auth header for ${req.path}`);
        return res.status(401).send('Unauthorized');
      }
      const token = authHeader.split('Bearer ')[1];
      const decoded = await admin.auth().verifyIdToken(token);
      (req as any).user = decoded;
      next();
    } catch (error: any) {
      logger.error(`Auth error for ${req.path}:`, { 
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      res.status(401).send(`Unauthorized: ${error.message || 'Invalid token'}`);
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

  // ═══════════════════════════════════════════════════════════
  //  BILLING & PLAN HELPERS
  // ═══════════════════════════════════════════════════════════

  /** Fetch user's subscription doc (plan + addons). Creates default if missing. */
  async function getUserSubscription(uid: string) {
    const subRef = doc(db, 'subscriptions', uid);
    const subSnap = await getDoc(subRef);
    if (subSnap.exists()) return subSnap.data();
    // Create default subscription
    const defaultSub = {
      plan: 'free' as PlanId,
      addons: [] as ActiveAddon[],
      billing_cycle_start: null,
      billing_cycle_end: null,
      cancel_at_period_end: false,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    };
    await setDoc(subRef, defaultSub);
    return defaultSub;
  }

  /** Get real usage numbers for a user */
  async function getUserUsage(uid: string) {
    // Count active QR codes
    const qrSnapshot = await getDocs(
      query(collection(db, 'qr_codes'), where('user_uid', '==', uid))
    );
    const allQrs = qrSnapshot.docs.map((d: any) => d.data());
    const activeQrs = allQrs.filter((d: any) => d.is_active !== false).length;

    // Compute storage (rough estimate: QR SVG size)
    let storageBytes = 0;
    allQrs.forEach((d: any) => {
      if (d.qr_svg) storageBytes += Buffer.byteLength(d.qr_svg, 'utf-8');
      if (d.style?.logo_url) storageBytes += (d.style.logo_url.length * 0.75); // base64 estimate
    });

    // Count scans this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthKey = monthStart.toISOString().slice(0, 7); // "2026-03"

    let scansThisMonth = 0;
    for (const qr of allQrs) {
      try {
        const statsSnap = await getDoc(doc(db, 'qr_stats', qr.slug));
        if (statsSnap.exists()) {
          const days = statsSnap.data()?.days || {};
          for (const [dateStr, count] of Object.entries(days)) {
            if (dateStr.startsWith(monthKey)) {
              scansThisMonth += (count as number);
            }
          }
        }
      } catch (e) { /* skip broken stats */ }
    }

    return {
      active_qr_codes: activeQrs,
      total_qr_codes: allQrs.length,
      scans_this_month: scansThisMonth,
      storage_bytes: Math.round(storageBytes),
    };
  }

  /** Generate PayHere checkout data */
  function buildPayHereCheckout(opts: {
    uid: string; email: string; name: string;
    orderId: string; amount: number; itemDesc: string;
    custom1: string; custom2: string;
    recurrence?: string; duration?: string;
  }) {
    const merchant_id = process.env.PAYHERE_MERCHANT_ID || '';
    const merchant_secret = process.env.PAYHERE_SECRET || '';
    const currency = 'USD';
    const amountStr = opts.amount.toFixed(2);
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

    // md5(merchant_id + order_id + amount + currency + md5(merchant_secret))
    const hashedSecret = crypto.createHash('md5').update(merchant_secret).digest('hex').toUpperCase();
    const hashInput = `${merchant_id}${opts.orderId}${amountStr}${currency}${hashedSecret}`;
    const hash = crypto.createHash('md5').update(hashInput).digest('hex').toUpperCase();

    return {
      merchant_id,
      return_url: `${appUrl}/billing`,
      cancel_url: `${appUrl}/pricing`,
      notify_url: `${appUrl}/api/billing/notify`,
      order_id: opts.orderId,
      items: opts.itemDesc,
      currency,
      amount: amountStr,
      first_name: opts.name.split(' ')[0] || 'User',
      last_name: opts.name.split(' ').slice(1).join(' ') || '',
      email: opts.email,
      phone: '0000000000',
      address: 'N/A',
      city: 'N/A',
      country: 'Sri Lanka',
      hash,
      custom_1: opts.custom1,
      custom_2: opts.custom2,
      ...(opts.recurrence ? { recurrence: opts.recurrence, duration: opts.duration || 'Forever' } : {}),
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  USER PLAN & USAGE APIs
  // ═══════════════════════════════════════════════════════════

  /** Full plan info: plan details, effective limits (with addons), real usage, features */
  app.get('/api/user/plan', authenticate, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const sub = await getUserSubscription(uid);
      const planId = sub.plan || 'free';
      const plan = getPlan(planId);
      const activeAddons: ActiveAddon[] = sub.addons || [];
      const effectiveLimits = computeEffectiveLimits(planId, activeAddons);
      const usage = await getUserUsage(uid);

      res.json({
        plan: planId,
        plan_name: plan.name,
        price_usd: plan.price_usd,
        cycle: plan.cycle,
        rank: plan.rank,
        limits: effectiveLimits,
        base_limits: plan.limits,
        features: plan.features,
        addons: activeAddons,
        usage,
        cancel_at_period_end: sub.cancel_at_period_end || false,
        billing_cycle_end: sub.billing_cycle_end || null,
      });
    } catch (error) {
      logger.error('Plan fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch plan' });
    }
  });

  /** Lightweight usage-only endpoint for quick checks */
  app.get('/api/user/usage', authenticate, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const usage = await getUserUsage(uid);
      res.json(usage);
    } catch (error) {
      logger.error('Usage fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch usage' });
    }
  });

  // ═══════════════════════════════════════════════════════════
  //  BILLING CHECKOUT & MANAGEMENT APIs
  // ═══════════════════════════════════════════════════════════

  /** Checkout for plan upgrade/downgrade */
  app.post('/api/billing/checkout', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const { plan: targetPlanId } = req.body;
      const uid = user.uid;

      const targetPlan = PLANS[targetPlanId as PlanId];
      if (!targetPlan || targetPlanId === 'free') {
        return res.status(400).json({ error: 'Invalid plan. Use /api/billing/cancel for free.' });
      }

      const merchant_id = process.env.PAYHERE_MERCHANT_ID;
      const merchant_secret = process.env.PAYHERE_SECRET;
      if (!merchant_id || !merchant_secret) {
        // PayHere not configured — simulate for development
        logger.warn('PayHere not configured. Simulating checkout for development.');
        // Auto-apply the plan for dev/testing
        const subRef = doc(db, 'subscriptions', uid);
        await setDoc(subRef, {
          plan: targetPlanId,
          updated_at: serverTimestamp(),
          cancel_at_period_end: false,
        }, { merge: true });
        await setDoc(doc(db, 'users', uid), { plan: targetPlanId }, { merge: true });
        return res.json({ dev_mode: true, message: `Plan set to ${targetPlanId} (dev mode — no PayHere)` });
      }

      const orderId = `PLAN_${uid}_${Date.now()}`;
      const checkout = buildPayHereCheckout({
        uid, email: user.email || '', name: user.name || 'User',
        orderId, amount: targetPlan.price_usd,
        itemDesc: `${targetPlan.name} Plan Subscription`,
        custom1: uid, custom2: `plan:${targetPlanId}`,
        recurrence: targetPlan.recurrence, duration: targetPlan.duration,
      });

      res.json(checkout);
    } catch (error) {
      logger.error('Checkout error:', error);
      res.status(500).json({ error: 'Failed to generate checkout' });
    }
  });

  /** Purchase an add-on */
  app.post('/api/billing/addon', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const { addon_id, quantity = 1 } = req.body;
      const uid = user.uid;

      const addon = getAddon(addon_id);
      if (!addon) return res.status(400).json({ error: 'Invalid add-on ID' });

      const totalPrice = addon.price_usd * quantity;
      const merchant_id = process.env.PAYHERE_MERCHANT_ID;
      const merchant_secret = process.env.PAYHERE_SECRET;

      if (!merchant_id || !merchant_secret) {
        // Dev mode — auto-apply add-on
        logger.warn('PayHere not configured. Auto-applying add-on for development.');
        const subRef = doc(db, 'subscriptions', uid);
        const sub = await getUserSubscription(uid);
        const addons: ActiveAddon[] = sub.addons || [];
        addons.push({
          addon_id,
          quantity,
          purchased_at: new Date().toISOString(),
          order_id: `DEV_ADDON_${Date.now()}`,
        });
        await setDoc(subRef, { addons, updated_at: serverTimestamp() }, { merge: true });
        return res.json({ dev_mode: true, message: `Add-on ${addon_id} applied (dev mode)` });
      }

      const orderId = `ADDON_${uid}_${Date.now()}`;
      const checkout = buildPayHereCheckout({
        uid, email: user.email || '', name: user.name || 'User',
        orderId, amount: totalPrice,
        itemDesc: `${addon.name} x${quantity}`,
        custom1: uid, custom2: `addon:${addon_id}:${quantity}`,
        recurrence: '1 Month', duration: 'Forever',
      });

      res.json(checkout);
    } catch (error) {
      logger.error('Addon checkout error:', error);
      res.status(500).json({ error: 'Failed to generate addon checkout' });
    }
  });

  /** Remove an active add-on */
  app.delete('/api/billing/addon/:addonId', authenticate, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const { addonId } = req.params;
      const subRef = doc(db, 'subscriptions', uid);
      const sub = await getUserSubscription(uid);
      const addons: ActiveAddon[] = sub.addons || [];

      const idx = addons.findIndex(a => a.addon_id === addonId);
      if (idx === -1) return res.status(404).json({ error: 'Add-on not found' });

      addons.splice(idx, 1);
      await setDoc(subRef, { addons, updated_at: serverTimestamp() }, { merge: true });

      res.json({ success: true, message: `Add-on ${addonId} removed` });
    } catch (error) {
      logger.error('Addon removal error:', error);
      res.status(500).json({ error: 'Failed to remove addon' });
    }
  });

  /** Get invoice history */
  app.get('/api/billing/invoices', authenticate, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const snapshot = await getDocs(
        query(collection(db, 'invoices'), where('user_uid', '==', uid), orderBy('created_at', 'desc'), limit(50))
      );
      const invoices = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      res.json(invoices);
    } catch (error) {
      logger.error('Invoices fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  });

  /** Cancel subscription (schedule downgrade to free at period end) */
  app.post('/api/billing/cancel', authenticate, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const subRef = doc(db, 'subscriptions', uid);
      await setDoc(subRef, {
        cancel_at_period_end: true,
        updated_at: serverTimestamp(),
      }, { merge: true });
      res.json({ success: true, message: 'Subscription will cancel at end of current billing period' });
    } catch (error) {
      logger.error('Cancel error:', error);
      res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  });

  /** Downgrade immediately to free */
  app.post('/api/billing/downgrade-free', authenticate, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      const subRef = doc(db, 'subscriptions', uid);
      await setDoc(subRef, {
        plan: 'free',
        addons: [],
        cancel_at_period_end: false,
        updated_at: serverTimestamp(),
      }, { merge: true });
      await setDoc(doc(db, 'users', uid), { plan: 'free' }, { merge: true });
      res.json({ success: true, message: 'Downgraded to Free plan' });
    } catch (error) {
      logger.error('Downgrade error:', error);
      res.status(500).json({ error: 'Failed to downgrade' });
    }
  });

  /** Get available plans and add-ons (public config endpoint) */
  app.get('/api/billing/plans', (_req, res) => {
    res.json({ plans: PLANS, addons: ADDONS });
  });

  const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const generateSlug = customAlphabet(ALPHABET, 7);

  // PayHere Webhook — handles BOTH plan upgrades and add-on purchases
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
        custom_2: payload  // "plan:pro" or "addon:scans_10k:2"
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
        // Payment successful
        const parts = payload.split(':');
        const type = parts[0]; // "plan" or "addon"

        if (type === 'plan') {
          const planId = parts[1];
          const subRef = doc(db, 'subscriptions', uid);
          const now = new Date();
          const cycleEnd = new Date(now);
          cycleEnd.setMonth(cycleEnd.getMonth() + 1);

          await setDoc(subRef, {
            plan: planId,
            billing_cycle_start: now.toISOString(),
            billing_cycle_end: cycleEnd.toISOString(),
            cancel_at_period_end: false,
            updated_at: serverTimestamp(),
          }, { merge: true });
          await setDoc(doc(db, 'users', uid), { plan: planId }, { merge: true });
          logger.info(`User ${uid} upgraded to ${planId}`);
        } else if (type === 'addon') {
          const addonId = parts[1];
          const qty = parseInt(parts[2]) || 1;
          const subRef = doc(db, 'subscriptions', uid);
          const sub = await getUserSubscription(uid);
          const addons: ActiveAddon[] = sub.addons || [];
          addons.push({
            addon_id: addonId,
            quantity: qty,
            purchased_at: new Date().toISOString(),
            order_id,
          });
          await setDoc(subRef, { addons, updated_at: serverTimestamp() }, { merge: true });
          logger.info(`User ${uid} purchased add-on ${addonId} x${qty}`);
        }

        // Save invoice record
        await addDoc(collection(db, 'invoices'), {
          user_uid: uid,
          order_id,
          amount: parseFloat(payhere_amount),
          currency: payhere_currency,
          description: payload,
          status: 'paid',
          created_at: serverTimestamp(),
        });

      } else if (status_code === '0') {
        logger.info(`Payment pending for user ${uid}`);
      } else {
        logger.warn(`Payment failed for user ${uid} (Status ${status_code})`);
        // Save failed invoice
        await addDoc(collection(db, 'invoices'), {
          user_uid: uid,
          order_id,
          amount: parseFloat(payhere_amount || '0'),
          currency: payhere_currency || 'USD',
          description: payload,
          status: status_code === '-1' ? 'cancelled' : 'failed',
          created_at: serverTimestamp(),
        });
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
  app.post('/api/qr', authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      const { destination_url, title, style, is_dynamic, qr_type, content_data, options } = req.body;
      const uid = user.uid;

      // Map options to stored fields
      const rate_limit = {
        enabled: options?.scan_limit_enabled || false,
        max_scans: options?.scan_limit || 100,
        period: 'total'
      };
      const expiry_date = options?.expiry_date_enabled ? options.expiry_date : null;
      const password = options?.password_protect ? options.password : null;

      logger.info(`Starting QR creation for user ${uid}`, { type: qr_type, is_dynamic });

      // 1. Plan Limit Enforcement (uses shared config)
      let sub;
      try {
        sub = await getUserSubscription(uid);
      } catch (err: any) {
        logger.error('Failed to fetch subscription for plan check', { error: err.message });
        throw new Error(`Subscription lookup failed: ${err.message}`);
      }
      
      const planId = sub.plan || 'free';
      const planConfig = getPlan(planId);
      const effectiveLimits = computeEffectiveLimits(planId, sub.addons || []);

      logger.info(`Checking limits for plan: ${planId}`, { effectiveLimits });

      let qrSnapshot;
      try {
        qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      } catch (err: any) {
        logger.error('Failed to fetch user QRs for limit check', { error: err.message });
        throw new Error(`QR lookup failed: ${err.message}`);
      }
      
      const activeCount = qrSnapshot.docs.filter((d: any) => d.data().is_active !== false).length;
      
      if (!isUnlimited(effectiveLimits.max_qr_codes) && activeCount >= effectiveLimits.max_qr_codes) {
        logger.warn(`User ${uid} reached QR limit (${activeCount}/${effectiveLimits.max_qr_codes})`);
        return res.status(403).json({ error: `QR code limit reached (${activeCount}/${effectiveLimits.max_qr_codes}). Upgrade your plan or purchase a QR add-on.`, upgrade: true });
      }

      // Check feature: dynamic QR
      if (is_dynamic !== false && !planConfig.features.dynamic_qr) {
        return res.status(403).json({ error: 'Dynamic QR codes require Starter plan or above.', feature: 'dynamic_qr', upgrade: true });
      }

      // Check feature: logo embedding
      if (style?.logo_url && !planConfig.features.logo_embedding) {
        return res.status(403).json({ error: 'Logo embedding requires Pro plan or above.', feature: 'logo_embedding', upgrade: true });
      }

      // Check feature: password protection
      if (options?.password_protect && !planConfig.features.password_protect) {
        return res.status(403).json({ error: 'Password protection requires Starter plan or above.', feature: 'password_protect', upgrade: true });
      }

      // 2. Slug Generation
      let slug;
      try {
        slug = await createUniqueSlug();
        logger.info(`Successfully generated unique slug: ${slug}`);
      } catch (err: any) {
        logger.error('Slug generation failed', { error: err.message });
        throw new Error(`Slug generation failed: ${err.message}`);
      }
      
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

      // 3. SVG Generation
      let qrSvg;
      try {
        qrSvg = await QRCode.toString(qrContent, {
          type: 'svg',
          color: { dark: activeStyle.dot_color, light: activeStyle.bg_color },
          margin: 1
        });
        logger.info('Successfully generated QR SVG');
      } catch (err: any) {
        logger.error('QR SVG generation failed', { error: err.message });
        throw new Error(`QR Image generation failed: ${err.message}`);
      }

      let passwordHash = null;
      if (password) {
        passwordHash = crypto.createHash('sha256').update(password + slug).digest('hex');
      }

      const qrDoc = {
        slug,
        user_uid: user.uid,
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

      // 4. Firestore Commit
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'qr_codes', slug), qrDoc);
        batch.set(doc(db, 'qr_stats', slug), statsDoc);
        await batch.commit();
        logger.info(`Successfully saved QR and stats for ${slug}`);
      } catch (err: any) {
        logger.error('Firestore batch commit failed', { error: err.message });
        throw new Error(`Database save failed: ${err.message}`);
      }

      res.status(201).json(qrDoc);
    } catch (error: any) {
      logger.error('QR creation error details:', {
        message: error.message,
        stack: error.stack,
        error
      });
      res.status(500).json({ error: error.message || 'Failed to create QR' });
    }
  });

  // List user's QR codes
  app.get('/api/qr', authenticate, async (req, res) => {
    try {
      const uid = (req as any).user.uid;
      // Single field query to avoid index issues
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      
      const qrs = await Promise.all(qrSnapshot.docs
        .map(async (docSnap: any) => {
          const data = docSnap.data();
          // Fetch stats for each QR to satisfy dashboard requirements
          const statsSnap = await getDoc(doc(db, 'qr_stats', data.slug));
          return {
            id: docSnap.id,
            ...data,
            stats: statsSnap.exists() ? statsSnap.data() : null
          };
        }));

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
          updateData['rate_limit.period'] = 'total';
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

      // Invalidate KV cache so Worker picks up new gate settings immediately
      const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
      fetch(`${appUrl}/internal/purge/${slug}`, {
        headers: { 'x-internal-secret': process.env.INTERNAL_SECRET || '' }
      }).catch(err => logger.error(`Cache purge failed for ${slug}`, err));

      res.json({ success: true, slug });
    } catch (error) {
      logger.error('QR update error:', error);
      res.status(500).json({ error: 'Failed to update QR code' });
    }
  });

  // Delete QR code
  app.delete('/api/qr/:slug', authenticate, requireOwnership, async (req, res) => {
    try {
      const { slug } = req.params;
      
      // Batch delete code, stats, and (optionally) some events
      // For now, keep it simple with codes and stats
      const batch = db.batch();
      batch.delete(doc(db, 'qr_codes', slug));
      batch.delete(doc(db, 'qr_stats', slug));
      await batch.commit();

      res.json({ message: 'QR code deleted successfully' });

      // Background cleanup: delete scan_events for this slug in chunks of 500
      (async () => {
        try {
          const eventsRef = collection(db, 'scan_events');
          let deletedCount = 0;
          let hasMore = true;

          while (hasMore) {
            const q = query(eventsRef, where('slug', '==', slug), limit(500));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
              hasMore = false;
              break;
            }

            const eventsBatch = db.batch();
            snapshot.docs.forEach((docSnap) => {
              eventsBatch.delete(docSnap.ref);
            });
            await eventsBatch.commit();
            deletedCount += snapshot.size;
          }
          logger.info(`Background cleanup: deleted ${deletedCount} scan_events for slug ${slug}`);
        } catch (cleanupErr) {
          logger.error(`Background cleanup failed for slug ${slug}:`, cleanupErr);
        }
      })();


      // Purge Worker Cache
      const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
      fetch(`${appUrl}/internal/purge/${slug}`, {
        headers: { 'x-internal-secret': process.env.INTERNAL_SECRET || '' }
      }).catch(err => logger.error(`Cache purge failed for ${slug}`, err));

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

      // Derive first scan date from the days map (earliest key)
      const daysMap = data.days || {};
      const dayKeys = Object.keys(daysMap).sort(); // "2026-03-20", "2026-03-21", ...
      const first_scan = dayKeys.length > 0 ? dayKeys[0] : null;

      res.json({
        total_scans,
        unique_visitors,
        mobile_pct,
        first_scan,
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
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      let slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (requestedSlugs) {
        slugs = slugs.filter(s => requestedSlugs.includes(s));
      }

      if (slugs.length === 0) {
        return res.json({ total_scans: 0, unique_visitors: 0, total_qrs: 0, active_qrs: 0 });
      }

      let total_scans = 0;
      let unique_visitors = 0;
      
      const chunks = [];
      for (let i = 0; i < slugs.length; i += 30) {
        chunks.push(slugs.slice(i, i + 30));
      }

      // Find earliest scan date across all QRs
      let earliest_day: string | null = null;

      for (const chunk of chunks) {
        const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
        statsSnapshot.forEach(doc => {
          const data = doc.data();
          total_scans += (data.total_scans || 0);
          unique_visitors += (data.unique_scans || 0);
          
          // ADD THIS:
          const days = Object.keys(data.days || {}).sort();
          if (days.length > 0) {
            if (!earliest_day || days[0] < earliest_day) {
              earliest_day = days[0];
            }
          }
        });
      }

      const active_qrs = qrSnapshot.docs.filter(doc => doc.data().is_active).length;

      res.json({
        total_scans,
        unique_visitors,
        total_qrs: slugs.length,
        active_qrs,
        first_scan: earliest_day
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
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;

      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      let slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (requestedSlugs) {
        slugs = slugs.filter(s => requestedSlugs.includes(s));
      }

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
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      let slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (requestedSlugs) {
        slugs = slugs.filter(s => requestedSlugs.includes(s));
      }

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
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      let slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (requestedSlugs) {
        slugs = slugs.filter(s => requestedSlugs.includes(s));
      }

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

  app.get('/api/analytics/account/:uid/browsers', authenticate, async (req, res) => {
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      if (decodedUser.uid !== uid) return res.status(403).send('Forbidden');
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      let slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (requestedSlugs) {
        slugs = slugs.filter(s => requestedSlugs.includes(s));
      }

      const browsers: Record<string, number> = {};
      if (slugs.length > 0) {
        const chunks = [];
        for (let i = 0; i < slugs.length; i += 30) chunks.push(slugs.slice(i, i + 30));
        for (const chunk of chunks) {
          const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
          statsSnapshot.forEach(doc => {
            const data = doc.data();
            const b = data.browsers || {};
            for (const [browser, count] of Object.entries(b)) {
              browsers[browser] = (browsers[browser] || 0) + (count as number);
            }
          });
        }
      }
      const result = Object.entries(browsers).map(([browser, count]) => ({ browser, count })).sort((a, b) => b.count - a.count);
      res.json(result);
    } catch (error) {
      logger.error('Account browsers error:', error);
      res.status(500).json({ error: 'Failed to fetch account browsers' });
    }
  });

  app.get('/api/analytics/account/:uid/os', authenticate, async (req, res) => {
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      if (decodedUser.uid !== uid) return res.status(403).send('Forbidden');
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      let slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (requestedSlugs) {
        slugs = slugs.filter(s => requestedSlugs.includes(s));
      }

      const os: Record<string, number> = {};
      if (slugs.length > 0) {
        const chunks = [];
        for (let i = 0; i < slugs.length; i += 30) chunks.push(slugs.slice(i, i + 30));
        for (const chunk of chunks) {
          const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
          statsSnapshot.forEach(doc => {
            const data = doc.data();
            const o = data.os || {};
            for (const [name, count] of Object.entries(o)) {
              os[name] = (os[name] || 0) + (count as number);
            }
          });
        }
      }
      const result = Object.entries(os).map(([os, count]) => ({ os, count })).sort((a, b) => b.count - a.count);
      res.json(result);
    } catch (error) {
      logger.error('Account OS error:', error);
      res.status(500).json({ error: 'Failed to fetch account OS' });
    }
  });

  app.get('/api/analytics/account/:uid/referrers', authenticate, async (req, res) => {
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      if (decodedUser.uid !== uid) return res.status(403).send('Forbidden');
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      let slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (requestedSlugs) {
        slugs = slugs.filter(s => requestedSlugs.includes(s));
      }

      const referrers: Record<string, number> = {};
      if (slugs.length > 0) {
        const chunks = [];
        for (let i = 0; i < slugs.length; i += 30) chunks.push(slugs.slice(i, i + 30));
        for (const chunk of chunks) {
          const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
          statsSnapshot.forEach(doc => {
            const data = doc.data();
            const r = data.referrers || {};
            for (const [referrer, count] of Object.entries(r)) {
              referrers[referrer] = (referrers[referrer] || 0) + (count as number);
            }
          });
        }
      }
      const result = Object.entries(referrers).map(([referrer, count]) => ({ referrer, count })).sort((a, b) => b.count - a.count);
      res.json(result);
    } catch (error) {
      logger.error('Account referrers error:', error);
      res.status(500).json({ error: 'Failed to fetch account referrers' });
    }
  });

  app.get('/api/analytics/account/:uid/summary', authenticate, async (req, res) => {
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      if (decodedUser.uid !== uid) return res.status(403).send('Forbidden');
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      let slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (requestedSlugs) {
        slugs = slugs.filter(s => requestedSlugs.includes(s));
      }

      let total_scans = 0, unique_visitors = 0;
      if (slugs.length > 0) {
        const chunks = [];
        for (let i = 0; i < slugs.length; i += 30) chunks.push(slugs.slice(i, i + 30));
        for (const chunk of chunks) {
          const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
          statsSnapshot.forEach(doc => {
            const data = doc.data();
            total_scans += (data.total_scans || 0);
            unique_visitors += (data.unique_scans || 0);
          });
        }
      }
      res.json({ total_scans, unique_visitors, total_qrs: slugs.length });
    } catch (error) {
      logger.error('Account summary error:', error);
      res.status(500).json({ error: 'Failed to fetch account summary' });
    }
  });

  app.get('/api/analytics/account/:uid/recent', authenticate, async (req, res) => {
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      
      if (decodedUser.uid !== uid) {
        return res.status(403).send('Forbidden');
      }
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      let slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (requestedSlugs) {
        slugs = slugs.filter(s => requestedSlugs.includes(s));
      }

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
        logger.warn('Internal scan: Unauthorized secret attempt');
        return res.status(401).send('Unauthorized');
      }
      logger.info(`Received internal scan for slug: ${req.body.slug}`);
      await captureAnalyticsFromPayload(req.body);
      res.send('OK');
    } catch (error: any) {
      logger.error('Internal scan error details:', { 
        message: error.message, 
        slug: req.body?.slug,
        stack: error.stack 
      });
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
      const responseBody = {
        destination_url: qr.destination_url,
        is_active: qr.is_active,
        expiry_date: qr.expiry_date || null,
        password_hash: qr.password_hash || null,
        scan_limit: qr.rate_limit?.enabled ? qr.rate_limit.max_scans : null,
        total_scans: stats.total_scans || 0
      };

      logger.info(`Returning config for slug ${slug}:`, { 
        has_password: !!responseBody.password_hash,
        is_active: responseBody.is_active 
      });

      res.json(responseBody);
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on port ${PORT}`);
  });
}

// Analytics Capture Logic
async function captureAnalyticsFromPayload(payload: any) {
  const { slug, ip, ua, country, asn, colo, tls, lang, is_eu, is_unique: payloadIsUnique, status } = payload;
  if (isBot(ua)) return;

  const today = new Date().toISOString().slice(0, 10);
  const fingerprint = `${ip}:${ua.slice(0, 100)}:${today}:${process.env.HASH_SALT || ''}`;
  const visitorHash = crypto.createHash('sha256').update(fingerprint).digest('hex');

  let isUnique = payloadIsUnique;
  if (isUnique === undefined) {
    // Fallback: If not provided, we just assume unique to avoid the composite query for now
    // (Or we can just log that it was missing)
    isUnique = true;
    logger.debug(`Uniqueness flag missing for slug ${slug}, defaulting to true`);
  }

  const parsed = parseUA(ua);
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const hourStr = now.getHours().toString();

  const isFailed = status === 'failed_password';

  // 1. EXACT SCHEMA for scan_events per user prompt (plus CF extensions)
  await addDoc(collection(db, 'scan_events'), {
    slug,
    date: dateStr,
    country: country || 'Unknown',
    device: parsed.device,
    browser: parsed.browser,
    os: parsed.os,
    is_unique: isUnique,
    scanned_at: serverTimestamp(),
    
    // Kept behind the scenes for uniqueness check / CF data
    visitor_hash: visitorHash,
    asn: asn || null,
    colo: colo || null,
    lang: lang || null,
    tls: tls || null,
    is_eu: is_eu || false,
    status: status || 'success'
  });

  // 2. EXACT SCHEMA for qr_stats per user prompt (plus CF atomic increments)
  const statsRef = doc(db, 'qr_stats', slug);
  const inc = increment(1);
  
  const updateData: any = {
    [`countries.${country || 'Unknown'}`]: inc,
    last_scan_at: serverTimestamp()
  };

  if (isFailed) {
    updateData.failed_scans = inc;
  } else {
    updateData.total_scans = inc;
    updateData[`${parsed.device}_scans`] = inc;
    updateData[`days.${dateStr}`] = inc;
    updateData[`hours.${hourStr}`] = inc;
    updateData[`browsers.${parsed.browser}`] = inc;
    updateData[`os.${parsed.os}`] = inc;

    if (asn) updateData[`isps.AS${asn}`] = inc;
    if (colo) updateData[`regions.${colo}`] = inc;
    if (lang) updateData[`languages.${lang.substring(0, 2)}`] = inc;
    if (parsed.osVersion) updateData[`os_versions.${parsed.os} ${parsed.osVersion}`] = inc;
    if (tls) updateData[`tls_protocols.${tls}`] = inc;
    if (is_eu) updateData[`eu_scans`] = inc;

    if (isUnique) {
      updateData.unique_scans = inc;
    }
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
