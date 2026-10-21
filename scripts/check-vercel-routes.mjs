// The SPA catch-all in vercel.json once excluded everything starting with "api", so a direct load of the
// /api-docs page returned 404. Check which rewrite each path hits, using Vercel's own matching rules.
import { readFileSync } from 'node:fs';

const { rewrites } = JSON.parse(readFileSync('vercel.json', 'utf8'));
const destinationFor = (path) => {
  for (const r of rewrites) {
    // Vercel source patterns are path-to-regexp; the ones used here are plain regex groups plus "(.*)".
    if (new RegExp('^' + r.source + '$').test(path)) return r.destination;
  }
  return null; // no rewrite: a static file or a 404
};

const cases = [
  ['/api/health', '/api/index.ts'],
  ['/api/v1/qr', '/api/index.ts'],
  ['/internal/slug/abc', '/api/index.ts'],
  ['/api-docs', '/index.html'], // a page route that merely starts with "api"
  ['/pricing', '/index.html'],
  ['/tools/qr-scanner', '/index.html'],
  ['/pages/new', '/index.html'],
  ['/analytics/abc1234', '/index.html'],
  ['/assets/index-abc.js', null],
];
let bad = 0;
for (const [path, want] of cases) {
  const got = destinationFor(path);
  if (got !== want) { console.error(`FAIL ${path}: expected ${want}, got ${got}`); bad++; }
}
if (bad) process.exit(1);
console.log(`ok: ${cases.length} paths hit the expected rewrite`);
