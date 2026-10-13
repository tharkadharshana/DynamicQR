// Standard Webhooks (https://www.standardwebhooks.com): one signer and one verifier.
// The server verifies Polar with it and signs our own outgoing webhooks with it; QA verifies deliveries with it.
// Node only (node:crypto): never import this from the browser bundle.
import crypto from 'node:crypto';

export const WEBHOOK_EVENTS = ['scan.created', 'form.submitted', 'qr.created', 'qr.updated', 'qr.deleted'] as const;

/** base64 HMAC-SHA256 of `${id}.${timestamp}.${body}`, keyed with the secret's UTF-8 bytes (as Polar does). */
export function signStandardWebhook(id: string, timestamp: number | string, body: string, secret: string): string {
  return 'v1,' + crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(`${id}.${timestamp}.${body}`).digest('base64');
}

/** Checks webhook-id / webhook-timestamp / webhook-signature headers; rejects timestamps more than 5 minutes off. */
export function verifyStandardWebhook(headers: Record<string, unknown>, rawBody: string, secret: string, now = Date.now()): boolean {
  const id = headers['webhook-id'], ts = headers['webhook-timestamp'], sig = headers['webhook-signature'];
  if (!id || !ts || !sig) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const expected = Buffer.from(signStandardWebhook(String(id), String(ts), rawBody, secret).slice(3));
  return String(sig).split(' ').some(part => {
    const got = Buffer.from(part.split(',')[1] || '');
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}

/** A new endpoint secret: whsec_ + 32 random bytes, base64. */
export const newWebhookSecret = () => `whsec_${crypto.randomBytes(32).toString('base64')}`;

/** Self-check: npx tsx src/lib/webhooks.ts */
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('webhooks.ts')) {
  const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
  const secret = newWebhookSecret(), body = '{"type":"qr.created"}', ts = Math.floor(Date.now() / 1000);
  const headers = { 'webhook-id': 'msg_1', 'webhook-timestamp': String(ts), 'webhook-signature': signStandardWebhook('msg_1', ts, body, secret) };
  assert(secret.startsWith('whsec_') && headers['webhook-signature'].startsWith('v1,'), 'format');
  assert(verifyStandardWebhook(headers, body, secret), 'verifies');
  assert(!verifyStandardWebhook(headers, body + ' ', secret) && !verifyStandardWebhook(headers, body, secret + 'x'), 'tampered body or wrong secret');
  assert(!verifyStandardWebhook({ ...headers, 'webhook-timestamp': String(ts - 600) }, body, secret), 'stale timestamp');
  assert(verifyStandardWebhook({ ...headers, 'webhook-signature': `v1,AAAA ${headers['webhook-signature']}` }, body, secret), 'several signatures');
  console.log('webhooks self-check ok');
}
