import React from 'react';
import LegalLayout, { Section } from '../components/LegalLayout';
import { SITE } from '../lib/site';

export default function RefundPolicy() {
  return (
    <LegalLayout title="Refund & Cancellation Policy" updated="11 October 2026">
      <p>{SITE.name} is a subscription software service. Nothing is shipped, so there are no returns; this page explains cancellations and refunds.</p>

      <Section title="1. Free trial">
        <p>The 14-day trial is free and needs no card. Nothing is charged when it ends; your account moves to the Free plan.</p>
      </Section>

      <Section title="2. Cancelling">
        <p>You can cancel a paid plan at any time by contacting us at {SITE.email}{SITE.whatsapp ? ' or on WhatsApp' : ''}, or through your payment provider's subscription link. Cancelling stops future renewals. Your plan stays active until the end of the period you already paid for.</p>
      </Section>

      <Section title="3. Refunds">
        <p><strong>First payment:</strong> if you are not satisfied, ask within 7 days of your first payment for a full refund.</p>
        <p><strong>Renewals:</strong> renewals are not refunded, except when the service was unavailable for a significant part of the period or you were charged by mistake (for example, a duplicate charge). Tell us within 14 days.</p>
        <p><strong>Setup services</strong> (design, printing coordination, onboarding) are refundable only before the work starts.</p>
        <p>Approved refunds go back to the original payment method within 5–10 business days, depending on your bank.</p>
      </Section>

      <Section title="4. What happens to your codes">
        <p>Cancelling or a refund never deletes your codes. When the paid period ends, the grace period and pause rules in the <a href="/legal/terms-and-conditions">Terms</a> apply.</p>
      </Section>

      <Section title="5. Contact">
        <p>{SITE.email}. Please include the email on your account and the order id from your receipt.</p>
      </Section>
    </LegalLayout>
  );
}
