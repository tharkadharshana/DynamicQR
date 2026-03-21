import "dotenv/config";
import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

async function runTests() {
  const slug = "test-qik-88";

  console.log("1. Initializing DB with test QR Code mimicking exactly what POST /api/qr does...");
  
  const qrDoc = {
    slug,
    user_uid: "test_user_999",
    destination_url: "https://example.com/success",
    title: "Test E2E QR",
    is_active: true,
    qr_svg: "<svg>test</svg>",
    style: { dot_color: "#000", bg_color: "#fff" },
    created_at: admin.firestore.FieldValue.serverTimestamp()
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

  await db.collection("qr_codes").doc(slug).set(qrDoc);
  await db.collection("qr_stats").doc(slug).set(statsDoc);

  console.log("2. Simulating a redirect scan via HTTP on local server...");
  
  try {
    const res = await fetch(`http://localhost:3000/${slug}`, {
      redirect: 'manual', // Don't follow it
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'X-Forwarded-For': '203.0.113.195',
        'CF-IPCountry': 'LK',
        'Referer': 'https://twitter.com/somepost'
      }
    });

    console.log(`Redirect HTTP Status: ${res.status}`);
    console.log(`Redirect Location: ${res.headers.get('location')}`);
    
    if (res.status === 302 && res.headers.get('location') === qrDoc.destination_url) {
      console.log("✅ Redirect engine works properly!");
    } else {
      console.error("❌ Redirect engine failed!");
    }
  } catch (err) {
    console.error("HTTP fetch failed:", err);
  }

  // Wait 1 second to give Server async Firebase writes time to finish
  await new Promise(r => setTimeout(r, 1500)); 

  console.log("3. Validating new exact schema in Firestore...");
  
  const finalStatsDoc = await db.collection("qr_stats").doc(slug).get();
  console.log("--- QR_STATS ---");
  console.log(JSON.stringify(finalStatsDoc.data(), null, 2));

  const eventsSnap = await db.collection("scan_events").where("slug", "==", slug).get();
  console.log(`--- SCAN_EVENTS (Count: ${eventsSnap.size}) ---`);
  eventsSnap.forEach(doc => {
    const data = doc.data();
    console.log(JSON.stringify(data, null, 2));
    
    // Validate minimal schema adherence
    const keys = Object.keys(data).sort();
    const expected = ["slug", "date", "country", "device", "is_unique", "scanned_at", "visitor_hash", "asn", "colo", "lang", "tls", "is_eu"].sort();
    
    let hasAll = true;
    for (const key of expected) {
      if (!keys.includes(key)) hasAll = false;
    }

    if (hasAll) {
      console.log("✅ scan_events schema matches exactly what was built!");
    } else {
      console.log("❌ scan_events schema mismatch!");
      console.log("Keys found:", keys);
    }
  });

  process.exit(0);
}

runTests().catch(console.error);
