import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import admin from "firebase-admin";
import crypto from "crypto";
import { customAlphabet } from "nanoid";

// ────────────────────────────────────────────────────────────────
// Initialize Firebase Admin
// ────────────────────────────────────────────────────────────────
admin.initializeApp();
const db = admin.firestore();

// ────────────────────────────────────────────────────────────────
// Module 1 — Slug Generation Algorithm
// Custom alphabet: no confusing chars (0, O, I, l removed)
// 52 chars => 52^7 ≈ 1 trillion possible slugs
// ────────────────────────────────────────────────────────────────
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
const generateSlug = customAlphabet(ALPHABET, 7);

async function createUniqueSlug(): Promise<string> {
  let slug: string;
  let exists: boolean;
  let attempts = 0;
  do {
    slug = generateSlug();
    const docRef = db.collection("qr_codes").doc(slug);
    const docSnap = await docRef.get();
    exists = docSnap.exists;
    attempts++;
    if (attempts > 10)
      throw new Error("Slug generation failed after 10 attempts");
  } while (exists);
  return slug;
}

// ────────────────────────────────────────────────────────────────
// Module 6 — Plan Enforcement & Limits
// ────────────────────────────────────────────────────────────────
const PLAN_LIMITS: Record<string, any> = {
  free: {
    qr_codes: 3,
    analytics_days: 7,
    custom_domain: false,
    bulk: false,
    logo: false,
  },
  pro: {
    qr_codes: Infinity,
    analytics_days: 90,
    custom_domain: true,
    bulk: false,
    logo: true,
  },
  team: {
    qr_codes: Infinity,
    analytics_days: 365,
    custom_domain: true,
    bulk: true,
    logo: true,
  },
};

async function getUserPlan(
  uid: string,
): Promise<{ plan: string; limits: any }> {
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) {
    // Auto-create user doc on first access
    const plan = "free";
    await db.collection("users").doc(uid).set({
      uid,
      plan,
      qr_limit: PLAN_LIMITS[plan].qr_codes,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { plan, limits: PLAN_LIMITS[plan] };
  }
  const data = userDoc.data()!;
  const plan = data.plan || "free";

  // Check if plan expired
  if (data.plan_expires_at && data.plan_expires_at.toDate() < new Date()) {
    await db.collection("users").doc(uid).update({ plan: "free", qr_limit: 3 });
    return { plan: "free", limits: PLAN_LIMITS.free };
  }

  return { plan, limits: PLAN_LIMITS[plan] };
}

async function enforceQRLimit(
  uid: string,
): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
  const { plan, limits } = await getUserPlan(uid);
  if (limits.qr_codes === Infinity) return { allowed: true };

  const snapshot = await db
    .collection("qr_codes")
    .where("user_uid", "==", uid)
    .where("is_active", "==", true)
    .get();

  const current = snapshot.size;
  if (current >= limits.qr_codes) {
    return {
      allowed: false,
      reason: `Free plan allows ${limits.qr_codes} QR codes. You have ${current}. Upgrade to Pro for unlimited.`,
    };
  }
  return { allowed: true, remaining: limits.qr_codes - current };
}

function enforceAnalyticsWindow(plan: string, requestedDays: number): number {
  const maxDays = PLAN_LIMITS[plan]?.analytics_days || 7;
  return Math.min(requestedDays, maxDays);
}

// ────────────────────────────────────────────────────────────────
// Module 3 — UA Parsing, Bot Detection, Analytics Helpers
// ────────────────────────────────────────────────────────────────
function parseUA(ua: string) {
  const ua_lower = ua.toLowerCase();

  const device = /mobile|android|iphone/.test(ua_lower)
    ? "mobile"
    : /tablet|ipad/.test(ua_lower)
      ? "tablet"
      : "desktop";

  const os = /android/.test(ua_lower)
    ? "Android"
    : /iphone|ipad|ios/.test(ua_lower)
      ? "iOS"
      : /windows/.test(ua_lower)
        ? "Windows"
        : /mac os/.test(ua_lower)
          ? "macOS"
          : /linux/.test(ua_lower)
            ? "Linux"
            : "Unknown";

  const browser = /edg\//.test(ua_lower)
    ? "Edge"
    : /opr\/|opera/.test(ua_lower)
      ? "Opera"
      : /chrome/.test(ua_lower)
        ? "Chrome"
        : /safari/.test(ua_lower)
          ? "Safari"
          : /firefox/.test(ua_lower)
            ? "Firefox"
            : "Other";

  const androidMatch = ua.match(/Android ([\d.]+)/);
  const iosMatch = ua.match(/OS ([\d_]+)/);
  const osVersion =
    androidMatch?.[1] || iosMatch?.[1]?.replace(/_/g, ".") || null;

  return { device, os, osVersion, browser };
}

function isBot(ua: string) {
  return /bot|crawler|spider|preview|facebookexternalhit|googlebot|twitterbot|slackbot|whatsapp|telegram/i.test(
    ua,
  );
}

function classifyReferer(referer: string) {
  if (!referer) return "direct";
  if (/android-app:|ios-app:/.test(referer)) return "app";
  return "browser";
}

// ────────────────────────────────────────────────────────────────
// Server Setup
// ────────────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());

  // ── Auth Middleware ────────────────────────────────────────────
  // Every /api/* route requires a valid Firebase JWT
  async function requireAuth(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "No token provided" });

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      (req as any).uid = decoded.uid;
      (req as any).email = decoded.email;
      next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  }

  // ── Internal Auth Middleware ────────────────────────────────────
  // For Cloudflare Worker → Cloud Run communication
  function requireInternalAuth(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) {
    const token = req.headers.authorization?.split("Bearer ")[1];
    const internalSecret = process.env.INTERNAL_SECRET || "dev-internal-secret";
    if (token !== internalSecret) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  }

  // Parse JSON for all routes except PayHere webhook (needs raw body)
  app.use(
    "/webhook/payhere",
    express.raw({ type: "application/x-www-form-urlencoded" }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ── Health Check ──────────────────────────────────────────────
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", version: "2.0.0" });
  });

  // ════════════════════════════════════════════════════════════════
  // Module 7 — QR CRUD API Routes (authenticated)
  // ════════════════════════════════════════════════════════════════
  app.use("/api", requireAuth);

  // ── POST /api/qr → Create a QR code ──────────────────────────
  app.post("/api/qr", async (req, res) => {
    try {
      const uid = (req as any).uid;
      const { title, destination_url, type, style } = req.body;

      if (!title || !destination_url) {
        return res
          .status(400)
          .json({ error: "title and destination_url are required" });
      }

      // Enforce plan limits
      const limitCheck = await enforceQRLimit(uid);
      if (!limitCheck.allowed) {
        return res
          .status(403)
          .json({ error: limitCheck.reason, upgrade_url: "/pricing" });
      }

      // Generate unique slug (Module 1)
      const slug = await createUniqueSlug();

      const qrDoc = {
        slug,
        user_uid: uid,
        destination_url,
        title,
        is_active: true,
        type: type || "url",
        style: {
          dot_color: style?.dot_color || "#000000",
          bg_color: style?.bg_color || "#FFFFFF",
          dot_style: style?.dot_style || "square",
          corner_style: style?.corner_style || "square",
          logo_url: style?.logo_url || null,
          error_correction: style?.logo_url ? "H" : "M",
        },
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      await db.collection("qr_codes").doc(slug).set(qrDoc);
      res
        .status(201)
        .json({ id: slug, ...qrDoc, remaining: limitCheck.remaining });
    } catch (error) {
      console.error("Create QR error:", error);
      res.status(500).json({ error: "Failed to create QR code" });
    }
  });

  // ── GET /api/qr → List user's QR codes ────────────────────────
  app.get("/api/qr", async (req, res) => {
    try {
      const uid = (req as any).uid;
      const snapshot = await db
        .collection("qr_codes")
        .where("user_uid", "==", uid)
        .orderBy("created_at", "desc")
        .get();

      const qrCodes = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      res.json(qrCodes);
    } catch (error) {
      console.error("List QR error:", error);
      res.status(500).json({ error: "Failed to list QR codes" });
    }
  });

  // ── PUT /api/qr/:id → Update QR code ─────────────────────────
  app.put("/api/qr/:id", async (req, res) => {
    try {
      const uid = (req as any).uid;
      const { id } = req.params;
      const updates = req.body;

      const docRef = db.collection("qr_codes").doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists)
        return res.status(404).json({ error: "QR code not found" });
      if (docSnap.data()!.user_uid !== uid)
        return res.status(403).json({ error: "Not authorized" });

      // Slug is immutable
      delete updates.slug;
      delete updates.user_uid;
      delete updates.created_at;
      updates.updated_at = admin.firestore.FieldValue.serverTimestamp();

      await docRef.update(updates);
      res.json({ id, ...updates });
    } catch (error) {
      console.error("Update QR error:", error);
      res.status(500).json({ error: "Failed to update QR code" });
    }
  });

  // ── DELETE /api/qr/:id → Soft-delete (deactivate) ────────────
  app.delete("/api/qr/:id", async (req, res) => {
    try {
      const uid = (req as any).uid;
      const { id } = req.params;

      const docRef = db.collection("qr_codes").doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists)
        return res.status(404).json({ error: "QR code not found" });
      if (docSnap.data()!.user_uid !== uid)
        return res.status(403).json({ error: "Not authorized" });

      // Soft delete — never actually delete, slug must stay reserved
      await docRef.update({
        is_active: false,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.json({ id, is_active: false, message: "QR code deactivated" });
    } catch (error) {
      console.error("Delete QR error:", error);
      res.status(500).json({ error: "Failed to deactivate QR code" });
    }
  });

  // ── GET /api/user/plan → Get current user plan info ────────────
  app.get("/api/user/plan", async (req, res) => {
    try {
      const uid = (req as any).uid;
      const { plan, limits } = await getUserPlan(uid);
      const limitCheck = await enforceQRLimit(uid);
      res.json({ plan, limits, remaining_qr: limitCheck.remaining });
    } catch (error) {
      console.error("Plan error:", error);
      res.status(500).json({ error: "Failed to get plan info" });
    }
  });

  // ════════════════════════════════════════════════════════════════
  // Module 5 — Analytics Query Engine (authenticated)
  // ════════════════════════════════════════════════════════════════

  // ── QUERY 1: Summary stats ────────────────────────────────────
  app.get("/api/analytics/:slug/summary", async (req, res) => {
    try {
      const uid = (req as any).uid;
      const { slug } = req.params;

      // Verify ownership
      const qrDoc = await db.collection("qr_codes").doc(slug).get();
      if (!qrDoc.exists || qrDoc.data()!.user_uid !== uid) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const snapshot = await db
        .collection("scan_events")
        .where("slug", "==", slug)
        .get();

      let total_scans = 0;
      let unique_visitors = 0;
      let mobile_scans = 0;
      let first_scan: Date | null = null;
      let last_scan: Date | null = null;

      snapshot.forEach((doc) => {
        const data = doc.data();
        total_scans++;
        if (data.is_unique) unique_visitors++;
        if (data.device_type === "mobile") mobile_scans++;

        const scanTime = data.scanned_at?.toDate() || new Date();
        if (!first_scan || scanTime < first_scan) first_scan = scanTime;
        if (!last_scan || scanTime > last_scan) last_scan = scanTime;
      });

      const mobile_pct =
        total_scans > 0 ? ((mobile_scans / total_scans) * 100).toFixed(1) : 0;

      res.json({
        total_scans,
        unique_visitors,
        mobile_pct,
        first_scan,
        last_scan,
      });
    } catch (error) {
      console.error("Analytics error:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // ── QUERY 2: Time-series chart ────────────────────────────────
  app.get("/api/analytics/:slug/timeseries", async (req, res) => {
    try {
      const uid = (req as any).uid;
      const { slug } = req.params;
      const { plan } = await getUserPlan(uid);
      const days = enforceAnalyticsWindow(
        plan,
        parseInt(req.query.days as string) || 30,
      );
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const snapshot = await db
        .collection("scan_events")
        .where("slug", "==", slug)
        .get();

      const dailyStats: Record<string, any> = {};
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        dailyStats[dateStr] = {
          date: dateStr,
          total_scans: 0,
          unique_scans: 0,
          mobile_scans: 0,
        };
      }

      snapshot.forEach((doc) => {
        const data = doc.data();
        const scanTime = data.scanned_at?.toDate();
        if (!scanTime || scanTime < cutoff) return;
        const dateStr = scanTime.toISOString().split("T")[0];
        if (dailyStats[dateStr]) {
          dailyStats[dateStr].total_scans++;
          if (data.is_unique) dailyStats[dateStr].unique_scans++;
          if (data.device_type === "mobile") dailyStats[dateStr].mobile_scans++;
        }
      });

      res.json(Object.values(dailyStats));
    } catch (error) {
      console.error("Analytics error:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // ── QUERY 3: Device breakdown ─────────────────────────────────
  app.get("/api/analytics/:slug/devices", async (req, res) => {
    try {
      const { slug } = req.params;
      const snapshot = await db
        .collection("scan_events")
        .where("slug", "==", slug)
        .get();

      const devices: Record<string, number> = {};
      let total = 0;
      snapshot.forEach((doc) => {
        const device = doc.data().device_type || "unknown";
        devices[device] = (devices[device] || 0) + 1;
        total++;
      });

      const result = Object.entries(devices)
        .map(([device_type, count]) => ({
          device_type,
          count,
          pct: total > 0 ? ((count / total) * 100).toFixed(1) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      res.json(result);
    } catch (error) {
      console.error("Analytics error:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // ── QUERY 4: Top countries ────────────────────────────────────
  app.get("/api/analytics/:slug/countries", async (req, res) => {
    try {
      const { slug } = req.params;
      const snapshot = await db
        .collection("scan_events")
        .where("slug", "==", slug)
        .get();

      const countries: Record<
        string,
        { scans: number; unique_visitors: number }
      > = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        const country = data.country || "Unknown";
        if (!countries[country])
          countries[country] = { scans: 0, unique_visitors: 0 };
        countries[country].scans++;
        if (data.is_unique) countries[country].unique_visitors++;
      });

      const result = Object.entries(countries)
        .map(([country, stats]) => ({
          country,
          ...stats,
        }))
        .sort((a, b) => b.scans - a.scans)
        .slice(0, 10);

      res.json(result);
    } catch (error) {
      console.error("Analytics error:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // ── QUERY 5: OS breakdown ─────────────────────────────────────
  app.get("/api/analytics/:slug/os", async (req, res) => {
    try {
      const { slug } = req.params;
      const snapshot = await db
        .collection("scan_events")
        .where("slug", "==", slug)
        .get();

      const osStats: Record<string, number> = {};
      let total = 0;
      snapshot.forEach((doc) => {
        const os = doc.data().os || "Unknown";
        osStats[os] = (osStats[os] || 0) + 1;
        total++;
      });

      const result = Object.entries(osStats)
        .map(([os, count]) => ({
          os,
          count,
          pct: total > 0 ? ((count / total) * 100).toFixed(1) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // ── QUERY 6: Browser breakdown ────────────────────────────────
  app.get("/api/analytics/:slug/browsers", async (req, res) => {
    try {
      const { slug } = req.params;
      const snapshot = await db
        .collection("scan_events")
        .where("slug", "==", slug)
        .get();

      const browserStats: Record<string, number> = {};
      let total = 0;
      snapshot.forEach((doc) => {
        const browser = doc.data().browser || "Unknown";
        browserStats[browser] = (browserStats[browser] || 0) + 1;
        total++;
      });

      const result = Object.entries(browserStats)
        .map(([browser, count]) => ({
          browser,
          count,
          pct: total > 0 ? ((count / total) * 100).toFixed(1) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // ── QUERY 7: Referrers ────────────────────────────────────────
  app.get("/api/analytics/:slug/referrers", async (req, res) => {
    try {
      const { slug } = req.params;
      const snapshot = await db
        .collection("scan_events")
        .where("slug", "==", slug)
        .get();

      const referrerStats: Record<string, number> = {};
      let total = 0;
      snapshot.forEach((doc) => {
        let referrer = doc.data().referrer || "Direct";
        if (referrer !== "Direct") {
          try {
            referrer = new URL(referrer).hostname;
          } catch {
            /* keep as-is */
          }
        }
        referrerStats[referrer] = (referrerStats[referrer] || 0) + 1;
        total++;
      });

      const result = Object.entries(referrerStats)
        .map(([referrer, count]) => ({
          referrer,
          count,
          pct: total > 0 ? ((count / total) * 100).toFixed(1) : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // ── QUERY 8: Recent scans ────────────────────────────────────
  app.get("/api/analytics/:slug/recent", async (req, res) => {
    try {
      const { slug } = req.params;
      const snapshot = await db
        .collection("scan_events")
        .where("slug", "==", slug)
        .get();

      const allScans = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          scanned_at: data.scanned_at?.toDate(),
          country: data.country || "Unknown",
          city: data.city || "Unknown",
          device_type: data.device_type || "Unknown",
          os: data.os || "Unknown",
          browser: data.browser || "Unknown",
          referrer: data.referrer || "Direct",
          is_unique: data.is_unique,
        };
      });

      allScans.sort((a, b) => {
        if (!a.scanned_at) return 1;
        if (!b.scanned_at) return -1;
        return b.scanned_at.getTime() - a.scanned_at.getTime();
      });

      const recent = allScans.slice(0, 10).map((scan) => ({
        ...scan,
        scanned_at: scan.scanned_at?.toISOString(),
      }));

      res.json(recent);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent scans" });
    }
  });

  // ── QUERY 9: Peak hours heatmap ───────────────────────────────
  app.get("/api/analytics/:slug/hours", async (req, res) => {
    try {
      const { slug } = req.params;
      const snapshot = await db
        .collection("scan_events")
        .where("slug", "==", slug)
        .get();

      const hours = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        scans: 0,
      }));

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.is_bot) return;
        const scanTime = data.scanned_at?.toDate();
        if (scanTime) {
          hours[scanTime.getHours()].scans++;
        }
      });

      res.json(hours);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch peak hours" });
    }
  });

  // ── QUERY 10: Scan velocity ───────────────────────────────────
  // velocity = (scans_today - scans_yesterday) / scans_yesterday * 100
  app.get("/api/analytics/:slug/velocity", async (req, res) => {
    try {
      const { slug } = req.params;
      const snapshot = await db
        .collection("scan_events")
        .where("slug", "==", slug)
        .get();

      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      let today = 0;
      let yesterdayCount = 0;

      snapshot.forEach((doc) => {
        const scanTime = doc.data().scanned_at?.toDate();
        if (!scanTime || doc.data().is_bot) return;
        const dateStr = scanTime.toISOString().split("T")[0];
        if (dateStr === todayStr) today++;
        else if (dateStr === yesterdayStr) yesterdayCount++;
      });

      const velocity =
        yesterdayCount > 0
          ? parseFloat(
              (((today - yesterdayCount) / yesterdayCount) * 100).toFixed(1),
            )
          : today > 0
            ? 100
            : 0;

      res.json({ today, yesterday: yesterdayCount, velocity });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch velocity" });
    }
  });

  // ── Account-level analytics ───────────────────────────────────
  app.get("/api/analytics/account/summary", async (req, res) => {
    try {
      const uid = (req as any).uid;
      const qrSnapshot = await db
        .collection("qr_codes")
        .where("user_uid", "==", uid)
        .get();
      const slugs = qrSnapshot.docs.map((doc) => doc.data().slug);

      if (slugs.length === 0) {
        return res.json({
          total_scans: 0,
          unique_visitors: 0,
          total_qrs: 0,
          active_qrs: 0,
        });
      }

      let total_scans = 0;
      let unique_visitors = 0;

      const chunks = [];
      for (let i = 0; i < slugs.length; i += 30) {
        chunks.push(slugs.slice(i, i + 30));
      }

      for (const chunk of chunks) {
        const scanSnapshot = await db
          .collection("scan_events")
          .where("slug", "in", chunk)
          .get();
        total_scans += scanSnapshot.size;
        scanSnapshot.forEach((doc) => {
          if (doc.data().is_unique) unique_visitors++;
        });
      }

      const active_qrs = qrSnapshot.docs.filter(
        (doc) => doc.data().is_active,
      ).length;

      res.json({
        total_scans,
        unique_visitors,
        total_qrs: slugs.length,
        active_qrs,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch account analytics" });
    }
  });

  app.get("/api/analytics/account/timeseries", async (req, res) => {
    try {
      const uid = (req as any).uid;
      const days = parseInt(req.query.days as string) || 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const qrSnapshot = await db
        .collection("qr_codes")
        .where("user_uid", "==", uid)
        .get();
      const slugs = qrSnapshot.docs.map((doc) => doc.data().slug);

      const dailyStats: Record<string, any> = {};
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        dailyStats[dateStr] = {
          date: dateStr,
          total_scans: 0,
          unique_scans: 0,
        };
      }

      if (slugs.length > 0) {
        const chunks = [];
        for (let i = 0; i < slugs.length; i += 30) {
          chunks.push(slugs.slice(i, i + 30));
        }
        for (const chunk of chunks) {
          const scanSnapshot = await db
            .collection("scan_events")
            .where("slug", "in", chunk)
            .get();
          scanSnapshot.forEach((doc) => {
            const data = doc.data();
            const scanTime = data.scanned_at?.toDate();
            if (!scanTime || scanTime < cutoff) return;
            const dateStr = scanTime.toISOString().split("T")[0];
            if (dailyStats[dateStr]) {
              dailyStats[dateStr].total_scans++;
              if (data.is_unique) dailyStats[dateStr].unique_scans++;
            }
          });
        }
      }

      res.json(Object.values(dailyStats));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch account timeseries" });
    }
  });

  // ════════════════════════════════════════════════════════════════
  // PayHere Billing Routes
  // ════════════════════════════════════════════════════════════════

  // ── POST /api/billing/checkout → Create PayHere checkout ──────
  app.post("/api/billing/checkout", async (req, res) => {
    try {
      const uid = (req as any).uid;
      const email = (req as any).email;
      const { plan } = req.body; // 'pro' or 'team'

      if (!["pro", "team"].includes(plan)) {
        return res
          .status(400)
          .json({ error: "Invalid plan. Choose pro or team." });
      }

      const prices: Record<string, number> = { pro: 7, team: 29 };
      const merchantId = process.env.PAYHERE_MERCHANT_ID || "YOUR_MERCHANT_ID";
      const returnUrl = `${process.env.APP_URL || "http://localhost:3000"}/settings?payment=success`;
      const cancelUrl = `${process.env.APP_URL || "http://localhost:3000"}/pricing?payment=cancelled`;
      const notifyUrl = `${process.env.APP_URL || "http://localhost:3000"}/webhook/payhere`;

      // Generate order_id
      const orderId = `QR-${plan.toUpperCase()}-${uid.slice(0, 8)}-${Date.now()}`;
      const amount = prices[plan];

      // Generate hash for PayHere
      const merchantSecret = process.env.PAYHERE_SECRET || "YOUR_SECRET";
      const hashedSecret = crypto
        .createHash("md5")
        .update(merchantSecret)
        .digest("hex")
        .toUpperCase();
      const amountFormatted = amount.toFixed(2);
      const currency = "USD";
      const hashStr =
        merchantId + orderId + amountFormatted + currency + hashedSecret;
      const hash = crypto
        .createHash("md5")
        .update(hashStr)
        .digest("hex")
        .toUpperCase();

      res.json({
        merchant_id: merchantId,
        return_url: returnUrl,
        cancel_url: cancelUrl,
        notify_url: notifyUrl,
        order_id: orderId,
        items: `DynamicQR ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
        currency,
        amount: amountFormatted,
        first_name: email?.split("@")[0] || "User",
        last_name: "",
        email: email || "",
        phone: "",
        address: "",
        city: "",
        country: "Sri Lanka",
        hash,
        custom_1: uid,
        custom_2: plan,
        // PayHere recurring fields
        recurrence: "1 Month",
        duration: "Forever",
      });
    } catch (error) {
      console.error("Checkout error:", error);
      res.status(500).json({ error: "Failed to create checkout" });
    }
  });

  // ── POST /webhook/payhere → PayHere payment notification ──────
  // This is NOT behind requireAuth — PayHere sends this directly
  app.post("/webhook/payhere", async (req, res) => {
    try {
      const data =
        typeof req.body === "string"
          ? Object.fromEntries(new URLSearchParams(req.body))
          : req.body;

      const merchantId = data.merchant_id;
      const orderId = data.order_id;
      const paymentAmount = data.payhere_amount;
      const payhereCurrency = data.payhere_currency;
      const statusCode = data.status_code;
      const md5sig = data.md5sig;

      // Verify hash
      const merchantSecret = process.env.PAYHERE_SECRET || "YOUR_SECRET";
      const hashedSecret = crypto
        .createHash("md5")
        .update(merchantSecret)
        .digest("hex")
        .toUpperCase();
      const localMd5 = crypto
        .createHash("md5")
        .update(
          merchantId +
            orderId +
            paymentAmount +
            payhereCurrency +
            statusCode +
            hashedSecret,
        )
        .digest("hex")
        .toUpperCase();

      if (localMd5 !== md5sig) {
        console.error("PayHere webhook: hash mismatch");
        return res.status(400).send("Hash mismatch");
      }

      // statusCode 2 = success
      if (statusCode === "2") {
        const uid = data.custom_1;
        const plan = data.custom_2;

        if (uid && plan && PLAN_LIMITS[plan]) {
          await db
            .collection("users")
            .doc(uid)
            .update({
              plan,
              plan_expires_at: admin.firestore.Timestamp.fromDate(
                new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
              ),
              qr_limit:
                PLAN_LIMITS[plan].qr_codes === Infinity
                  ? 999999
                  : PLAN_LIMITS[plan].qr_codes,
              payhere_order_id: orderId,
            });
          console.log(`Plan upgraded: ${uid} → ${plan}`);
        }
      }

      res.status(200).send("OK");
    } catch (error) {
      console.error("PayHere webhook error:", error);
      res.status(500).send("Error");
    }
  });

  // ════════════════════════════════════════════════════════════════
  // Internal Routes (for Cloudflare Worker)
  // ════════════════════════════════════════════════════════════════

  // ── GET /internal/slug/:slug → Lookup destination ─────────────
  app.get("/internal/slug/:slug", requireInternalAuth, async (req, res) => {
    try {
      const { slug } = req.params;
      const docRef = db.collection("qr_codes").doc(slug);
      const docSnap = await docRef.get();

      if (!docSnap.exists) return res.status(404).json({ error: "Not found" });

      const data = docSnap.data()!;
      res.json({
        destination_url: data.destination_url,
        is_active: data.is_active,
        slug: data.slug,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal error" });
    }
  });

  // ── POST /internal/scan → Record scan event ───────────────────
  app.post(
    "/internal/scan",
    requireInternalAuth,
    express.json(),
    async (req, res) => {
      try {
        const scanData = req.body;
        await db.collection("scan_events").add({
          ...scanData,
          scanned_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.status(201).json({ success: true });
      } catch (error) {
        console.error("Internal scan error:", error);
        res.status(500).json({ error: "Failed to record scan" });
      }
    },
  );

  // ════════════════════════════════════════════════════════════════
  // Redirect Engine (for local dev — in production, Cloudflare Worker handles this)
  // ════════════════════════════════════════════════════════════════
  app.get("/:slug", async (req, res, next) => {
    const { slug } = req.params;

    // Ignore static assets and API routes
    if (
      slug.startsWith("api") ||
      slug.startsWith("assets") ||
      slug.includes(".")
    ) {
      return next();
    }

    // Validate slug format
    if (!/^[23456789a-zA-Z]{5,12}$/.test(slug)) {
      return next();
    }

    try {
      const qrDoc = await db.collection("qr_codes").doc(slug).get();
      if (!qrDoc.exists) return next();

      const qrData = qrDoc.data()!;
      if (!qrData.is_active) {
        return res.status(410).send("QR code inactive");
      }

      // Fire analytics async — don't block the redirect
      captureAnalytics(req, slug).catch((err) =>
        console.error("Analytics capture failed:", err),
      );

      return res.redirect(302, qrData.destination_url);
    } catch (error) {
      console.error("Redirect error:", error);
      next();
    }
  });

  // ── Analytics Capture ─────────────────────────────────────────
  async function captureAnalytics(req: express.Request, slug: string) {
    const ua = req.headers["user-agent"] || "";
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";

    if (isBot(ua)) return;

    const today = new Date().toISOString().slice(0, 10);
    const fingerprint = `${ip}:${ua.slice(0, 100)}:${today}`;
    const visitorHash = crypto
      .createHash("sha256")
      .update(fingerprint)
      .digest("hex");

    // Check uniqueness
    const snapshot = await db
      .collection("scan_events")
      .where("slug", "==", slug)
      .where("visitor_hash", "==", visitorHash)
      .get();
    const isUnique = snapshot.empty;

    const parsed = parseUA(ua);
    const referer = req.headers.referer || "";

    const country = (req.headers["cf-ipcountry"] as string) || "US";

    await db.collection("scan_events").add({
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
      referer_type: classifyReferer(referer),
      referrer: referer || null,
    });
  }

  // ════════════════════════════════════════════════════════════════
  // Vite Middleware (development)
  // ════════════════════════════════════════════════════════════════
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
