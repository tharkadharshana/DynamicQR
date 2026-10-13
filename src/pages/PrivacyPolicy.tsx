import React from 'react';
import LegalLayout, { Section } from '../components/LegalLayout';
import { SITE } from '../lib/site';

export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" updated="13 October 2026">
      <p>This policy explains what {SITE.name} collects from account holders and from people who scan their QR codes, why, and what you can do about it.</p>

      <Section title="1. Account holders">
        <p>When you sign in with Google we receive your name and email address. We store your plan, billing status, company, job title, country and time zone if you add them, and the QR codes you create.</p>
        <p>Payments are processed by PayHere (LKR) or Polar (USD card payments). We never see or store your full card number; we keep the order id, amount, currency and status.</p>
      </Section>

      <Section title="2. People who scan a code">
        <p>A scan passes through our edge servers (Cloudflare). For each scan we record: the time, the country (from Cloudflare), the device type, operating system and browser (from the browser's user agent), the referring page if any, and whether this was the first scan of that code from that device today.</p>
        <p>To tell repeat scans apart we compute a one-way fingerprint from the IP address, user agent, the date and a secret. It changes every day and is kept only in our short-lived edge cache. <strong>We do not store raw IP addresses in our database.</strong> Our hosting provider's request logs may contain IP addresses for a short period for security and debugging.</p>
        <p>We also store an approximate city (from the network, via Cloudflare) and the browser's preferred language with each scan.</p>
        <p>Some codes ask for the scanner's approximate location. The code owner chooses to turn this on, and the browser then asks the scanner, who can refuse and still continue. If they agree, we round the coordinates to about 100 metres and store them with the scan. Only the code's owner can see them.</p>
        <p>We do not use cookies or tracking pixels on scan pages, and we do not sell or share scan data for advertising.</p>
      </Section>

      <Section title="3. Why we use it">
        <p>To run the service (redirects, gate rules, scan limits), to show account holders their statistics, to prevent abuse, to bill paid plans, and to contact you about your account.</p>
      </Section>

      <Section title="4. Who processes data for us">
        <p>Supabase (database and sign-in), Vercel (application hosting), Cloudflare (edge redirects), PayHere and Polar (payments), and an email provider for account messages. Each processes data only to provide its service to us.</p>
      </Section>

      <Section title="5. Retention">
        <p>Account data is kept while your account exists. Individual scan events are kept for up to 400 days; aggregated counts are kept with the QR code. When you delete a QR code or your account, its scan data is deleted.</p>
      </Section>

      <Section title="6. Your choices">
        <p>You can export your data and delete your account from Settings at any time. For other requests (correction, access, objection) email {SITE.email}. We reply within 30 days.</p>
      </Section>

      <Section title="7. Contact">
        <p>{SITE.legalName}, {SITE.location}. Email: {SITE.email}.</p>
      </Section>
    </LegalLayout>
  );
}
