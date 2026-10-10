import React from 'react';
import LegalLayout, { Section } from '../components/LegalLayout';
import { SITE } from '../lib/site';
import { GRACE_DAYS } from '../lib/plans';

export default function TermsConditions() {
  return (
    <LegalLayout title="Terms of Service" updated="11 October 2026">
      <p>These terms cover your use of {SITE.name}, a hosted service for creating QR codes, changing where dynamic codes point, and seeing scan statistics. By creating an account you agree to them.</p>

      <Section title="1. The service">
        <p><strong>Static codes</strong> contain their content directly and keep working without us. <strong>Dynamic codes</strong> point to a short link on our domain; every scan passes through our servers, which is why they need an active plan.</p>
        <p>{SITE.name} makes marketing, menu and campaign QR codes. It is not a payment QR and does not replace LANKAQR.</p>
      </Section>

      <Section title="2. Accounts">
        <p>You sign in with Google. Keep your account secure; you are responsible for what is done with it. You must be at least 18 and able to enter a contract.</p>
      </Section>

      <Section title="3. Plans, trial and billing">
        <p>New accounts get a 14-day trial with Pro features, limited to 3 codes. No card is needed. When the trial ends you move to the Free plan automatically; you are never charged unless you choose a paid plan.</p>
        <p>Paid plans renew automatically every month or year until you cancel. Prices are shown before checkout, in LKR (paid through PayHere) or USD (paid by card). Each plan has stated limits on codes and monthly scans; we do not sell "unlimited" plans.</p>
        <p>You can cancel any time. Your plan stays active until the end of the period you paid for and then does not renew.</p>
      </Section>

      <Section title="4. What happens to printed codes when a plan ends">
        <p>We never delete your codes because a trial or plan ended. After it ends you have a {GRACE_DAYS}-day grace period in which every code keeps working. After that, dynamic codes above your plan's allowance <strong>pause</strong>: scanners see a page saying the code is paused by its owner. Your oldest dynamic codes stay live up to the allowance (the Free plan keeps 1). Upgrading or reactivating brings paused codes back immediately, with the same printed link.</p>
        <p>If you delete a code or your account, the short link stops working permanently.</p>
      </Section>

      <Section title="5. Acceptable use">
        <p>You may not use {SITE.name} to point codes at phishing, malware, scams, illegal content, content that infringes others' rights, or to impersonate a business or person. We may pause or remove a code that does so, and suspend the account, without notice when needed to protect scanners.</p>
        <p>You may not try to break, overload, or get around the limits of the service.</p>
      </Section>

      <Section title="6. Availability">
        <p>We work to keep scans fast and available and publish our status where available{SITE.statusUrl ? <> at <a href={SITE.statusUrl}>{SITE.statusUrl}</a></> : null}. We do not guarantee uninterrupted service. Planned maintenance is announced in advance when it could affect scans.</p>
      </Section>

      <Section title="7. Your content and data">
        <p>You own your destinations, designs, logos and scan data. You give us permission to store and process them only to run the service. You can export your data from Settings at any time. How we handle scan data is described in the <a href="/legal/privacy-policy">Privacy Policy</a>.</p>
      </Section>

      <Section title="8. Liability">
        <p>The service is provided as is. To the extent the law allows, our total liability for any claim is limited to the amount you paid us in the 3 months before the claim. We are not liable for indirect losses such as lost sales or reprinting costs. Test a printed code before large print runs.</p>
      </Section>

      <Section title="9. Changes and contact">
        <p>We may update these terms; we will tell account holders by email before material changes take effect. These terms are governed by the laws of Sri Lanka. Questions: {SITE.email}.</p>
      </Section>
    </LegalLayout>
  );
}
