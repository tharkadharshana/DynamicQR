// Vercel runs api/index.ts → server.ts as Node ESM, which does not resolve extensionless relative
// imports (tsx and Vite do, so local QA cannot catch it). Walk the server import graph and fail on any
// relative import without an explicit .js extension.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const seen = new Set();
const bad = [];
const walk = (file) => {
  if (seen.has(file)) return;
  seen.add(file);
  for (const [, spec] of readFileSync(file, 'utf8').matchAll(/from\s+'(\.\.?\/[^']+)'/g)) {
    if (!spec.endsWith('.js')) { bad.push(`${file}: '${spec}'`); continue; }
    const base = normalize(join(dirname(file), spec.slice(0, -3)));
    const next = ['.ts', '.js'].map(ext => base + ext).find(existsSync);
    if (next) walk(next);
  }
};
walk('api/index.ts');

if (bad.length) {
  console.error('Relative imports without .js in the server graph (breaks on Vercel):\n  ' + bad.join('\n  '));
  process.exit(1);
}
console.log(`ok: ${seen.size} server files, all relative imports end in .js`);
