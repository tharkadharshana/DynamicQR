import 'dotenv/config';

// ── Debug Logging ─────────────────────────────────────────────────────────────
// Set DEBUG_VERBOSE=true in Vercel env vars to enable.
const DEBUG = process.env.DEBUG_VERBOSE === 'true';
const dbg = (...args: any[]) => { if (DEBUG) console.log('[DBG]', ...args); };
// ──────────────────────────────────────────────────────────────────────────────
import express from 'express';
import path from 'path';
import cors from 'cors';
import admin from 'firebase-admin';
import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { customAlphabet } from 'nanoid';
import QRCode from 'qrcode';
import logger from "./logger.js";
import fs from 'fs';
import { PLANS, TRIAL_LIMITS, DEFAULT_ADDONS, PlanId, UserAddons, ADDONS, AddonId } from './src/lib/plans.js';

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

dbg('Firebase Admin init START', { projectId, dbId });
if (!admin.apps.length) {
  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountVar) {
    try {
      const serviceAccount = JSON.parse(serviceAccountVar);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: projectId,
      });
      logger.info('Firebase Admin initialized with Service Account');
      dbg('Firebase Admin initialized with Service Account');
    } catch (err) {
      logger.error('Failed to parse FIREBASE_SERVICE_ACCOUNT env var:', err);
      console.error('[DBG] Firebase Admin init FAILED to parse service account:', err);
      admin.initializeApp({ projectId });
      dbg('Firebase Admin fallback initialized (Ambient)');
    }
  } else {
    admin.initializeApp({
      projectId: projectId,
    });
    logger.info('Firebase Admin initialized with Project ID (Ambient Credentials)');
    dbg('Firebase Admin initialized with Project ID (Ambient)');
  }
}
const db = getFirestore(dbId);
dbg('Firestore instance created', { dbId });

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
    dbg('Firestore connection test START');
    // Test connection to the specific database
    await db.collection('test_connection').doc('ping').get();
    logger.info("Firestore connection successful to database: " + firebaseConfig.firestoreDatabaseId);
    dbg('Firestore connection test SUCCESS');
  } catch (error) {
    logger.error("Firestore connection test error:", error);
    console.error('[DBG] Firestore connection test FAILED:', error);
    dbg('Firestore connection test FAILURE', error);
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

export const app = express();

async function startServer() {
  dbg('startServer() entry');
  const PORT = Number(process.env.PORT) || 3000;

  logger.info(`Starting server in ${process.env.NODE_ENV} mode`);
  
  // CORS configuration
  const corsOrigin = process.env.APP_URL;
  if (!corsOrigin && process.env.NODE_ENV === 'production') {
    logger.error('CRITICAL: APP_URL environment variable is missing in production. Server exiting.');
    process.exit(1);
  }
  
  logger.info(`CORS Origin: ${corsOrigin || '*'}`);
  
  // Security Headers for Firebase Auth in Iframe
  app.use((req, res, next) => {
    // Cross-Origin-Opener-Policy: unsafe-none is the default, but being explicit 
    // helps when the environment or browser defaults to same-origin.
    // This allows the Firebase Auth popup to communicate back to the opener window.
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    // Ensure the iframe can load resources from the auth domain
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });
  dbg('Registered security headers middleware');
  
  app.use(cors({ 
    origin: corsOrigin || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-internal-secret']
  }));
  dbg('Registered CORS middleware');

  app.use(express.json());
  dbg('Registered express.json middleware');

  // Middlewares
  const authenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    dbg('authenticate middleware START', { path: req.path, hasToken: !!req.headers.authorization });
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        logger.warn(`Missing or invalid auth header for ${req.path}`, { 
          hasAuthHeader: !!authHeader,
          authHeaderStart: authHeader?.substring(0, 10)
        });
        return res.status(401).send('Unauthorized');
      }
      const token = authHeader.split('Bearer ')[1];
      const decoded = await admin.auth().verifyIdToken(token);
      (req as any).user = decoded;
      dbg('authenticate middleware END (success)', { uid: decoded.uid });
      next();
    } catch (error: any) {
      logger.error(`Auth error for ${req.path}:`, { 
        message: error.message,
        code: error.code,
        stack: error.stack?.substring(0, 500)
      });
      dbg('authenticate middleware END (failure)', { error: error.message });
      console.error('[500] Auth failure:', error);
      res.status(401).send(`Unauthorized: ${error.message || 'Invalid token'}`);
    }
  };

  const requireOwnership = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const { slug } = req.params;
    dbg('requireOwnership middleware START', { slug, uid: (req as any).user?.uid });
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).send('Unauthorized');

      dbg('Firestore getDoc START', { collection: 'qr_codes', docId: slug });
      const qrDoc = await getDoc(doc(db, 'qr_codes', slug));
      dbg('Firestore getDoc END', { collection: 'qr_codes', docId: slug, exists: qrDoc.exists() });
      if (!qrDoc.exists()) return res.status(404).send('Not found');
      
      if (qrDoc.data().user_uid !== user.uid) {
        return res.status(403).send('Forbidden');
      }
      
      dbg('requireOwnership middleware END (success)', { slug });
      next();
    } catch (error) {
      logger.error('Ownership check error:', error);
      dbg('requireOwnership middleware END (error)');
      console.error('[500] Ownership check error:', error);
      res.status(500).send('Internal Server Error');
    }
  };

  // API routes
  app.get('/api/health', (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/health' });
    const envStatus = {
      NODE_ENV: process.env.NODE_ENV,
      APP_URL: process.env.APP_URL ? 'set' : 'missing',
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'set' : 'missing',
      FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT ? 'set' : 'missing',
      FIRESTORE_DATABASE_ID: process.env.FIRESTORE_DATABASE_ID ? 'set' : 'missing',
      INTERNAL_SECRET: process.env.INTERNAL_SECRET ? 'set' : 'missing',
      VERCEL: process.env.VERCEL ? 'true' : 'false'
    };
    
    const criticalMissing = [];
    if (!process.env.APP_URL) criticalMissing.push('APP_URL');
    if (!process.env.FIREBASE_PROJECT_ID) criticalMissing.push('FIREBASE_PROJECT_ID');
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) criticalMissing.push('FIREBASE_SERVICE_ACCOUNT');
    
    res.json({ 
      status: criticalMissing.length === 0 ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      environment: envStatus,
      critical_missing: criticalMissing
    });
  });

  async function getLicense(uid: string): Promise<{
    effectivePlan: PlanId;
    limits: typeof PLANS[PlanId];
    isTrial: boolean;
    isExpired: boolean;
    addons: UserAddons;
  }> {
    dbg('getLicense() START', { uid });
    dbg('Firestore getDoc START', { collection: 'users', docId: uid });
    const userSnap = await getDoc(doc(db, 'users', uid));
    dbg('Firestore getDoc END', { collection: 'users', docId: uid, exists: userSnap.exists() });
    
    if (!userSnap.exists()) {
      return { effectivePlan: 'free', limits: PLANS.free, isTrial: false, isExpired: false, addons: DEFAULT_ADDONS };
    }

    const user = userSnap.data()!;
    const now = new Date();

    const trialExpiry = user.trial_expires_at?.toDate();
    const isTrial = user.is_trial && trialExpiry && trialExpiry > now;

    const planExpiry = user.plan_expires_at?.toDate();
    const isExpired = planExpiry ? planExpiry < now : false;

    let effectivePlan: PlanId = user.plan || 'free';
    if (isExpired && effectivePlan !== 'free') {
      effectivePlan = 'free';
    }

    const baseLimits = isTrial ? TRIAL_LIMITS : PLANS[effectivePlan];
    const addons = user.addons || DEFAULT_ADDONS;
    
    const limits = {
      ...baseLimits,
      // Use -1 as a JSON-safe sentinel for "unlimited" (Infinity becomes null in JSON.stringify)
      qr_codes: baseLimits.qr_codes === Infinity
        ? -1
        : baseLimits.qr_codes + (addons.extra_qr_codes || 0),
      monthly_scans: baseLimits.monthly_scans + (addons.extra_scans || 0),
      analytics_days: baseLimits.analytics_days,
      custom_domain: baseLimits.custom_domain || addons.custom_domain,
      api_access: baseLimits.api_access || addons.api_access,
    };

    return { effectivePlan, limits, isTrial, isExpired, addons };
  }

  // User Plan API
  app.get('/api/user/plan', authenticate, async (req, res) => {
    const uid = (req as any).user.uid;
    dbg('ROUTE START', { method: 'GET', path: '/api/user/plan', uid });
    logger.info(`Plan fetch started for user ${uid}`);
    
    try {
      const userRef = doc(db, 'users', uid);
      dbg('Firestore getDoc START', { collection: 'users', docId: uid });
      const userSnap = await getDoc(userRef);
      dbg('Firestore getDoc END', { collection: 'users', docId: uid, exists: userSnap.exists() });
      logger.info(`User document fetch: exists=${userSnap.exists()}`);

      if (!userSnap.exists()) {
        logger.info(`Creating new user document for ${uid}`);
        // First time - create with 14-day trial
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 14);
        
        dbg('Firestore setDoc START', { collection: 'users', docId: uid });
        await setDoc(userRef, {
          plan: 'free',
          plan_expires_at: null,
          trial_expires_at: admin.firestore.Timestamp.fromDate(trialEnd),
          is_trial: true,
          addons: DEFAULT_ADDONS,
          payhere_customer_id: null,
          payhere_subscription_id: null,
          created_at: serverTimestamp(),
          email: (req as any).user.email || '',
        });
        dbg('Firestore setDoc END', { collection: 'users', docId: uid });
        logger.info(`New user document created for ${uid}`);
      }

      const license = await getLicense(uid);
      logger.info(`License calculated for ${uid}: plan=${license.effectivePlan}, trial=${license.isTrial}`);
      
      // Fetch ALL QR codes (active + inactive) for accurate totals
      dbg('Firestore getDocs START', { collection: 'qr_codes', uid });
      const allQrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      dbg('Firestore getDocs END', { collection: 'qr_codes', size: allQrSnapshot.size });
      const allSlugs: string[] = allQrSnapshot.docs.map((d: any) => d.data().slug);
      logger.info(`Stats aggregation for user ${uid}: found ${allSlugs.length} slugs`);
      const activeQrs = allQrSnapshot.docs.filter((d: any) => d.data().is_active !== false).length;
      const remaining_qr = license.limits.qr_codes === -1 ? -1 : Math.max(0, license.limits.qr_codes - activeQrs);

      // Aggregate stats across all QRs in 30-slug chunks (Firestore 'in' limit)
      let totalScans = 0;
      const countriesSet = new Set<string>();
      let earliestDay: string | null = null;
      const chunks: string[][] = [];
      for (let i = 0; i < allSlugs.length; i += 30) chunks.push(allSlugs.slice(i, i + 30));

      let monthlyScansFromStats = 0;
      const currentMonth = new Date().toISOString().slice(0, 7);

      for (const chunk of chunks) {
        try {
          dbg('Firestore getDocs START (chunk)', { collection: 'qr_stats', count: chunk.length });
          const statsSnaps = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
          dbg('Firestore getDocs END (chunk)', { collection: 'qr_stats', size: statsSnaps.size });
          logger.info(`Plan fetch: chunk stats count: ${statsSnaps.size} for chunk ${chunk.join(',')}`);
          statsSnaps.forEach((s: any) => {
            const d = s.data();
            totalScans += d.total_scans || 0;
            Object.keys(d.countries || {}).forEach((c: string) => countriesSet.add(c));
            const dayKeys = Object.keys(d.days || {}).sort();
            if (dayKeys.length && (!earliestDay || dayKeys[0] < earliestDay)) earliestDay = dayKeys[0];
            // Sum monthly scans from qr_stats as a reliable fallback
            monthlyScansFromStats += d.monthly_scans?.[currentMonth] || 0;
          });
        } catch (e: any) {
          logger.error('Plan fetch error in stats chunk query', { error: e.message, chunk, uid });
          console.error('[500] Plan fetch stats chunk error:', e);
        }
      }

      const daysActive = earliestDay
        ? Math.ceil((Date.now() - new Date(earliestDay + 'T00:00:00').getTime()) / 86400000)
        : 0;

      // Use user-level monthly counter if it exists; otherwise fall back to qr_stats aggregation
      const userLevelMonthly = userSnap.data()?.monthly_scans?.[currentMonth] || 0;
      const monthlyScansUsed = userLevelMonthly > 0 ? userLevelMonthly : monthlyScansFromStats;

      const userDoc = userSnap.data();
      logger.info(`Plan fetch completed for ${uid}: totalScans=${totalScans}, monthlyScans=${monthlyScansUsed}`);
      
      // Prevent browser/CDN caching of plan data — always needs to be fresh
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.json({
        plan: license.effectivePlan,
        is_trial: license.isTrial,
        is_expired: license.isExpired,
        plan_expires_at: userDoc?.plan_expires_at || null,
        plan_since: userDoc?.plan_since || null,
        email: (req as any).user.email || userDoc?.email || '',
        limits: license.limits,
        addons: license.addons,
        remaining_qr,
        monthly_scans_used: monthlyScansUsed,
        // Aggregated stats for Settings & Billing pages
        total_qrs: allSlugs.length,
        total_scans: totalScans,
        days_active: daysActive,
        countries_count: countriesSet.size,
        profile: {
          company: userDoc?.company || '',
          jobTitle: userDoc?.jobTitle || '',
          country: userDoc?.country || 'LK',
          timezone: userDoc?.timezone || 'Asia/Colombo'
        },
        is_sandbox: process.env.PAYHERE_SANDBOX === 'true'
      });
    } catch (error: any) {
      logger.error('Plan fetch error:', { 
        message: error.message,
        code: error.code,
        stack: error.stack?.substring(0, 1000),
        uid
      });
      res.status(500).json({ error: 'Failed to fetch plan', details: error.message });
      dbg('500 Error in GET /api/user/plan', { error: error.message });
      console.error('[500] GET /api/user/plan error:', error);
    }
  });

  // User Profile Update API
  app.put('/api/user/profile', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'PUT', path: '/api/user/profile', uid: (req as any).user?.uid });
    try {
      const uid = (req as any).user.uid;
      const { company, jobTitle, country, timezone } = req.body;
      const userRef = doc(db, 'users', uid);
      
      dbg('Firestore updateDoc START', { collection: 'users', docId: uid });
      await updateDoc(userRef, {
        company: company || '',
        jobTitle: jobTitle || '',
        country: country || 'LK',
        timezone: timezone || 'Asia/Colombo',
        updated_at: serverTimestamp()
      });
      dbg('Firestore updateDoc END', { collection: 'users', docId: uid });
      
      res.json({ success: true });
    } catch (error) {
      logger.error('Profile update error:', error);
      dbg('500 Error in PUT /api/user/profile');
      console.error('[500] PUT /api/user/profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // Revoke All Sessions API
  app.post('/api/user/revoke-sessions', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'POST', path: '/api/user/revoke-sessions', uid: (req as any).user?.uid });
    try {
      const uid = (req as any).user.uid;
      await admin.auth().revokeRefreshTokens(uid);
      res.json({ success: true });
    } catch (error) {
      logger.error('Session revocation error:', error);
      dbg('500 Error in POST /api/user/revoke-sessions');
      console.error('[500] POST /api/user/revoke-sessions error:', error);
      res.status(500).json({ error: 'Failed to revoke sessions' });
    }
  });

  // Export User Data API
  app.get('/api/user/export', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/user/export', uid: (req as any).user?.uid });
    try {
      const uid = (req as any).user.uid;
      dbg('Firestore getDocs START', { collection: 'qr_codes', uid });
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      dbg('Firestore getDocs END', { collection: 'qr_codes', size: qrSnapshot.size });
      const qrs = qrSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      dbg('Firestore getDoc START', { collection: 'users', docId: uid });
      const userSnap = await getDoc(doc(db, 'users', uid));
      dbg('Firestore getDoc END', { collection: 'users', docId: uid, exists: userSnap.exists() });
      const profile = userSnap.exists() ? userSnap.data() : {};
      
      const exportData = {
        exported_at: new Date().toISOString(),
        profile: {
          email: profile.email,
          plan: profile.plan,
          company: profile.company,
          jobTitle: profile.jobTitle,
          country: profile.country,
          timezone: profile.timezone
        },
        qr_codes: qrs
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=dynamicqr-export-${uid}.json`);
      res.json(exportData);
    } catch (error) {
      logger.error('Export error:', error);
      dbg('500 Error in GET /api/user/export');
      console.error('[500] GET /api/user/export error:', error);
      res.status(500).json({ error: 'Failed to export data' });
    }
  });

  // Deactivate All QR Codes API
  app.put('/api/user/deactivate-all', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'PUT', path: '/api/user/deactivate-all', uid: (req as any).user?.uid });
    try {
      const uid = (req as any).user.uid;
      dbg('Firestore getDocs START', { collection: 'qr_codes', uid });
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      dbg('Firestore getDocs END', { collection: 'qr_codes', size: qrSnapshot.size });
      
      const batch = db.batch();
      qrSnapshot.docs.forEach(d => {
        batch.update(d.ref, { is_active: false, updated_at: serverTimestamp() });
      });
      dbg('Firestore batch commit START (deactivate all)');
      await batch.commit();
      dbg('Firestore batch commit END (deactivate all)');
      
      res.json({ success: true, count: qrSnapshot.size });
    } catch (error) {
      logger.error('Deactivate all error:', error);
      dbg('500 Error in PUT /api/user/deactivate-all');
      console.error('[500] PUT /api/user/deactivate-all error:', error);
      res.status(500).json({ error: 'Failed to deactivate QR codes' });
    }
  });

  // Delete Account API
  app.delete('/api/user/account', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'DELETE', path: '/api/user/account', uid: (req as any).user?.uid });
    try {
      const uid = (req as any).user.uid;
      
      // 1. Delete all QR codes and stats
      dbg('Firestore getDocs START', { collection: 'qr_codes', uid });
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      dbg('Firestore getDocs END', { collection: 'qr_codes', size: qrSnapshot.size });
      const batch = db.batch();
      
      for (const d of qrSnapshot.docs) {
        batch.delete(d.ref); // Delete QR code
        batch.delete(doc(db, 'qr_stats', d.id)); // Delete stats
        
        // Deleting scan_events in a loop might be too slow for a single request 
        // if the user has a lot. We'll start a background cleanup for scan_events
        // but for account deletion, we MUST try to be thorough.
      }
      
      // 2. Delete user document
      batch.delete(doc(db, 'users', uid));
      
      // 3. Delete subscriptions log
      dbg('Firestore getDocs START', { collection: 'subscriptions', uid });
      const subsSnapshot = await getDocs(query(collection(db, 'subscriptions'), where('uid', '==', uid)));
      dbg('Firestore getDocs END', { collection: 'subscriptions', size: subsSnapshot.size });
      subsSnapshot.forEach(d => batch.delete(d.ref));
      
      dbg('Firestore batch commit START (delete account)');
      await batch.commit();
      dbg('Firestore batch commit END (delete account)');
      
      // 4. Delete Firebase Auth User
      dbg('Firebase Auth deleteUser START', { uid });
      await admin.auth().deleteUser(uid);
      dbg('Firebase Auth deleteUser END', { uid });
      
      res.json({ success: true });
      
      // Background cleanup for scan_events
      (async () => {
        for (const qrDoc of qrSnapshot.docs) {
          const slug = qrDoc.id;
          let hasMore = true;
          while (hasMore) {
            const eventsSnap = await getDocs(query(collection(db, 'scan_events'), where('slug', '==', slug), limit(500)));
            if (eventsSnap.empty) { hasMore = false; break; }
            const cleanupBatch = db.batch();
            eventsSnap.forEach((e: any) => cleanupBatch.delete(e.ref));
            await cleanupBatch.commit();
            if (eventsSnap.size < 500) hasMore = false;
          }
        }
      })().catch(err => {
        logger.error('Cleanup background error:', err);
        console.error('[DBG] Account cleanup background error:', err);
      });
      
    } catch (error) {
      logger.error('Account deletion error:', error);
      dbg('500 Error in DELETE /api/user/account');
      console.error('[500] DELETE /api/user/account error:', error);
      res.status(500).json({ error: 'Failed to delete account' });
    }
  });

  // Billing Checkout API
  app.post('/api/billing/checkout', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'POST', path: '/api/billing/checkout', uid: (req as any).user?.uid });
    try {
      const user = (req as any).user;
      const { plan, interval } = req.body;
      const uid = user.uid;
      
      const prices: Record<string, any> = {
        pro: { monthly: 7, annual: 70 },
        team: { monthly: 29, annual: 290 }
      };
      
      const planPrice = prices[plan];
      if (!planPrice) {
        return res.status(400).json({ error: 'Invalid plan' });
      }

      const amountValue = (interval === 'annual') ? planPrice.annual : planPrice.monthly;
      const recurrenceValue = (interval === 'annual') ? '1 Year' : '1 Month';

      const merchant_id = process.env.PAYHERE_MERCHANT_ID;
      const merchant_secret = process.env.PAYHERE_SECRET;
      
      if (!merchant_id || !merchant_secret) {
        logger.error('Missing PayHere credentials');
        return res.status(500).json({ error: 'Billing configuration error' });
      }
      const order_id = `ORDER_${uid}_${Date.now()}`;
      const amount = amountValue.toFixed(2);
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
        items: `${plan.toUpperCase()} Plan (${interval === 'annual' ? 'Annual' : 'Monthly'})`,
        currency,
        amount,
        first_name: user.name?.split(' ')[0] || 'User',
        last_name: user.name?.split(' ').slice(1).join(' ') || '',
        email: user.email || '',
        phone: '0000000000',
        address: 'N/A',
        city: 'N/A',
        country: 'Sri Lanka',
        hash,
        custom_1: uid,
        custom_2: plan,
        recurrence: recurrenceValue,
        duration: 'Forever'
      };

      res.json(checkoutData);
    } catch (error: any) {
      logger.error('Checkout error:', error);
      dbg('500 Error in POST /api/billing/checkout', { error: error.message });
      console.error('[500] POST /api/billing/checkout error:', error);
      res.status(500).json({ error: 'Failed to generate checkout' });
    }
  });

  // Invoice History API
  app.get('/api/billing/invoices', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/billing/invoices', uid: (req as any).user?.uid });
    try {
      const uid = (req as any).user.uid;
      // Use only a single-field where() to avoid requiring a composite index.
      // Sort and slice in memory — invoice counts are always small.
      dbg('Firestore getDocs START', { collection: 'subscriptions', uid });
      const subs = await getDocs(query(
        collection(db, 'subscriptions'),
        where('uid', '==', uid)
      ));
      dbg('Firestore getDocs END', { collection: 'subscriptions', size: subs.size });
      
      const invoices = subs.docs
        .map((d: any) => ({
          id: d.id,
          ...d.data(),
          _ts: d.data().timestamp?.toMillis?.() || 0,
          date: d.data().timestamp?.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        }))
        .sort((a: any, b: any) => b._ts - a._ts)
        .slice(0, 12)
        .map(({ _ts, ...rest }: any) => rest);
      
      res.json(invoices);
    } catch (error: any) {
      logger.error('Invoice fetch error:', error);
      dbg('500 Error in GET /api/billing/invoices', { error: error.message });
      console.error('[500] GET /api/billing/invoices error:', error);
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  });

  // Addon Checkout API
  app.post('/api/billing/addon/checkout', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'POST', path: '/api/billing/addon/checkout', uid: (req as any).user?.uid });
    try {
      const user = (req as any).user;
      const { addonId } = req.body;
      const uid = user.uid;

      const addon = ADDONS[addonId as AddonId];
      if (!addon) {
        return res.status(400).json({ error: 'Invalid addon' });
      }

      const merchant_id = process.env.PAYHERE_MERCHANT_ID;
      const merchant_secret = process.env.PAYHERE_SECRET;

      if (!merchant_id || !merchant_secret) {
        logger.error('Missing PayHere credentials');
        return res.status(500).json({ error: 'Billing configuration error' });
      }

      const order_id = `ADDON_${uid}_${Date.now()}`;
      const amount = addon.amount_usd.toFixed(2);
      const currency = 'USD';

      const hashedSecret = crypto.createHash('md5').update(merchant_secret).digest('hex').toUpperCase();
      const hashString = `${merchant_id}${order_id}${amount}${currency}${hashedSecret}`;
      const hash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

      const checkoutData = {
        merchant_id,
        return_url: `${appUrl}/settings`,
        cancel_url: `${appUrl}/billing`,
        notify_url: `${appUrl}/api/billing/notify`,
        order_id,
        items: `Addon: ${addon.label}`,
        currency,
        amount,
        first_name: user.name?.split(' ')[0] || 'User',
        last_name: user.name?.split(' ').slice(1).join(' ') || '',
        email: user.email || '',
        phone: '0000000000',
        address: 'N/A',
        city: 'N/A',
        country: 'Sri Lanka',
        hash,
        custom_1: uid,
        custom_2: `addon:${addonId}`,
      };

      res.json(checkoutData);
    } catch (error: any) {
      logger.error('Addon checkout error:', error);
      dbg('500 Error in POST /api/billing/addon/checkout', { error: error.message });
      console.error('[500] POST /api/billing/addon/checkout error:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const generateSlug = customAlphabet(ALPHABET, 7);

  // PayHere Webhook
  app.post('/api/billing/notify', async (req, res) => {
    dbg('ROUTE START', { method: 'POST', path: '/api/billing/notify' });
    try {
      const { 
        merchant_id, order_id, payhere_amount, payhere_currency, 
        status_code, md5sig, custom_1, custom_2 
      } = req.body;

      // Verify PayHere Hash (status_code 2 is success)
      const secret = process.env.PAYHERE_SECRET;
      const hashedSecret = crypto.createHash('md5').update(secret || '').digest('hex').toUpperCase();
      const localHashString = `${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${hashedSecret}`;
      const localHash = crypto.createHash('md5').update(localHashString).digest('hex').toUpperCase();

      if (localHash !== md5sig) {
        logger.warn('PayHere notify: Invalid signature');
        return res.status(401).send('Invalid signature');
      }

      const uid = custom_1;
      const metadata = custom_2; // 'pro', 'team', or 'addon:id'

      if (status_code === '2') {
        logger.info(`Payment successful for user ${uid}: ${metadata}`);
        
        const userRef = doc(db, 'users', uid);

        if (metadata.startsWith('addon:')) {
          const addonId = metadata.split(':')[1] as AddonId;
          const addon = ADDONS[addonId];
          if (addon) {
            const updates: any = {};
            const grants = addon.grants as any;
            if (grants.extra_scans) {
              updates['addons.extra_scans'] = increment(grants.extra_scans);
            }
            if (grants.extra_qr_codes) {
              updates['addons.extra_qr_codes'] = increment(grants.extra_qr_codes);
            }
            if (grants.custom_domain) {
              updates['addons.custom_domain'] = true;
            }
              updates['addons.api_access'] = true;
            }
            
            dbg('Firestore updateDoc START', { collection: 'users', docId: uid });
            await updateDoc(userRef, updates);
            dbg('Firestore updateDoc END', { collection: 'users', docId: uid });
            
            // Log purchase
            dbg('Firestore addDoc START', { collection: 'addon_purchases' });
            await addDoc(collection(db, 'addon_purchases'), {
              uid, addonId, order_id, amount: payhere_amount, timestamp: serverTimestamp()
            });
            dbg('Firestore addDoc END', { collection: 'addon_purchases' });
          }
        } else {
          // Regular Plan Subscription
          const plan = metadata;
          dbg('Firestore getDoc START', { collection: 'users', docId: uid });
          const userSnap = await getDoc(userRef);
          dbg('Firestore getDoc END', { collection: 'users', docId: uid, exists: userSnap.exists() });
          const currentExpiry = userSnap.exists() ? userSnap.data()?.plan_expires_at?.toDate() : null;
          
          const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
          const expiry = new Date(base);
          expiry.setMonth(expiry.getMonth() + 1);

          const planSince = userSnap.exists() && userSnap.data()?.plan_since ? userSnap.data()?.plan_since : new Date().toISOString();

          dbg('Firestore setDoc START', { collection: 'users', docId: uid });
          await setDoc(userRef, {
            plan,
            plan_expires_at: admin.firestore.Timestamp.fromDate(expiry),
            plan_since: planSince,
            is_trial: false,
            updated_at: serverTimestamp(),
            payhere_order_id: order_id
          }, { merge: true });
          dbg('Firestore setDoc END', { collection: 'users', docId: uid });

          // Log subscription
          dbg('Firestore addDoc START', { collection: 'subscriptions' });
          await addDoc(collection(db, 'subscriptions'), {
            uid, plan, order_id, 
            amount: payhere_amount, 
            expires_at: expiry, 
            timestamp: serverTimestamp(),
            status: 'active'
          });
          dbg('Firestore addDoc END', { collection: 'subscriptions' });
        }
      } else if (status_code === '-3') {
        // Subscription Cancelled
        const uid = custom_1;
        logger.info(`Subscription cancelled for user ${uid}`);
        dbg('Firestore updateDoc START', { collection: 'users', docId: uid });
        await updateDoc(doc(db, 'users', uid), { 
          plan: 'free', 
          plan_expires_at: null 
        });
        dbg('Firestore updateDoc END', { collection: 'users', docId: uid });
        // Find most recent subscription and mark as cancelled.
        // Use single-field where() to avoid composite index requirement; sort in memory.
        dbg('Firestore getDocs START', { collection: 'subscriptions', uid });
        const subs = await getDocs(query(collection(db, 'subscriptions'), where('uid', '==', uid)));
        dbg('Firestore getDocs END', { collection: 'subscriptions', size: subs.size });
        if (!subs.empty) {
          const mostRecent = subs.docs.sort((a: any, b: any) => {
            const aTs = a.data().timestamp?.toMillis?.() || 0;
            const bTs = b.data().timestamp?.toMillis?.() || 0;
            return bTs - aTs;
          })[0];
          dbg('Firestore updateDoc START', { collection: 'subscriptions', docId: mostRecent.id });
          await updateDoc(mostRecent.ref, { status: 'cancelled', updated_at: serverTimestamp() });
          dbg('Firestore updateDoc END', { collection: 'subscriptions', docId: mostRecent.id });
        }
      }

      res.send('OK');
    } catch (error: any) {
      logger.error('Billing notify error:', error);
      dbg('500 Error in POST /api/billing/notify', { error: error.message });
      console.error('[500] POST /api/billing/notify error:', error);
      res.status(500).send('Error');
    }
  });
  async function createUniqueSlug(): Promise<string> {
    dbg('createUniqueSlug() START');
    let slug: string, exists: boolean, attempts = 0;
    do {
      slug = generateSlug();
      dbg('Firestore getDoc START', { collection: 'qr_codes', docId: slug });
      const docSnap = await getDoc(doc(db, "qr_codes", slug));
      dbg('Firestore getDoc END', { collection: 'qr_codes', docId: slug, exists: docSnap.exists() });
      exists = docSnap.exists();
      if (++attempts > 10) {
        dbg('createUniqueSlug() FAILED after 10 attempts');
        throw new Error("Slug gen failed");
      }
    } while (exists);
    dbg('createUniqueSlug() END (success)', { slug });
    return slug;
  }

  // ── EXACT SCHEMA CREATION for qr_codes AND qr_stats ─────────
  app.post('/api/qr', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'POST', path: '/api/qr', uid: (req as any).user?.uid });
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
      
      // Visitor Rate Limit (New)
      let visitor_rate_limit = options?.visitor_rate_limit !== undefined ? Number(options.visitor_rate_limit) : 5;
      let visitor_rate_period = options?.visitor_rate_period !== undefined ? Number(options.visitor_rate_period) : 3600;

      logger.info(`Starting QR creation for user ${uid}`, { type: qr_type, is_dynamic });

      // 1. Plan Limit Enforcement
      const license = await getLicense(uid);

      // Force Visitor Guard limits for Free users
      if (!license.limits.visitor_guard_gate) {
        visitor_rate_limit = 5;
        visitor_rate_period = 3600;
        logger.info(`Enforcing hard-coded Visitor Guard for free user ${uid}`);
      }

      logger.info(`Checking limits for plan: ${license.effectivePlan}`, { limits: license.limits });


      let qrSnapshot;
      try {
        dbg('Firestore getDocs START', { collection: 'qr_codes', uid });
        qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
        dbg('Firestore getDocs END', { collection: 'qr_codes', size: qrSnapshot.size });
      } catch (err: any) {
        logger.error('Failed to fetch user QRs for limit check', { error: err.message });
        throw new Error(`QR lookup failed: ${err.message}`);
      }
      
      const activeCount = qrSnapshot.docs.filter((doc: any) => doc.data().is_active !== false).length;
      
      // Sentinel -1 check for unlimited
      if (license.limits.qr_codes !== -1 && activeCount >= license.limits.qr_codes) {
        logger.warn(`User ${uid} reached plan limit (${activeCount}/${license.limits.qr_codes})`);
        return res.status(403).json({ 
          error: 'Plan limit reached. Upgrade to create more QRs.',
          code: 'LIMIT_QR_CODES',
          limit: license.limits.qr_codes === -1 ? 'Unlimited' : license.limits.qr_codes,
          current: activeCount
        });
      }

      // Feature Gates
      if (is_dynamic && !license.limits.dynamic_qr) {
        return res.status(403).json({ error: 'Scnr QR codes require Pro or above', code: 'FEATURE_DYNAMIC_QR' });
      }
      if (options?.password_protect && !license.limits.password_protect) {
        return res.status(403).json({ error: 'Password protection requires Pro plan', code: 'FEATURE_PASSWORD' });
      }
      if (options?.expiry_date_enabled && !license.limits.expiry_gate) {
        return res.status(403).json({ error: 'Expiry dates require Pro plan', code: 'FEATURE_EXPIRY' });
      }
      if (options?.scan_limit_enabled && !license.limits.scan_limit_gate) {
        return res.status(403).json({ error: 'Scan limits require Pro plan', code: 'FEATURE_SCAN_LIMIT' });
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
        visitor_rate_limit,
        visitor_rate_period,
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
        dbg('Firestore batch set START', { collection: 'qr_codes', docId: slug });
        batch.set(doc(db, 'qr_codes', slug), qrDoc);
        dbg('Firestore batch set START', { collection: 'qr_stats', docId: slug });
        batch.set(doc(db, 'qr_stats', slug), statsDoc);
        
        dbg('Firestore batch commit START');
        await batch.commit();
        dbg('Firestore batch commit END');
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
      dbg('500 Error in POST /api/qr', { error: error.message });
      console.error('[500] POST /api/qr error:', error);
      res.status(500).json({ error: error.message || 'Failed to create QR' });
    }
  });

  // List user's QR codes
  app.get('/api/qr', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/qr', uid: (req as any).user?.uid });
    try {
      const uid = (req as any).user.uid;
      // Single field query to avoid index issues
      dbg('Firestore getDocs START', { collection: 'qr_codes', uid });
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      dbg('Firestore getDocs END', { collection: 'qr_codes', size: qrSnapshot.size });
      
      const qrs = await Promise.all(qrSnapshot.docs
        .map(async (docSnap: any) => {
          const data = docSnap.data();
          // Fetch stats for each QR to satisfy dashboard requirements
          dbg('Firestore getDoc START', { collection: 'qr_stats', docId: data.slug });
          const statsSnap = await getDoc(doc(db, 'qr_stats', data.slug));
          dbg('Firestore getDoc END', { collection: 'qr_stats', docId: data.slug, exists: statsSnap.exists() });
          return {
            id: docSnap.id,
            ...data,
            stats: statsSnap.exists() ? statsSnap.data() : null
          };
        }));

      res.json(qrs);
    } catch (error: any) {
      logger.error('QR list error:', error);
      dbg('500 Error in GET /api/qr', { error: error.message });
      console.error('[500] GET /api/qr error:', error);
      res.status(500).json({ error: 'Failed to list QR codes' });
    }
  });

  // Get single QR code
  app.get('/api/qr/:slug', authenticate, requireOwnership, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/qr/:slug', uid: (req as any).user?.uid });
    try {
      const { slug } = req.params;
      dbg('Firestore getDoc START', { collection: 'qr_codes', docId: slug });
      const qrDoc = await getDoc(doc(db, 'qr_codes', slug));
      dbg('Firestore getDoc END', { collection: 'qr_codes', docId: slug, exists: qrDoc.exists() });
      res.json(qrDoc.data());
    } catch (error: any) {
      logger.error('QR fetch error:', error);
      dbg('500 Error in GET /api/qr/:slug', { error: error.message });
      console.error('[500] GET /api/qr/:slug error:', error);
      res.status(500).json({ error: 'Failed to fetch QR code' });
    }
  });

  // Update QR code
  app.put('/api/qr/:slug', async (req, res, next) => {
    dbg('ROUTE START (Pre)', { method: 'PUT', path: `/api/qr/${req.params.slug}` });
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
    dbg('ROUTE START (Final)', { method: 'PUT', path: `/api/qr/${req.params.slug}` });
    try {
      const { slug } = req.params;
      const { destination_url, title, style, is_active, options } = req.body;
      const updateData: any = {};
      
      if (destination_url !== undefined) updateData.destination_url = destination_url;
      if (title !== undefined) updateData.title = title;
      if (style !== undefined) updateData.style = style;
      if (is_active !== undefined) updateData.is_active = is_active;
      
      if (options && (req as any).user) {
        dbg('getLicense() START (in PUT /api/qr/:slug)', { uid: (req as any).user.uid });
        const license = await getLicense((req as any).user.uid);

        if (options.expiry_date_enabled !== undefined) {
          if (options.expiry_date_enabled && !license.limits.expiry_gate) {
            return res.status(403).json({ error: 'Expiry dates require Pro plan', code: 'FEATURE_EXPIRY' });
          }
          updateData.expiry_date = options.expiry_date_enabled ? options.expiry_date : null;
        }
        if (options.scan_limit_enabled !== undefined) {
          if (options.scan_limit_enabled && !license.limits.scan_limit_gate) {
            return res.status(403).json({ error: 'Scan limits require Pro plan', code: 'FEATURE_SCAN_LIMIT' });
          }
          updateData['rate_limit.enabled'] = options.scan_limit_enabled;
          updateData['rate_limit.max_scans'] = options.scan_limit;
          updateData['rate_limit.period'] = 'total';
        }

        if (options.visitor_rate_limit !== undefined) {
          updateData.visitor_rate_limit = license.limits.visitor_guard_gate ? Number(options.visitor_rate_limit) : 5;
        }
        if (options.visitor_rate_period !== undefined) {
          updateData.visitor_rate_period = license.limits.visitor_guard_gate ? Number(options.visitor_rate_period) : 3600;
        }

        if (options.password_protect !== undefined) {
          if (options.password_protect) {
            if (!license.limits.password_protect) {
              return res.status(403).json({ error: 'Password protection requires Pro plan', code: 'FEATURE_PASSWORD' });
            }
            if (options.password) {
              updateData.password_hash = crypto.createHash('sha256').update(options.password + slug).digest('hex');
            }
          } else {
            updateData.password_hash = null;
          }
        }
      }
      
      dbg('Firestore updateDoc START', { collection: 'qr_codes', docId: slug });
      await updateDoc(doc(db, 'qr_codes', slug), updateData);
      dbg('Firestore updateDoc END', { collection: 'qr_codes', docId: slug });
      res.json({ success: true, slug });
    } catch (error: any) {
      logger.error('QR update error:', error);
      dbg('500 Error in PUT /api/qr/:slug', { error: error.message });
      console.error('[500] PUT /api/qr/:slug error:', error);
      res.status(500).json({ error: 'Failed to update QR code' });
    }
  });

  // Delete QR code
  app.delete('/api/qr/:slug', authenticate, requireOwnership, async (req, res) => {
    dbg('ROUTE START', { method: 'DELETE', path: '/api/qr/:slug', uid: (req as any).user?.uid });
    try {
      const { slug } = req.params;
      
      // Batch delete code, stats, and (optionally) some events
      // For now, keep it simple with codes and stats
      const batch = db.batch();
      dbg('Firestore batch delete START', { collection: 'qr_codes', docId: slug });
      batch.delete(doc(db, 'qr_codes', slug));
      dbg('Firestore batch delete START', { collection: 'qr_stats', docId: slug });
      batch.delete(doc(db, 'qr_stats', slug));
      
      dbg('Firestore batch commit START (delete QR)');
      await batch.commit();
      dbg('Firestore batch commit END (delete QR)');

      res.json({ message: 'QR code deleted successfully' });

      // Purge Worker Cache
      const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
      fetch(`${appUrl}/internal/purge/${slug}`, {
        headers: { 'x-internal-secret': process.env.INTERNAL_SECRET || '' }
      }).catch(err => {
        logger.error(`Cache purge failed for ${slug}`, err);
        console.error(`[DBG] Cache purge failed for ${slug}:`, err);
      });

      // Phase 12: Background orphan scan_events cleanup
      (async () => {
        let deletedTotal = 0;
        let hasMore = true;
        while (hasMore) {
          const eventsSnap = await getDocs(query(collection(db, 'scan_events'), where('slug', '==', slug), limit(500)));
          if (eventsSnap.empty) {
            hasMore = false;
            break;
          }
          const cleanupBatch = db.batch();
          eventsSnap.forEach((d: any) => cleanupBatch.delete(d.ref));
          await cleanupBatch.commit();
          deletedTotal += eventsSnap.size;
          if (eventsSnap.size < 500) hasMore = false;
        }
        logger.info(`Cleaned up ${deletedTotal} scan events for deleted QR ${slug}`);
      })().catch(err => {
        logger.error('scan_events cleanup failed', err);
        console.error('[DBG] scan_events cleanup background error:', err);
      });

    } catch (error: any) {
      logger.error('QR delete error:', error);
      dbg('500 Error in DELETE /api/qr/:slug', { error: error.message });
      console.error('[500] DELETE /api/qr/:slug error:', error);
      res.status(500).json({ error: 'Failed to delete QR code' });
    }
  });

  // Analytics API
  app.get('/api/analytics/:slug/summary', authenticate, requireOwnership, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/:slug/summary', uid: (req as any).user?.uid });
    try {
      const { slug } = req.params;
      dbg('Firestore getDoc START', { collection: 'qr_stats', docId: slug });
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      dbg('Firestore getDoc END', { collection: 'qr_stats', docId: slug, exists: statsDoc.exists() });
      
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
    } catch (error: any) {
      logger.error('Analytics error:', error);
      dbg('500 Error in GET /api/analytics/:slug/summary', { error: error.message });
      console.error('[500] GET /api/analytics/:slug/summary error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/timeseries', authenticate, requireOwnership, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/:slug/timeseries', uid: (req as any).user?.uid });
    try {
      const { slug } = req.params;
      const userUid = (req as any).user.uid;
      dbg('getLicense() START (in analytics timeseries)', { uid: userUid });
      const license = await getLicense(userUid);
      
      const startParam = req.query.start as string;
      const endParam = req.query.end as string;
      let days = parseInt(req.query.days as string) || 30;
      
      const dailyStats: Record<string, any> = {};
      
      if (startParam && endParam) {
        const start = new Date(startParam);
        const end = new Date(endParam);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        
        // Enforcement: cap by plan limit if needed (optional, usually range is fine)
        
        for (let i = 0; i < diffDays; i++) {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const dateStr = d.toISOString().split('T')[0];
          dailyStats[dateStr] = { date: dateStr, total_scans: 0, unique_scans: 0, mobile_scans: 0 };
        }
      } else {
        // Backend enforcement: cap days by plan limit
        if (days > license.limits.analytics_days) {
          days = license.limits.analytics_days;
        }
        
        // Initialize all days
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          dailyStats[dateStr] = { date: dateStr, total_scans: 0, unique_scans: 0, mobile_scans: 0 };
        }
      }
      
      dbg('Firestore getDoc START', { collection: 'qr_stats', docId: slug });
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      dbg('Firestore getDoc END', { collection: 'qr_stats', docId: slug, exists: statsDoc.exists() });

      if (statsDoc.exists()) {
        const data = statsDoc.data()!;
        const daysData = data.days || {};
        const totalScans = data.total_scans || 1; // avoid div by zero
        const totalUnique = data.unique_scans || 0;
        
        for (const [dateStr, count] of Object.entries(daysData)) {
          if (dailyStats[dateStr]) {
            const dayCount = count as number;
            dailyStats[dateStr].total_scans = dayCount;
            // Approximate unique per day proportionally from the overall ratio
            dailyStats[dateStr].unique_scans = Math.round(dayCount * (totalUnique / totalScans));
          }
        }
      }

      res.json(Object.values(dailyStats));
    } catch (error: any) {
      logger.error('Analytics error:', error);
      dbg('500 Error in GET /api/analytics/:slug/timeseries', { error: error.message });
      console.error('[500] GET /api/analytics/:slug/timeseries error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/devices', authenticate, requireOwnership, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/:slug/devices', uid: (req as any).user?.uid });
    try {
      const { slug } = req.params;
      dbg('Firestore getDoc START', { collection: 'qr_stats', docId: slug });
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      dbg('Firestore getDoc END', { collection: 'qr_stats', docId: slug, exists: statsDoc.exists() });
      
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
    } catch (error: any) {
      logger.error('Analytics error:', error);
      dbg('500 Error in GET /api/analytics/:slug/devices', { error: error.message });
      console.error('[500] GET /api/analytics/:slug/devices error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/countries', authenticate, requireOwnership, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/:slug/countries', uid: (req as any).user?.uid });
    try {
      const { slug } = req.params;
      dbg('Firestore getDoc START', { collection: 'qr_stats', docId: slug });
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      dbg('Firestore getDoc END', { collection: 'qr_stats', docId: slug, exists: statsDoc.exists() });
      
      if (!statsDoc.exists()) return res.json([]);
      
      const data = statsDoc.data()!;
      const countries = data.countries || {};
      
      const result = Object.entries(countries).map(([country, scans]) => ({
        country,
        scans: scans as number,
        unique_visitors: 0 // Not tracked per country in new schema
      })).sort((a, b) => b.scans - a.scans).slice(0, 10);

      res.json(result);
    } catch (error: any) {
      logger.error('Analytics error:', error);
      dbg('500 Error in GET /api/analytics/:slug/countries', { error: error.message });
      console.error('[500] GET /api/analytics/:slug/countries error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/os', authenticate, requireOwnership, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/:slug/os', uid: (req as any).user?.uid });
    try {
      const { slug } = req.params;
      dbg('Firestore getDoc START', { collection: 'qr_stats', docId: slug });
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      dbg('Firestore getDoc END', { collection: 'qr_stats', docId: slug, exists: statsDoc.exists() });
      
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
    } catch (error: any) {
      logger.error('Analytics error:', error);
      dbg('500 Error in GET /api/analytics/:slug/os', { error: error.message });
      console.error('[500] GET /api/analytics/:slug/os error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/browsers', authenticate, requireOwnership, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/:slug/browsers', uid: (req as any).user?.uid });
    try {
      const { slug } = req.params;
      dbg('Firestore getDoc START', { collection: 'qr_stats', docId: slug });
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      dbg('Firestore getDoc END', { collection: 'qr_stats', docId: slug, exists: statsDoc.exists() });
      
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
    } catch (error: any) {
      logger.error('Analytics error:', error);
      dbg('500 Error in GET /api/analytics/:slug/browsers', { error: error.message });
      console.error('[500] GET /api/analytics/:slug/browsers error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/referrers', authenticate, requireOwnership, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/:slug/referrers', uid: (req as any).user?.uid });
    try {
      const { slug } = req.params;
      dbg('Firestore getDoc START', { collection: 'qr_stats', docId: slug });
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      dbg('Firestore getDoc END', { collection: 'qr_stats', docId: slug, exists: statsDoc.exists() });
      
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
    } catch (error: any) {
      logger.error('Analytics error:', error);
      dbg('500 Error in GET /api/analytics/:slug/referrers', { error: error.message });
      console.error('[500] GET /api/analytics/:slug/referrers error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/analytics/:slug/recent', authenticate, requireOwnership, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/:slug/recent', uid: (req as any).user?.uid });
    try {
      const { slug } = req.params;
      // For recent, we still query scan_events but limit it to 10
      dbg('Firestore getDocs START', { collection: 'scan_events', slug });
      const snapshot = await getDocs(query(collection(db, 'scan_events'), where('slug', '==', slug), orderBy('scanned_at', 'desc'), limit(10)));
      dbg('Firestore getDocs END', { collection: 'scan_events', size: snapshot.size });
      
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
    } catch (error: any) {
      logger.error('Analytics error:', error);
      dbg('500 Error in GET /api/analytics/:slug/recent', { error: error.message });
      console.error('[500] GET /api/analytics/:slug/recent error:', error);
      res.status(500).json({ error: 'Failed to fetch recent scans' });
    }
  });

  app.get('/api/analytics/:slug/advanced', authenticate, requireOwnership, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/:slug/advanced', uid: (req as any).user?.uid });
    try {
      const { slug } = req.params;
      dbg('Firestore getDoc START', { collection: 'qr_stats', docId: slug });
      const statsDoc = await getDoc(doc(db, 'qr_stats', slug));
      dbg('Firestore getDoc END', { collection: 'qr_stats', docId: slug, exists: statsDoc.exists() });
      
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
    } catch (error: any) {
      logger.error('Analytics error:', error);
      dbg('500 Error in GET /api/analytics/:slug/advanced', { error: error.message });
      console.error('[500] GET /api/analytics/:slug/advanced error:', error);
      res.status(500).json({ error: 'Failed to fetch advanced analytics' });
    }
  });

  app.get('/api/analytics/account/:uid', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/account/:uid', uid: (req as any).user?.uid });
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      
      if (decodedUser.uid !== uid) {
        return res.status(403).send('Forbidden');
      }
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      dbg('Firestore getDocs START', { collection: 'qr_codes', uid });
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      dbg('Firestore getDocs END', { collection: 'qr_codes', size: qrSnapshot.size });
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
        dbg('Firestore getDocs START (chunk)', { collection: 'qr_stats', count: chunk.length });
        const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
        dbg('Firestore getDocs END (chunk)', { collection: 'qr_stats', size: statsSnapshot.size });
        statsSnapshot.forEach(doc => {
          const data = doc.data();
          total_scans += (data.total_scans || 0);
          unique_visitors += (data.unique_scans || 0);
          
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
    } catch (error: any) {
      logger.error('Account analytics error:', error);
      dbg('500 Error in GET /api/analytics/account/:uid', { error: error.message });
      console.error('[500] GET /api/analytics/account/:uid error:', error);
      res.status(500).json({ error: 'Failed to fetch account analytics' });
    }
  });

  app.get('/api/analytics/account/:uid/timeseries', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/account/:uid/timeseries', uid: (req as any).user?.uid });
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      
      if (decodedUser.uid !== uid) {
        return res.status(403).send('Forbidden');
      }

      dbg('getLicense() START (in account analytics timeseries)', { uid });
      const license = await getLicense(uid);
      const startParam = req.query.start as string;
      const endParam = req.query.end as string;
      let days = parseInt(req.query.days as string) || 30;
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;

      let slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (requestedSlugs) {
        slugs = slugs.filter(s => requestedSlugs.includes(s));
      }

      const dailyStats: Record<string, any> = {};
      
      if (startParam && endParam) {
        const start = new Date(startParam);
        const end = new Date(endParam);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        
        for (let i = 0; i < diffDays; i++) {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const dateStr = d.toISOString().split('T')[0];
          dailyStats[dateStr] = { date: dateStr, total_scans: 0, unique_scans: 0 };
        }
      } else {
        // Backend enforcement: cap days by plan limit
        if (days > license.limits.analytics_days) {
          days = license.limits.analytics_days;
        }
        
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          dailyStats[dateStr] = { date: dateStr, total_scans: 0, unique_scans: 0 };
        }
      }

      if (slugs.length > 0) {
        const chunks = [];
        for (let i = 0; i < slugs.length; i += 30) {
          chunks.push(slugs.slice(i, i + 30));
        }

        for (const chunk of chunks) {
          const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
          logger.info(`Timeseries aggregation: chunk found ${statsSnapshot.size} stats docs`);
          statsSnapshot.forEach(doc => {
            const data = doc.data();
            const daysData = data.days || {};
            const totalScans = (data.total_scans || 1) as number;
            const totalUnique = (data.unique_scans || 0) as number;
            
            for (const [dateStr, count] of Object.entries(daysData)) {
              if (dailyStats[dateStr]) {
                const dayCount = count as number;
                dailyStats[dateStr].total_scans += dayCount;
                // Heuristic for unique scans per day based on historical ratio
                dailyStats[dateStr].unique_scans += Math.round(dayCount * (totalUnique / totalScans));
              }
            }
          });
        }
      }

      res.json(Object.values(dailyStats));
    } catch (error: any) {
      logger.error('Account timeseries error:', error);
      dbg('500 Error in GET /api/analytics/account/:uid/timeseries', { error: error.message });
      console.error('[500] GET /api/analytics/account/:uid/timeseries error:', error);
      res.status(500).json({ error: 'Failed to fetch account timeseries' });
    }
  });

  app.get('/api/analytics/account/:uid/devices', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/account/:uid/devices', uid: (req as any).user?.uid });
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      
      if (decodedUser.uid !== uid) {
        return res.status(403).send('Forbidden');
      }
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      dbg('Firestore getDocs START', { collection: 'qr_codes', uid });
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      dbg('Firestore getDocs END', { collection: 'qr_codes', size: qrSnapshot.size });
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
          dbg('Firestore getDocs START (chunk)', { collection: 'qr_stats', count: chunk.length });
          const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
          dbg('Firestore getDocs END (chunk)', { collection: 'qr_stats', size: statsSnapshot.size });
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
    } catch (error: any) {
      logger.error('Account devices error:', error);
      dbg('500 Error in GET /api/analytics/account/:uid/devices', { error: error.message });
      console.error('[500] GET /api/analytics/account/:uid/devices error:', error);
      res.status(500).json({ error: 'Failed to fetch account devices' });
    }
  });

  app.get('/api/analytics/account/:uid/countries', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/account/:uid/countries', uid: (req as any).user?.uid });
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      
      if (decodedUser.uid !== uid) {
        return res.status(403).send('Forbidden');
      }
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      dbg('Firestore getDocs START', { collection: 'qr_codes', uid });
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      dbg('Firestore getDocs END', { collection: 'qr_codes', size: qrSnapshot.size });
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
          dbg('Firestore getDocs START (chunk)', { collection: 'qr_stats', count: chunk.length });
          const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
          dbg('Firestore getDocs END (chunk)', { collection: 'qr_stats', size: statsSnapshot.size });
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
    } catch (error: any) {
      logger.error('Account countries error:', error);
      dbg('500 Error in GET /api/analytics/account/:uid/countries', { error: error.message });
      console.error('[500] GET /api/analytics/account/:uid/countries error:', error);
      res.status(500).json({ error: 'Failed to fetch account countries' });
    }
  });

  app.get('/api/analytics/account/:uid/browsers', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/account/:uid/browsers', uid: (req as any).user?.uid });
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      if (decodedUser.uid !== uid) return res.status(403).send('Forbidden');
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      dbg('Firestore getDocs START', { collection: 'qr_codes', uid });
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      dbg('Firestore getDocs END', { collection: 'qr_codes', size: qrSnapshot.size });
      let slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (requestedSlugs) {
        slugs = slugs.filter(s => requestedSlugs.includes(s));
      }

      const browsers: Record<string, number> = {};
      if (slugs.length > 0) {
        const chunks = [];
        for (let i = 0; i < slugs.length; i += 30) chunks.push(slugs.slice(i, i + 30));
        for (const chunk of chunks) {
          dbg('Firestore getDocs START (chunk)', { collection: 'qr_stats', count: chunk.length });
          const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
          dbg('Firestore getDocs END (chunk)', { collection: 'qr_stats', size: statsSnapshot.size });
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
    } catch (error: any) {
      logger.error('Account browsers error:', error);
      dbg('500 Error in GET /api/analytics/account/:uid/browsers', { error: error.message });
      console.error('[500] GET /api/analytics/account/:uid/browsers error:', error);
      res.status(500).json({ error: 'Failed to fetch account browsers' });
    }
  });

  app.get('/api/analytics/account/:uid/os', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/account/:uid/os', uid: (req as any).user?.uid });
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      if (decodedUser.uid !== uid) return res.status(403).send('Forbidden');
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      dbg('Firestore getDocs START', { collection: 'qr_codes', uid });
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      dbg('Firestore getDocs END', { collection: 'qr_codes', size: qrSnapshot.size });
      let slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (requestedSlugs) {
        slugs = slugs.filter(s => requestedSlugs.includes(s));
      }

      const os: Record<string, number> = {};
      if (slugs.length > 0) {
        const chunks = [];
        for (let i = 0; i < slugs.length; i += 30) chunks.push(slugs.slice(i, i + 30));
        for (const chunk of chunks) {
          dbg('Firestore getDocs START (chunk)', { collection: 'qr_stats', count: chunk.length });
          const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
          dbg('Firestore getDocs END (chunk)', { collection: 'qr_stats', size: statsSnapshot.size });
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
    } catch (error: any) {
      logger.error('Account OS error:', error);
      dbg('500 Error in GET /api/analytics/account/:uid/os', { error: error.message });
      console.error('[500] GET /api/analytics/account/:uid/os error:', error);
      res.status(500).json({ error: 'Failed to fetch account OS' });
    }
  });

  app.get('/api/analytics/account/:uid/referrers', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/account/:uid/referrers', uid: (req as any).user?.uid });
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      if (decodedUser.uid !== uid) return res.status(403).send('Forbidden');
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      dbg('Firestore getDocs START', { collection: 'qr_codes', uid });
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      dbg('Firestore getDocs END', { collection: 'qr_codes', size: qrSnapshot.size });
      let slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (requestedSlugs) {
        slugs = slugs.filter(s => requestedSlugs.includes(s));
      }

      const referrers: Record<string, number> = {};
      if (slugs.length > 0) {
        const chunks = [];
        for (let i = 0; i < slugs.length; i += 30) chunks.push(slugs.slice(i, i + 30));
        for (const chunk of chunks) {
          dbg('Firestore getDocs START (chunk)', { collection: 'qr_stats', count: chunk.length });
          const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
          dbg('Firestore getDocs END (chunk)', { collection: 'qr_stats', size: statsSnapshot.size });
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
    } catch (error: any) {
      logger.error('Account referrers error:', error);
      dbg('500 Error in GET /api/analytics/account/:uid/referrers', { error: error.message });
      console.error('[500] GET /api/analytics/account/:uid/referrers error:', error);
      res.status(500).json({ error: 'Failed to fetch account referrers' });
    }
  });

  app.get('/api/analytics/account/:uid/summary', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/account/:uid/summary', uid: (req as any).user?.uid });
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      if (decodedUser.uid !== uid) return res.status(403).send('Forbidden');
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      dbg('Firestore getDocs START', { collection: 'qr_codes', uid });
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      dbg('Firestore getDocs END', { collection: 'qr_codes', size: qrSnapshot.size });
      let slugs = qrSnapshot.docs.map(doc => doc.data().slug);
      
      if (requestedSlugs) {
        slugs = slugs.filter(s => requestedSlugs.includes(s));
      }

      let total_scans = 0, unique_visitors = 0;
      if (slugs.length > 0) {
        const chunks = [];
        for (let i = 0; i < slugs.length; i += 30) chunks.push(slugs.slice(i, i + 30));
        for (const chunk of chunks) {
          dbg('Firestore getDocs START (chunk)', { collection: 'qr_stats', count: chunk.length });
          const statsSnapshot = await getDocs(query(collection(db, 'qr_stats'), where(documentId(), 'in', chunk)));
          dbg('Firestore getDocs END (chunk)', { collection: 'qr_stats', size: statsSnapshot.size });
          statsSnapshot.forEach(doc => {
            const data = doc.data();
            total_scans += (data.total_scans || 0);
            unique_visitors += (data.unique_scans || 0);
          });
        }
      }
      res.json({ total_scans, unique_visitors, total_qrs: slugs.length });
    } catch (error: any) {
      logger.error('Account summary error:', error);
      dbg('500 Error in GET /api/analytics/account/:uid/summary', { error: error.message });
      console.error('[500] GET /api/analytics/account/:uid/summary error:', error);
      res.status(500).json({ error: 'Failed to fetch account summary' });
    }
  });

  app.get('/api/analytics/account/:uid/recent', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/account/:uid/recent', uid: (req as any).user?.uid });
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      
      if (decodedUser.uid !== uid) {
        return res.status(403).send('Forbidden');
      }
      
      const requestedSlugs = req.query.slugs ? (req.query.slugs as string).split(',') : null;
      dbg('Firestore getDocs START', { collection: 'qr_codes', uid });
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      dbg('Firestore getDocs END', { collection: 'qr_codes', size: qrSnapshot.size });
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
        dbg('Firestore getDocs START (chunk)', { collection: 'scan_events', count: chunk.length });
        const scansSnapshot = await getDocs(query(collection(db, 'scan_events'), where('slug', 'in', chunk), orderBy('scanned_at', 'desc'), limit(20)));
        dbg('Firestore getDocs END (chunk)', { collection: 'scan_events', size: scansSnapshot.size });
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
    } catch (error: any) {
      logger.error('Account recent scans error:', error);
      dbg('500 Error in GET /api/analytics/account/:uid/recent', { error: error.message });
      console.error('[500] GET /api/analytics/account/:uid/recent error:', error);
      res.status(500).json({ error: 'Failed to fetch account recent scans' });
    }
  });

  app.get('/api/analytics/account/:uid/performance', authenticate, async (req, res) => {
    dbg('ROUTE START', { method: 'GET', path: '/api/analytics/account/:uid/performance', uid: (req as any).user?.uid });
    try {
      const { uid } = req.params;
      const decodedUser = (req as any).user;
      
      if (decodedUser.uid !== uid) {
        return res.status(403).send('Forbidden');
      }
      dbg('Firestore getDocs START', { collection: 'qr_codes', uid });
      const qrSnapshot = await getDocs(query(collection(db, 'qr_codes'), where('user_uid', '==', uid)));
      dbg('Firestore getDocs END', { collection: 'qr_codes', size: qrSnapshot.size });
      
      const performanceData = [];
      
      for (const docSnap of qrSnapshot.docs) {
        const qrData = docSnap.data();
        dbg('Firestore getDoc START', { collection: 'qr_stats', docId: qrData.slug });
        const statsDoc = await getDoc(doc(db, 'qr_stats', qrData.slug));
        dbg('Firestore getDoc END', { collection: 'qr_stats', docId: qrData.slug, exists: statsDoc.exists() });
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
    } catch (error: any) {
      logger.error('Account performance error:', error);
      dbg('500 Error in GET /api/analytics/account/:uid/performance', { error: error.message });
      console.error('[500] GET /api/analytics/account/:uid/performance error:', error);
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
      
      const { slug } = req.body;
      const currentMonth = new Date().toISOString().slice(0, 7); // "2026-03"

      dbg('Firestore getDoc START (internal scan)', { slug });
      const [qrSnap, statsSnap] = await Promise.all([
        getDoc(doc(db, 'qr_codes', slug)),
        getDoc(doc(db, 'qr_stats', slug))
      ]);
      dbg('Firestore getDoc END (internal scan)', { 
        slug, 
        qrExists: qrSnap.exists(), 
        statsExists: statsSnap.exists() 
      });

      if (!qrSnap.exists()) {
        return res.status(404).json({ error: 'QR not found' });
      }

      const qrOwnerUid = qrSnap.data().user_uid;
      dbg('getLicense() START (in internal scan)', { uid: qrOwnerUid });
      const license = await getLicense(qrOwnerUid);
      const monthlyScans = statsSnap.data()?.monthly_scans?.[currentMonth] || 0;

      if (monthlyScans >= license.limits.monthly_scans) {
        logger.warn(`Monthly scan quota exceeded for user ${qrOwnerUid} on slug ${slug}`);
        return res.status(429).json({ blocked: true, reason: 'monthly_quota' });
      }

      await captureAnalyticsFromPayload(req.body, qrOwnerUid);
      res.send('OK');
    } catch (error: any) {
      logger.error('Internal scan error details:', { 
        message: error.message, 
        slug: req.body?.slug,
        stack: error.stack 
      });
      dbg('500 Error in POST /internal/scan', { error: error.message });
      console.error('[500] POST /internal/scan error:', error);
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
      dbg('Firestore getDoc START (internal slug)', { slug });
      const [qrDoc, statsDoc] = await Promise.all([
        getDoc(doc(db, 'qr_codes', slug)),
        getDoc(doc(db, 'qr_stats', slug))
      ]);
      dbg('Firestore getDoc END (internal slug)', { slug, qrExists: qrDoc.exists() });

      if (!qrDoc.exists()) {
        return res.status(404).send('Not Found');
      }

      const qr = qrDoc.data();
      dbg('Firestore getDoc START (internal user)', { uid: qr.user_uid });
      const userDoc = await getDoc(doc(db, 'users', qr.user_uid));
      dbg('Firestore getDoc END (internal user)', { uid: qr.user_uid, exists: userDoc.exists() });
      const userPlan = userDoc.exists() ? userDoc.data().plan : 'free';
      const stats = statsDoc.exists() ? statsDoc.data() : { total_scans: 0 };

      // Return compact gate config for Worker
      const responseBody = {
        destination_url: qr.destination_url,
        is_active: qr.is_active,
        expiry_date: qr.expiry_date || null,
        password_hash: qr.password_hash || null,
        scan_limit: qr.rate_limit?.enabled ? qr.rate_limit.max_scans : null,
        total_scans: stats.total_scans || 0,
        visitor_rate_limit: qr.visitor_rate_limit !== undefined ? qr.visitor_rate_limit : 5,
        visitor_rate_period: qr.visitor_rate_period !== undefined ? qr.visitor_rate_period : 3600,
        owner_plan: userPlan 
      };

      logger.info(`Returning config for slug ${slug}:`, { 
        has_password: !!responseBody.password_hash,
        is_active: responseBody.is_active 
      });

      res.json(responseBody);
    } catch (error: any) {
      logger.error('Internal fetch error:', error);
      dbg('500 Error in GET /internal/slug/:slug', { error: error.message });
      console.error('[500] GET /internal/slug/:slug error:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  // Redirect Engine (Local Dev fallback)
  app.get('/:slug', async (req, res, next) => {
    const { slug } = req.params;
    dbg('REDIRECT START', { slug, path: req.path });
    
    // Ignore static assets and API routes
    if (slug.startsWith('api') || slug.startsWith('assets') || slug.includes('.')) {
      dbg('REDIRECT IGNORED (asset/api)', { slug });
      return next();
    }

    try {
      // 1. Look up destination
      dbg('Firestore getDoc START (redirect)', { collection: 'qr_codes', docId: slug });
      const qrDoc = await getDoc(doc(db, 'qr_codes', slug));
      dbg('Firestore getDoc END (redirect)', { collection: 'qr_codes', docId: slug, exists: qrDoc.exists() });
      
      if (!qrDoc.exists()) {
        dbg('REDIRECT FAILED (qr not found)', { slug });
        return next(); // Let Vite handle it (might be a frontend route)
      }

      const qrData = qrDoc.data()!;

      if (!qrData.is_active) {
        dbg('REDIRECT BLOCKED (inactive)', { slug });
        return res.status(410).send('QR code inactive');
      }

      // 2. Fire analytics async (don't block redirect)
      dbg('captureAnalytics START (async)', { slug });
      captureAnalytics(req, slug).catch(err => {
        logger.error('Analytics capture failed', { error: err });
        console.error('[DBG] captureAnalytics background error:', err);
      });

      // 3. Handle different QR types
      if (qrData.qr_type === 'vcard') {
        const content = qrData.content_data;
        const vcard = `BEGIN:VCARD\nVERSION:3.0\nN:${content?.last_name || ''};${content?.first_name || ''}\nFN:${content?.first_name || ''} ${content?.last_name || ''}\nTEL:${content?.phone || ''}\nEMAIL:${content?.email || ''}\nORG:${content?.company || ''}\nURL:${content?.website || ''}\nEND:VCARD`;
        res.setHeader('Content-Type', 'text/vcard');
        res.setHeader('Content-Disposition', `attachment; filename="${content?.first_name || 'contact'}.vcf"`);
        dbg('REDIRECT TYPE: vcard', { slug });
        return res.send(vcard);
      } else if (qrData.qr_type === 'text') {
        const text = qrData.content_data?.text || '';
        dbg('REDIRECT TYPE: text', { slug });
        return res.send(`<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family: sans-serif; padding: 20px; white-space: pre-wrap; word-break: break-word;">${escapeHtml(text)}</body></html>`);
      } else if (qrData.qr_type === 'email') {
        const content = qrData.content_data;
        const mailto = `mailto:${content?.email || ''}?subject=${encodeURIComponent(content?.subject || '')}&body=${encodeURIComponent(content?.body || '')}`;
        dbg('REDIRECT TYPE: email', { slug, mailto });
        return res.redirect(302, mailto);
      } else if (qrData.qr_type === 'wifi') {
        // WiFi should ideally be static, but if dynamic, just show the details
        const content = qrData.content_data;
        dbg('REDIRECT TYPE: wifi', { slug });
        return res.send(`<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family: sans-serif; padding: 20px;"><h2>WiFi Network</h2><p><strong>SSID:</strong> ${escapeHtml(content?.ssid || '')}</p><p><strong>Password:</strong> ${escapeHtml(content?.password || '')}</p><p><strong>Security:</strong> ${escapeHtml(content?.encryption || '')}</p></body></html>`);
      }

      const destination = qrData.destination_url;
      if (!destination) {
        dbg('REDIRECT FAILED (no destination)', { slug });
        return res.status(404).send('Destination not found');
      }

      // Redirect immediately
      dbg('REDIRECT SUCCESS', { slug, destination });
      return res.redirect(302, destination);
    } catch (error: any) {
      logger.error('Redirect error', { error });
      dbg('REDIRECT ERROR (500)', { slug, error: error.message });
      console.error('[500] Redirect engine error:', error);
      next();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT}`);
    });
  }
  return app;
}

await startServer().catch((err) => {
  logger.error('Server startup failed', err);
  console.error('[FATAL] Server startup failed:', err);
  process.exit(1);
});

// Analytics Capture Logic
async function captureAnalyticsFromPayload(payload: any, qrOwnerUid?: string) {
  const { slug, ip, ua, country, asn, colo, tls, lang, is_eu, is_unique: payloadIsUnique, status } = payload;
  if (isBot(ua)) return;

  const today = new Date().toISOString().slice(0, 10);
  const fingerprint = `${ip}:${ua.slice(0, 100)}:${today}:${process.env.HASH_SALT || ''}`;
  const visitorHash = crypto.createHash('sha256').update(fingerprint).digest('hex');

  let isUnique = payloadIsUnique;
  if (isUnique === undefined) {
    isUnique = true;
    logger.debug(`Uniqueness flag missing for slug ${slug}, defaulting to true`);
  }

  const parsed = parseUA(ua);
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const hourStr = now.getHours().toString();

  const isFailed = status === 'failed_password';

  // 1. EXACT SCHEMA for scan_events
  dbg('Firestore addDoc START (scan_events)', { slug });
  await addDoc(collection(db, 'scan_events'), {
    slug,
    date: dateStr,
    country: country || 'Unknown',
    device: parsed.device,
    browser: parsed.browser,
    os: parsed.os,
    is_unique: isUnique,
    scanned_at: serverTimestamp(),
    visitor_hash: visitorHash,
    asn: asn || null,
    colo: colo || null,
    lang: lang || null,
    tls: tls || null,
    is_eu: is_eu || false,
    status: status || 'success'
  });
  dbg('Firestore addDoc END (scan_events)', { slug });

  // 2. EXACT SCHEMA for qr_stats
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
    if (isUnique) updateData.unique_scans = inc;

    // Track monthly scans for quota enforcement
    const currentMonth = new Date().toISOString().slice(0, 7);
    updateData[`monthly_scans.${currentMonth}`] = inc;

    // OPTIMIZATION: Maintain per-user monthly counter to avoid O(N) reads on billing page
    if (qrOwnerUid) {
      dbg('Firestore updateDoc START (user monthly scans)', { uid: qrOwnerUid });
      await updateDoc(doc(db, 'users', qrOwnerUid), {
        [`monthly_scans.${currentMonth}`]: inc
      }).catch(err => {
        logger.error('User monthly_scans update failed', err);
        console.error('[DBG] User monthly_scans update background error:', err);
      });
    }
  }

  dbg('Firestore setDoc START (qr_stats merge)', { slug });
  await setDoc(statsRef, updateData, { merge: true });
  dbg('Firestore setDoc END (qr_stats merge)', { slug });
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

  // For internal dev redirects, find the owner too
  dbg('Firestore getDoc START (captureAnalytics)', { slug });
  const qrSnap = await getDoc(doc(db, 'qr_codes', slug));
  dbg('Firestore getDoc END (captureAnalytics)', { slug, exists: qrSnap.exists() });
  const ownerUid = qrSnap.exists() ? qrSnap.data()?.user_uid : undefined;

  await captureAnalyticsFromPayload(payload, ownerUid);
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isBot(ua: string) {
  return /bot|crawler|spider|preview|facebookexternalhit|googlebot|twitterbot|slackbot|whatsapp|telegram/i.test(ua);
}

function classifyReferer(referer: string) {
  if (!referer) return 'direct';
  if (/android-app:|ios-app:/.test(referer)) return 'app';
  return 'browser';
}

export default app;

