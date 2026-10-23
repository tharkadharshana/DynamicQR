// Page templates: plain content_data presets for the Pages builder, grouped by use case like Bitly's picker.
// Plain colour blocks, no stock photos: the owner adds their own images. Rendered by renderGuestPage.
import { renderGuestPage, BLOCK_KINDS, esc } from './guestPage.js';

export interface PageTemplate { id: string; name: string; group: string; content: any; description?: string; tags?: string[] }

const theme = (accent: string, bg = '#FFF8F2', text = '#24180F', button = 'rounded', font = 'system', more: Record<string, string> = {}) => ({ accent, bg, text, button, font, ...more });
// A dark page: dark cards and lines, the header sits on the page background.
const dark = (accent: string, bg: string, bg2 = '', card = '#1C1D33', line = '#34365A') => theme(accent, bg, '#F4F4FA', 'rounded', 'system', { bg2, card, line, header: 'plain' });
const header = (name: string, tagline: string, emoji = '') => ({ kind: 'header', name, tagline, ...(emoji ? { emoji } : {}) });
const btn = (label: string, url = 'https://') => ({ kind: 'button', label, url });
const socials = (...networks: string[]) => ({ kind: 'socials', items: networks.map(network => ({ network, handle: '' })) });
const products = (title: string, ...items: [string, string][]) => ({ kind: 'products', title, items: items.map(([t, price]) => ({ title: t, price, url: 'https://' })) });

// The built-in templates. The API seeds them into `page_templates` (see seedTemplates in server/index.ts); admins edit them there.
export const PAGE_TEMPLATES: PageTemplate[] = [
  { id: 'bio-creator', name: 'Creator Link-in-Bio', group: 'Link in Bio', description: 'Clean and modern layout for creators and influencers.', tags: ['link in bio', 'minimal'], content: { theme: theme('#7C3AED', '#F3E8FF', '#1E1B4B', 'pill', 'system', { bg2: '#E0E7FF', header: 'plain', line: '#E5DAFB' }), blocks: [
    header('Create Your Story', 'Follow · Connect · Explore', '🎨'), btn('Instagram'), btn('YouTube'), btn('TikTok'), btn('Website'), socials('instagram', 'tiktok', 'youtube')] } },
  { id: 'bio-business', name: 'Business Link-in-Bio', group: 'Link in Bio', description: 'Professional and minimal for businesses and brands.', tags: ['link in bio', 'business', 'dark mode'], content: { theme: dark('#6366F1', '#0E1020', '#161A33'), blocks: [
    header('Your Brand', 'Build. Innovate. Grow.', '◆'), btn('Website'), btn('Products'), btn('Blog'), btn('Contact'), socials('linkedin', 'x', 'facebook')] } },
  { id: 'bio-foodie', name: 'Foodie Link-in-Bio', group: 'Link in Bio', description: 'Perfect for food, cafés and restaurants.', tags: ['link in bio', 'restaurant'], content: { theme: theme('#16A34A', '#F0FDF4', '#14532D', 'pill', 'system', { bg2: '#FEF9C3', header: 'plain', line: '#D9F2C7' }), blocks: [
    header('Good Food, Good Mood', 'Great food, every day', '🍅'), btn('View Menu'), btn('Order Now'), btn('Location'), btn('Contact'), socials('instagram', 'facebook')] } },
  { id: 'bio-portfolio', name: 'Personal Portfolio', group: 'Link in Bio', description: 'Showcase your work and skills beautifully.', tags: ['link in bio', 'dark mode', 'minimal'], content: { theme: dark('#8B5CF6', '#0F1022', '#241447'), blocks: [
    header("Let's Connect", 'Designer · Developer', '🧑‍💻'), btn('Portfolio'), btn('Resume'), btn('LinkedIn'), btn('Contact'), socials('linkedin', 'github', 'x')] } },
  { id: 'shop-products', name: 'Product Showcase', group: 'Business & Services', description: 'Highlight your products with clean and clear design.', tags: ['business', 'minimal'], content: { theme: theme('#111827', '#FFFFFF', '#111827', 'rounded', 'system', { bg2: '#F3F4F6', line: '#E5E7EB' }), blocks: [
    header('Your Shop', 'Handmade in Sri Lanka', '◎'), products('Best sellers', ['Product one', 'LKR 2,500'], ['Product two', 'LKR 3,900'], ['Product three', 'LKR 1,200']),
    btn('See the full catalogue'), btn('Order on WhatsApp'), socials('instagram', 'facebook')] } },
  { id: 'shop-services', name: 'Services Menu', group: 'Business & Services', description: 'List your services with beautiful cards.', tags: ['business', 'dark mode'], content: { theme: dark('#6366F1', '#1B1440', '#2B1F78', '#2A2570', '#443C9C'), blocks: [
    header('Our Services', 'What we do best'), btn('Web Development'), btn('UI/UX Design'), btn('Consulting'), btn('Support')] } },
  { id: 'card-personal', name: 'Digital Business Card', group: 'Business & Services', description: 'Modern digital business card for professionals.', tags: ['business', 'dark mode'], content: { theme: dark('#38BDF8', '#111318', '#1B1F29', '#242833', '#343947'), blocks: [
    header('Alex Carter', 'Product Designer', '👤'), btn('Call'), btn('Email'), btn('Website'), btn('Location'), { kind: 'contact', phone: '', email: '', address: '', website: '' }] } },
  { id: 'agency-listing', name: 'Agency Listing', group: 'Business & Services', description: 'Perfect for agencies and creative studios.', tags: ['business', 'minimal'], content: { theme: theme('#2563EB', '#EFF6FF', '#172554', 'rounded', 'system', { bg2: '#E0ECFF', header: 'plain', line: '#CFE0FB' }), blocks: [
    header('Creative Studio', 'We build digital experiences that matter', '▣'), btn('Our Work'), btn('Services'), btn('Contact'), socials('linkedin', 'instagram')] } },
  { id: 'menu-restaurant', name: 'Restaurant Menu', group: 'Restaurant & Food', description: 'Beautiful menu with categories and images.', tags: ['restaurant', 'dark mode'], content: { theme: dark('#F59E0B', '#16130F', '#241B12', '#2A241C', '#3D3427'), blocks: [
    header('The Good Menu', 'Galle Road, Colombo', '🍽️'), { kind: 'offer', title: "Today's offer", text: 'Kottu night: 20% off' },
    btn('Appetizers'), btn('Main Course'), btn('Desserts'), btn('Drinks'), { kind: 'wifi', ssid: '', password: '' }] } },
  { id: 'menu-cafe', name: 'Café Menu', group: 'Restaurant & Food', description: 'Simple and elegant for cafés and coffee shops.', tags: ['restaurant', 'minimal'], content: { theme: theme('#D97706', '#FFF7ED', '#431407', 'pill', 'serif', { bg2: '#FFEBD6', header: 'plain', line: '#F5DCC0' }), blocks: [
    header('Sunny Café', 'Coffee, cakes and short eats', '☕'), btn('Coffee'), btn('Tea'), btn('Pastries'), btn('Specials'), { kind: 'wifi', ssid: '', password: '' }] } },
  { id: 'food-ordering', name: 'Food Ordering', group: 'Restaurant & Food', description: 'Let customers order directly from your page.', tags: ['restaurant', 'promo'], content: { theme: theme('#DC2626', '#DC2626', '#FFFFFF', 'rounded', 'system', { bg2: '#B91C1C', header: 'plain', card: '#FDE8E8', line: '#F7BFBF' }), blocks: [
    header('Order Delicious Food', 'Fresh, hot and fast', '🍔'), btn('Menu'), btn('Delivery'), btn('Pickup'), btn('Order on WhatsApp')] } },
  { id: 'food-reservation', name: 'Restaurant Reservation', group: 'Restaurant & Food', description: 'Let customers book a table in seconds.', tags: ['restaurant', 'dark mode'], content: { theme: dark('#EF4444', '#15151A', '#202028', '#23242C', '#3A3B46'), blocks: [
    header('Table Reservation', 'Book your table', '🥂'), btn('Choose a time'), btn('Party size'), btn('Book a Table'), { kind: 'contact', phone: '', email: '', address: '' }] } },
  { id: 'promo-sale', name: 'Seasonal Sale', group: 'Promotions & Events', description: 'Perfect for seasonal offers and discounts.', tags: ['promo'], content: { theme: theme('#F97316', '#F97316', '#FFFFFF', 'pill', 'system', { bg2: '#EA580C', header: 'plain', line: '#FDBA74' }), blocks: [
    header('Big Summer Sale', 'Up to 50% off', '☀️'), { kind: 'offer', title: 'Use code', text: 'SUMMER50' }, btn('Shop Now')] } },
  { id: 'promo-event', name: 'Event Invitation', group: 'Promotions & Events', description: 'Invite people to your events and webinars.', tags: ['event', 'dark mode'], content: { theme: dark('#6366F1', '#1E1B4B', '#312E81', '#2B2870', '#4642A8'), blocks: [
    header("You're Invited", 'Tech Conference 2026 · May 15 · 9:00 AM', '🎟️'), { kind: 'text', text: 'Tell guests what to expect, what to bring and where to park.' }, btn('Join Event'), btn('Get directions')] } },
  { id: 'promo-card', name: 'Promotion Card', group: 'Promotions & Events', description: 'Simple and effective promo landing page.', tags: ['promo'], content: { theme: theme('#15803D', '#15803D', '#FFFFFF', 'pill', 'system', { bg2: '#166534', header: 'plain', card: '#ECFDF3', line: '#BBF7D0' }), blocks: [
    header('Limited Time Offer', 'Get 20% Off', '🎁'), { kind: 'offer', title: 'Your code', text: 'SAVE20' }, btn('Claim Offer')] } },
  { id: 'promo-feedback', name: 'Feedback Form', group: 'Promotions & Events', description: 'Collect customer feedback and reviews with ease.', tags: ['event', 'minimal'], content: { theme: theme('#7C3AED', '#FAF5FF', '#3B0764', 'rounded', 'system', { bg2: '#EEF2FF', header: 'plain', line: '#E9D8FD' }), blocks: [
    header('We Value Your Feedback', 'How did we do?', '😊'), btn('Leave a comment'), btn('Rate us on Google')] } },
  { id: 'realestate-listing', name: 'Property Listing', group: 'Real Estate', description: 'Show a home with details, map and booking.', tags: ['real estate'], content: { theme: theme('#065F46', '#ECFDF5', '#022C22', 'square'), blocks: [
    header('3-bedroom house, Nugegoda', 'LKR 45,000,000'), { kind: 'text', text: '3 bedrooms · 2 bathrooms · 10 perches · parking for 2' },
    btn('Book a viewing'), btn('See it on the map'), { kind: 'contact', phone: '', email: '' }] } },
  { id: 'realestate-agent', name: 'Agency Listings', group: 'Real Estate', description: 'Homes and land from your agency in one page.', tags: ['real estate', 'business'], content: { theme: theme('#1E3A8A', '#EFF6FF', '#172554'), blocks: [
    header('Your agency', 'Homes and land across Sri Lanka'), products('New this week', ['Apartment, Colombo 5', 'LKR 32M'], ['Land, Kandy', 'LKR 8M']),
    btn('All listings'), btn('Sell with us'), socials('facebook', 'youtube')] } },
];
/** Built-ins that were removed from the list; the seeder deletes them if an admin never edited them. */
export const REMOVED_TEMPLATE_IDS = ['card-agent'];

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
  assert(PAGE_TEMPLATES.length === 18 && TEMPLATE_GROUPS.length === 5, 'eighteen templates in five groups');
  assert(new Set(PAGE_TEMPLATES.map(t => t.id)).size === 18, 'unique ids');
  for (const t of PAGE_TEMPLATES) {
    const r = renderGuestPage({ qr_type: 'page', content_data: t.content }, 'en', 'https://s.lk/preview') as any;
    assert(r?.kind === 'html' && r.body.includes(`<h1>${esc(t.content.blocks[0].name)}</h1>`), `${t.id} renders its header`);
    assert(JSON.stringify(t.content).length < 20000, `${t.id} fits content_data's 20 KB cap`);
    assert(!templateContentError(t.content), `${t.id} passes templateContentError`);
  }
  assert(templateContentError({ blocks: [{ kind: 'nope' }] }), 'unknown kind rejected');
  assert(templateContentError({ blocks: [] }) && templateContentError('x') && templateContentError({ blocks: [{ kind: 'text' }], theme: 5 }), 'bad shapes rejected');
  console.log('pageTemplates self-check ok');
}
