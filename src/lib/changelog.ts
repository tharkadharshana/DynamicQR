// What's new: written for customers, newest first. The developer changelog is docs/CHANGELOG.md.
// Only list what the app does today; add an entry in the PR that ships the feature.

export interface ChangelogEntry { date: string; title: string; items: string[] }

export const CHANGELOG: ChangelogEntry[] = [
  { date: '2026-10-13', title: 'Free tools, and help when you need it', items: [
    'Free QR scanner, UTM link builder, Google review link maker, WhatsApp link maker and a static QR generator. No sign-in needed.',
    'A WhatsApp help button in the app and on the pricing page.',
  ] },
  { date: '2026-10-12', title: 'Business plan, webhooks and workspaces', items: [
    'The Business plan: 2,000 codes, 25 team members, 10 workspaces and up to 50 custom domains.',
    'Webhooks send a signed message to your own system when a code is scanned, created, changed or deleted, or a form is answered.',
    'Workspaces keep clients or brands apart. Invite a team member to just one workspace.',
    'Teams and Business accounts can connect several custom domains and choose one for each code.',
    'A Settings menu that brings workspaces, members, domains, webhooks, export, bulk create and the API together.',
  ] },
  { date: '2026-10-11', title: 'Know where your scans come from, and route them', items: [
    'Top cities, languages and referring sites for every code and for your whole account.',
    'Optional GPS tracking: scanners are asked once, can say no, and still reach your link. Locations are rounded to about 100 m and shown on a map.',
    'Smart routing sends people to different links by device, country, language, weekday or time of day.',
  ] },
  { date: '2026-10-10', title: 'Forms', items: [
    'Build a form, print its QR code and collect answers. Get each answer by email, see them in a table, download a CSV or delete them.',
    'Built-in spam protection: a hidden trap field and a limit on answers from one visitor.',
  ] },
  { date: '2026-10-09', title: 'Short links, folders and tags', items: [
    'Shorten any link with your own back-half, like scnr.tharkak.com/menu-2026 (Pro and up).',
    'Folders, tags, search and sorting. Select many codes to move, tag, switch on or off, delete, or download as a ZIP of SVGs.',
    'UTM tags for your campaigns, added to the link when someone scans.',
  ] },
  { date: '2026-10-08', title: 'Pages builder and templates', items: [
    'Build a mobile page from blocks: header, social icons, buttons, images, video, products, a contact card with Save as contact, offers and Wi-Fi.',
    'Twelve templates for link-in-bio, products and services, business cards, promotions, menus and real estate.',
    'See how many people tap each button, with the share of visitors who did.',
  ] },
  { date: '2026-10-07', title: 'More code types and designs', items: [
    'New code types: PDF, Google review, Instagram, Facebook, TikTok, YouTube, LinkedIn, X, phone, SMS, location, event, app store and GS1 Digital Link.',
    'More dot styles, a gradient, a circle shape, frames with a call to action like "Scan me", and a saved brand style for new codes.',
  ] },
  { date: '2026-10-06', title: 'New plans', items: [
    'Four plans: Free, Pro, Team and Business, with clear limits for codes, short links, pages and forms.',
    'Free now keeps 90 days of statistics, and you can put a logo on a Free code.',
  ] },
];

/** Self-check: npx tsx src/lib/changelog.ts */
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('changelog.ts')) {
  const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
  assert(CHANGELOG.length > 0, 'has entries');
  for (const [i, e] of CHANGELOG.entries()) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.title && e.items.length > 0 && e.items.every(x => x.length > 10), `entry ${i} is complete`);
    if (i) assert(CHANGELOG[i - 1].date >= e.date, `entry ${i} is older than the one before it`);
  }
  console.log('changelog self-check ok');
}
