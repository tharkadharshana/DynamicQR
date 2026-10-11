// Run after `npm run build`. Guards the Lighthouse fixes from 2026-10-11:
// - the landing entry chunk stays small (dashboard pages, recharts, qr-code-styling and motion are lazy chunks),
// - the agent-facing files in public/ keep the shape Lighthouse checks.
import { readFileSync, statSync } from 'node:fs';

const ENTRY_BUDGET_KB = 800; // 697 KB when this was added; 1600 KB before route splitting
const bad = [];

const html = readFileSync('dist/index.html', 'utf8');
const entry = html.match(/<script type="module"[^>]*src="\/(assets\/index-[^"]+\.js)"/)?.[1];
if (!entry) bad.push('dist/index.html: no module entry script found');
else {
  const kb = Math.round(statSync(`dist/${entry}`).size / 1024);
  if (kb > ENTRY_BUDGET_KB) bad.push(`${entry} is ${kb} KB (budget ${ENTRY_BUDGET_KB} KB). Is a page or heavy library imported eagerly from App.tsx, Landing.tsx or UIContext.tsx?`);
  else console.log(`ok: entry ${entry} ${kb} KB`);
}

const llms = readFileSync('public/llms.txt', 'utf8');
if (!/^# \S/.test(llms)) bad.push('public/llms.txt must start with an H1 ("# Title")');
if (!/\]\(https?:\/\//.test(llms)) bad.push('public/llms.txt must contain markdown links');

const sitemap = readFileSync('public/sitemap.xml', 'utf8');
for (const path of ['/features', '/blog', '/pricing', '/api-docs']) {
  if (sitemap.includes(`tharkak.com${path}<`)) bad.push(`public/sitemap.xml lists ${path}, which is not a public page`);
}

if (bad.length) {
  console.error('Frontend build checks failed:\n  ' + bad.join('\n  '));
  process.exit(1);
}
console.log('ok: llms.txt and sitemap.xml');
