// Public business identity and support channels, shown on Landing, legal pages and the app.
// Set these in Vercel env (VITE_*) — the fallbacks are safe defaults, not real contact details.
const env = (import.meta as any).env || {};

export const SITE = {
  name: 'Scnr',
  legalName: env.VITE_LEGAL_NAME || 'Scnr',
  location: env.VITE_BUSINESS_ADDRESS || 'Colombo, Sri Lanka',
  email: env.VITE_SUPPORT_EMAIL || 'support@tharkak.com',
  whatsapp: env.VITE_SUPPORT_WHATSAPP || '',   // digits with country code, e.g. 94771234567
  supportHours: env.VITE_SUPPORT_HOURS || 'Mon–Sat, 9am–6pm (Sri Lanka time)',
  statusUrl: env.VITE_STATUS_URL || '',        // public uptime/status page
  demoSlug: env.VITE_DEMO_SLUG || '',          // a real dynamic code you own, shown as the live demo
  founder: env.VITE_FOUNDER_NAME || '',
};

/** WhatsApp click-to-chat link: https://wa.me/<digits>?text=<message>. */
export function waLink(phone: string, text = ''): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
