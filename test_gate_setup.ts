import admin from "firebase-admin";
import crypto from "crypto";
import { getFirestore } from "firebase-admin/firestore";

admin.initializeApp({
  projectId: "gen-lang-client-0169684835"
});
const db = getFirestore("ai-studio-073b7ca7-716e-4c83-bcff-6507fde83c73");

async function setupGates() {
  const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  
  // 1. Password Gate QR
  const pwdSlug = "pwd123";
  const pwdHash = crypto.createHash('sha256').update("1234" + pwdSlug).digest('hex');
  await db.collection("qr_codes").doc(pwdSlug).set({
    slug: pwdSlug,
    user_uid: "test_user",
    destination_url: "https://example.com/password-success",
    title: "Password Protected QR",
    is_active: true,
    password_hash: pwdHash,
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });
  await db.collection("qr_stats").doc(pwdSlug).set({ total_scans: 0, days: {} });

  // 2. Limit Gate QR
  const limitSlug = "lim321";
  await db.collection("qr_codes").doc(limitSlug).set({
    slug: limitSlug,
    user_uid: "test_user",
    destination_url: "https://example.com/limit-success",
    title: "Limited Scans QR",
    is_active: true,
    rate_limit: { enabled: true, max_scans: 3, period: "total" },
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });
  await db.collection("qr_stats").doc(limitSlug).set({ total_scans: 0, days: {} });

  // 3. Expiry Gate QR
  const expirySlug = "exp456";
  const now = new Date();
  const future = new Date(now.getTime() + 2 * 60000); // 2 mins from now
  await db.collection("qr_codes").doc(expirySlug).set({
    slug: expirySlug,
    user_uid: "test_user",
    destination_url: "https://example.com/expiry-success",
    title: "Expiring QR",
    is_active: true,
    expiry_date: future.toISOString(),
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });
  await db.collection("qr_stats").doc(expirySlug).set({ total_scans: 0, days: {} });

  console.log("Gate test QRs set up:");
  console.log(`- Password (1234): http://127.0.0.1:8787/${pwdSlug}`);
  console.log(`- Limit (3): http://127.0.0.1:8787/${limitSlug}`);
  console.log(`- Expiry (2m): http://127.0.0.1:8787/${expirySlug}`);
  
  process.exit(0);
}

setupGates().catch(console.error);
