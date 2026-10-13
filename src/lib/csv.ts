// Minimal RFC-4180 CSV parser for bulk import: quoted fields, escaped quotes (""), commas and
// newlines inside quotes, CRLF. Returns rows of strings. No dependency.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQuotes = false;
  const src = text.replace(/^﻿/, ''); // strip a UTF-8 BOM (Excel)
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f !== '')) rows.push(row);
  return rows;
}

/** Header row → objects keyed by lower-cased header names. */
export function csvToObjects(text: string): Record<string, string>[] {
  const [head, ...body] = parseCsv(text);
  if (!head) return [];
  const keys = head.map(h => h.trim().toLowerCase());
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/** Rows → RFC-4180 CSV (CRLF, quoted when needed, a leading quote mark on formula-like cells so spreadsheets don't run them). */
export function toCsv(rows: unknown[][]): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(cell).join(',')).join('\r\n');
}

/** Self-check: npx tsx src/lib/csv.ts */
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('csv.ts')) {
  const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
  const rows = parseCsv('﻿title,destination_url,client\r\n"Menu, main","https://a.lk/m?x=1",Café\n"Say ""hi""",https://b.lk,\n\n"multi\nline",https://c.lk,X');
  assert(rows.length === 4, `rows ${rows.length}`);
  assert(rows[1][0] === 'Menu, main' && rows[1][2] === 'Café', 'quoted comma');
  assert(rows[2][0] === 'Say "hi"' && rows[2][2] === '', 'escaped quotes + empty field');
  assert(rows[3][0] === 'multi\nline', 'newline in quotes');
  const objs = csvToObjects('Title,Destination_URL\nA,https://a');
  assert(objs[0].title === 'A' && objs[0].destination_url === 'https://a', 'objects');
  const out = toCsv([['a', 'b,c'], ['say "hi"', '=SUM(A1)'], [null, 3]]);
  assert(out === 'a,"b,c"\r\n"say ""hi""",\'=SUM(A1)\r\n,3', 'toCsv: ' + JSON.stringify(out));
  assert(JSON.stringify(parseCsv(toCsv([['x\ny', 'z']]))) === JSON.stringify([['x\ny', 'z']]), 'toCsv round-trips');
  console.log('csv self-check ok');
}
