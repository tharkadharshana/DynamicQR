// Public business identity and support channels, shown on Landing, legal pages and the app.
// Set these in Vercel env (VITE_*) — the fallbacks are safe defaults, not real contact details.
// Each key is written out in full so Vite inlines it at build time; the guard keeps Node (QA) safe.
const ON = typeof import.meta.env !== 'undefined';

export const SITE = {
  name: 'Scnr',
  legalName: (ON && import.meta.env.VITE_LEGAL_NAME) || 'Scnr',
  location: (ON && import.meta.env.VITE_BUSINESS_ADDRESS) || 'Colombo, Sri Lanka',
  email: (ON && import.meta.env.VITE_SUPPORT_EMAIL) || 'support@tharkak.com',
  whatsapp: (ON && import.meta.env.VITE_SUPPORT_WHATSAPP) || '',   // digits with country code, e.g. 94771234567
  supportHours: (ON && import.meta.env.VITE_SUPPORT_HOURS) || 'Mon–Sat, 9am–6pm (Sri Lanka time)',
  statusUrl: (ON && import.meta.env.VITE_STATUS_URL) || '',        // public uptime/status page
  demoSlug: (ON && import.meta.env.VITE_DEMO_SLUG) || '',          // a real dynamic code you own, shown as the live demo
  founder: (ON && import.meta.env.VITE_FOUNDER_NAME) || '',
};

/** WhatsApp click-to-chat link: https://wa.me/<digits>?text=<message>. */
export function waLink(phone: string, text = ''): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
