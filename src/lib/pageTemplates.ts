// Page templates: plain content_data presets for the Pages builder, grouped by use case like Bitly's picker.
// Plain colour blocks, no stock photos: the owner adds their own images. Rendered by renderGuestPage.
import { renderGuestPage, BLOCK_KINDS } from './guestPage.js';

export interface PageTemplate { id: string; name: string; group: string; content: any; description?: string; tags?: string[] }

const theme = (accent: string, bg = '#FFF8F2', text = '#24180F', button = 'rounded', font = 'system') => ({ accent, bg, text, button, font });
const header = (name: string, tagline: string) => ({ kind: 'header', name, tagline });
const btn = (label: string, url = 'https://') => ({ kind: 'button', label, url });
const socials = (...networks: string[]) => ({ kind: 'socials', items: networks.map(network => ({ network, handle: '' })) });
const products = (title: string, ...items: [string, string][]) => ({ kind: 'products', title, items: items.map(([t, price]) => ({ title: t, price, url: 'https://' })) });

export const PAGE_TEMPLATES: PageTemplate[] = [
  { id: 'bio-creator', name: 'Creator link-in-bio', group: 'Link-in-bio', content: { theme: theme('#7C3AED', '#F5F3FF', '#1E1B4B', 'pill'), blocks: [
    header('Your name', 'What you make, in one line'), socials('instagram', 'tiktok', 'youtube'),
    btn('Latest video'), btn('Shop my picks'), btn('Work with me'), { kind: 'divider' }, { kind: 'text', text: 'New posts every week.' }] } },
  { id: 'bio-business', name: 'Business link-in-bio', group: 'Link-in-bio', content: { theme: theme('#0F766E', '#F0FDFA', '#134E4A'), blocks: [
    header('Your business', 'Open daily, 9am–9pm'), btn('Order online'), btn('Book a table'), btn('Find us on Google Maps'),
    socials('instagram', 'facebook'), { kind: 'offer', title: 'This week', text: 'Free delivery over LKR 5,000' }] } },
  { id: 'shop-products', name: 'Product showcase', group: 'Products and services', content: { theme: theme('#E85D3A'), blocks: [
    header('Your shop', 'Handmade in Sri Lanka'), products('Best sellers', ['Product one', 'LKR 2,500'], ['Product two', 'LKR 3,900'], ['Product three', 'LKR 1,200']),
    btn('See the full catalogue'), btn('Order on WhatsApp'), socials('instagram', 'facebook')] } },
  { id: 'shop-services', name: 'Services menu', group: 'Products and services', content: { theme: theme('#1D4ED8', '#EFF6FF', '#172554', 'square'), blocks: [
    header('Your studio', 'Hair, nails and spa'), { kind: 'text', text: 'Haircut — LKR 2,000\nColour — from LKR 6,500\nManicure — LKR 2,500' },
    btn('Book an appointment'), { kind: 'contact', phone: '', email: '', address: '' }] } },
  { id: 'card-personal', name: 'Digital business card', group: 'Digital business card', content: { theme: theme('#111827', '#F9FAFB', '#111827'), blocks: [
    header('Your name', 'Job title, Company'), { kind: 'contact', phone: '', email: '', address: '', website: '' }, socials('linkedin', 'x')] } },
  { id: 'card-agent', name: 'Sales agent card', group: 'Digital business card', content: { theme: theme('#B45309', '#FFFBEB', '#451A03'), blocks: [
    header('Your name', 'Sales, Western Province'), btn('Call me'), btn('WhatsApp me'), { kind: 'contact', phone: '', email: '' }, socials('facebook', 'linkedin')] } },
  { id: 'promo-sale', name: 'Seasonal sale', group: 'Promotions', content: { theme: theme('#DC2626', '#FEF2F2', '#450A0A', 'pill'), blocks: [
    header('Avurudu sale', 'Up to 40% off, this week only'), { kind: 'offer', title: 'Use code', text: 'AVURUDU40' },
    products('On sale', ['Item one', 'LKR 1,990'], ['Item two', 'LKR 2,490']), btn('Shop the sale')] } },
  { id: 'promo-event', name: 'Event invitation', group: 'Promotions', content: { theme: theme('#4F46E5', '#EEF2FF', '#1E1B4B'), blocks: [
    header('Your event', 'Saturday, 7pm · Colombo'), { kind: 'text', text: 'Tell guests what to expect, what to bring and where to park.' },
    btn('RSVP'), btn('Get directions'), { kind: 'video', url: '' }] } },
  { id: 'menu-restaurant', name: 'Restaurant menu', group: 'Restaurant menu', content: { theme: theme('#2B4A3A'), blocks: [
    header('Your restaurant', 'Galle Road, Colombo'), { kind: 'offer', title: "Today's offer", text: 'Kottu night: 20% off' },
    btn('Menu'), btn('Leave a Google review'), btn('WhatsApp us'), { kind: 'wifi', ssid: '', password: '' }] } },
  { id: 'menu-cafe', name: 'Café menu', group: 'Restaurant menu', content: { theme: theme('#92400E', '#FFF7ED', '#431407', 'pill', 'serif'), blocks: [
    header('Your café', 'Coffee, cakes and short eats'), products('Favourites', ['Iced coffee', 'LKR 750'], ['Chocolate cake', 'LKR 650'], ['Fish bun', 'LKR 200']),
    btn('Full menu'), { kind: 'wifi', ssid: '', password: '' }] } },
  { id: 'realestate-listing', name: 'Property listing', group: 'Real estate', content: { theme: theme('#065F46', '#ECFDF5', '#022C22', 'square'), blocks: [
    header('3-bedroom house, Nugegoda', 'LKR 45,000,000'), { kind: 'text', text: '3 bedrooms · 2 bathrooms · 10 perches · parking for 2' },
    btn('Book a viewing'), btn('See it on the map'), { kind: 'contact', phone: '', email: '' }] } },
  { id: 'realestate-agent', name: 'Agency listings', group: 'Real estate', content: { theme: theme('#1E3A8A', '#EFF6FF', '#172554'), blocks: [
    header('Your agency', 'Homes and land across Sri Lanka'), products('New this week', ['Apartment, Colombo 5', 'LKR 32M'], ['Land, Kandy', 'LKR 8M']),
    btn('All listings'), btn('Sell with us'), socials('facebook', 'youtube')] } },
];

export const TEMPLATE_GROUPS = [...new Set(PAGE_TEMPLATES.map(t => t.group))];

/** Template content must be a Pages-builder preset. Returns an error message, or '' when valid. Used by the admin API and the AI generator. */
export function templateContentError(c: any, max = 20_000): string {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'content must be an object';
  if (!Array.isArray(c.blocks) || !c.blocks.length || c.blocks.length > 40) return 'content.blocks must be 1 to 40 blocks';
  for (const b of c.blocks) if (!b || !(BLOCK_KINDS as readonly string[]).includes(b.kind)) return `unknown block kind: ${b?.kind}`;
  if (c.theme !== undefined && (typeof c.theme !== 'object' || c.theme === null || Array.isArray(c.theme))) return 'content.theme must be an object';
  if (JSON.stringify(c).length > max) return 'content is too large';
  return '';
}

/** Self-check: npx tsx src/lib/pageTemplates.ts */
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('pageTemplates.ts')) {
  const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
  assert(PAGE_TEMPLATES.length === 12 && TEMPLATE_GROUPS.length === 6, 'twelve templates in six groups');
  assert(new Set(PAGE_TEMPLATES.map(t => t.id)).size === 12, 'unique ids');
  for (const t of PAGE_TEMPLATES) {
    const r = renderGuestPage({ qr_type: 'page', content_data: t.content }, 'en', 'https://s.lk/preview') as any;
    assert(r?.kind === 'html' && r.body.includes(`<h1>${t.content.blocks[0].name.replace('&', '&amp;')}</h1>`), `${t.id} renders its header`);
    assert(JSON.stringify(t.content).length < 20000, `${t.id} fits content_data's 20 KB cap`);
    assert(!templateContentError(t.content), `${t.id} passes templateContentError`);
  }
  assert(templateContentError({ blocks: [{ kind: 'nope' }] }), 'unknown kind rejected');
  assert(templateContentError({ blocks: [] }) && templateContentError('x') && templateContentError({ blocks: [{ kind: 'text' }], theme: 5 }), 'bad shapes rejected');
  console.log('pageTemplates self-check ok');
}
