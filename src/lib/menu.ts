// Restaurant menu data shared by the Kit wizard, the AI routes and the guest-page renderer.
// A menu is `{ sections: [{ name, items: [{ name, description?, price?, image? }] }] }` and lives in a page's `menu` block.

export interface MenuItem { name: string; description?: string; price?: string; image?: string }
export interface MenuSection { name: string; items: MenuItem[] }
export interface Menu { sections: MenuSection[] }

export const MENU_LIMITS = { sections: 12, items: 40, name: 80, description: 200, price: 24, json: 15_000 };

/** The JSON schema the AI must answer with (OpenAI structured outputs, strict mode: every key required). */
export const MENU_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['sections'],
  properties: { sections: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['name', 'items'],
    properties: { name: { type: 'string' }, items: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['name', 'description', 'price'],
      properties: { name: { type: 'string' }, description: { type: 'string' }, price: { type: 'string' } },
    } } },
  } } },
} as const;

const text = (v: unknown, max: number) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Clean any menu-shaped input (from the AI, a file import or the editor): strip tags, cap sizes, drop empty entries. Never throws. */
export function normalizeMenu(input: any): Menu {
  const sections: MenuSection[] = [];
  for (const s of (Array.isArray(input?.sections) ? input.sections : []).slice(0, MENU_LIMITS.sections)) {
    const name = text(s?.name, MENU_LIMITS.name);
    const items: MenuItem[] = [];
    for (const it of (Array.isArray(s?.items) ? s.items : []).slice(0, MENU_LIMITS.items)) {
      const n = text(it?.name, MENU_LIMITS.name);
      if (!n) continue;
      const image = /^https:\/\//i.test(String(it?.image || '')) ? String(it.image).slice(0, 500) : '';
      items.push({ name: n, ...(text(it?.description, MENU_LIMITS.description) ? { description: text(it.description, MENU_LIMITS.description) } : {}),
        ...(text(it?.price, MENU_LIMITS.price) ? { price: text(it.price, MENU_LIMITS.price) } : {}), ...(image ? { image } : {}) });
    }
    if (name && items.length) sections.push({ name, items });
  }
  // Keep the whole page under content_data's cap: drop trailing items until the menu fits.
  while (JSON.stringify(sections).length > MENU_LIMITS.json) {
    const last = sections[sections.length - 1];
    if (!last) break;
    last.items.pop();
    if (!last.items.length) sections.pop();
  }
  return { sections };
}

/** Self-check: npx tsx src/lib/menu.ts */
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('menu.ts')) {
  const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
  const m = normalizeMenu({ sections: [
    { name: '<b>Starters</b>', items: [{ name: 'Fish bun', description: 'x'.repeat(500), price: 'LKR 200', image: 'javascript:alert(1)' }, { name: '  ' }, { name: 'Bruschetta', price: 650 }] },
    { name: '', items: [{ name: 'Orphan' }] }, { name: 'Empty', items: [] }, 'junk',
  ] });
  assert(m.sections.length === 1 && m.sections[0].name === 'Starters', 'tags stripped, empty and nameless sections dropped');
  assert(m.sections[0].items.length === 2 && m.sections[0].items[0].description!.length === MENU_LIMITS.description && !m.sections[0].items[0].image, 'description capped, unsafe image dropped, blank item dropped');
  assert(m.sections[0].items[1].price === '650', 'numbers become text');
  assert(normalizeMenu(null).sections.length === 0 && normalizeMenu({ sections: 5 }).sections.length === 0, 'junk input gives an empty menu');
  const big = normalizeMenu({ sections: Array.from({ length: 12 }, (_, i) => ({ name: `S${i}`, items: Array.from({ length: 40 }, (_, j) => ({ name: `Item ${i}-${j}`, description: 'd'.repeat(200), price: '1' })) })) });
  assert(JSON.stringify(big.sections).length <= MENU_LIMITS.json && big.sections.length > 0, 'a huge menu is trimmed to fit');
  console.log('menu self-check ok');
}
