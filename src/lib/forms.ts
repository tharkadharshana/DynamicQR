// Forms (Phase 9): the definition lives in qr_codes.content_data of a qr_type 'form' code.
// Pure: shared by the server (validation, the trust boundary) and the Worker/renderer (field list).

export const FIELD_TYPES = ['text', 'email', 'phone', 'number', 'textarea', 'select', 'checkbox', 'date', 'rating'] as const;
export type FieldType = typeof FIELD_TYPES[number];
export interface FormField { id: string; type: FieldType; label: string; required?: boolean; options?: string[] }
export const HONEYPOT = '_hp'; // a hidden input people never fill; bots do

const ID_RE = /^[a-z0-9][a-z0-9_]{0,19}$/; // no leading underscore: '_hp' is the honeypot
const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/;

/** The stored definition's fields, dropping anything malformed. */
export function formFields(d: any): FormField[] {
  return (Array.isArray(d?.fields) ? d.fields : []).filter((f: any) =>
    f && ID_RE.test(String(f.id)) && (FIELD_TYPES as readonly string[]).includes(f.type) && typeof f.label === 'string');
}

/** Checks a definition before it is saved. Returns an error message, or null when it is fine. */
export function formDefError(d: any): string | null {
  const fields = Array.isArray(d?.fields) ? d.fields : null;
  if (!fields || !fields.length) return 'A form needs at least one field';
  if (fields.length > 30) return 'A form can have at most 30 fields';
  if (formFields(d).length !== fields.length) return `Each field needs an id (a–z, 0–9, _), a label and a type (${FIELD_TYPES.join(', ')})`;
  if (new Set(fields.map((f: any) => f.id)).size !== fields.length) return 'Field ids must be unique';
  if (fields.some((f: any) => f.type === 'select' && (!Array.isArray(f.options) || !f.options.length))) return 'A select field needs options';
  // Options must be what a browser submits back: trimmed strings with single spaces.
  if (fields.some((f: any) => Array.isArray(f.options) && (f.options.length > 50 || f.options.some((o: unknown) =>
    typeof o !== 'string' || !o || o.length > 100 || o !== o.trim().replace(/\s+/g, ' '))))) return 'Options must be up to 50 trimmed texts of up to 100 characters';
  if (d.notify_email && !EMAIL_RE.test(String(d.notify_email))) return 'notify_email is not a valid email address';
  return null;
}

/**
 * Validates a submission against the stored definition. Unknown fields are stripped; values are trimmed and capped.
 * `spam: true` when the honeypot is filled (the caller drops it silently).
 */
export function validateSubmission(d: any, body: Record<string, unknown>):
  { ok: true; data: Record<string, string | number | boolean>; spam?: boolean } | { ok: false; error: string } {
  if (String(body?.[HONEYPOT] ?? '').trim()) return { ok: true, data: {}, spam: true };
  const data: Record<string, string | number | boolean> = {};
  for (const f of formFields(d)) {
    const raw = body?.[f.id];
    const v = typeof raw === 'string' ? raw.trim() : raw;
    const empty = v === undefined || v === null || v === '' || (f.type === 'checkbox' && !v);
    if (empty) {
      if (f.required) return { ok: false, error: `${f.label} is required` };
      continue;
    }
    const s = String(v);
    switch (f.type) {
      case 'text': if (s.length > 500) return { ok: false, error: `${f.label} is too long` }; data[f.id] = s; break;
      case 'textarea': if (s.length > 5000) return { ok: false, error: `${f.label} is too long` }; data[f.id] = s; break;
      case 'email': if (!EMAIL_RE.test(s)) return { ok: false, error: `${f.label} must be an email address` }; data[f.id] = s; break;
      case 'phone': if (!/^[+\d\s()-]{5,20}$/.test(s)) return { ok: false, error: `${f.label} must be a phone number` }; data[f.id] = s; break;
      case 'number': { const n = Number(s); if (!Number.isFinite(n)) return { ok: false, error: `${f.label} must be a number` }; data[f.id] = n; break; }
      case 'date': if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) return { ok: false, error: `${f.label} must be a date` }; data[f.id] = s; break;
      case 'rating': { const n = Number(s); if (!Number.isInteger(n) || n < 1 || n > 5) return { ok: false, error: `${f.label} must be 1 to 5` }; data[f.id] = n; break; }
      case 'select': if (!(f.options || []).includes(s)) return { ok: false, error: `${f.label}: pick one of the options` }; data[f.id] = s; break;
      case 'checkbox': data[f.id] = true; break;
    }
  }
  return { ok: true, data };
}

/** Self-check: npx tsx src/lib/forms.ts */
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('forms.ts')) {
  const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
  const def = { fields: [
    { id: 'name', type: 'text', label: 'Name', required: true }, { id: 'email', type: 'email', label: 'Email' },
    { id: 'size', type: 'select', label: 'Size', options: ['S', 'M'] }, { id: 'stars', type: 'rating', label: 'Stars' },
    { id: 'ok', type: 'checkbox', label: 'Agree' }, { id: 'when', type: 'date', label: 'Date' }, { id: 'n', type: 'number', label: 'N' },
  ] };
  assert(formDefError(def) === null, 'valid definition');
  assert(formDefError({ fields: [] }) && formDefError({ fields: [{ id: 'A!', type: 'text', label: 'x' }] }) && formDefError({ fields: [{ id: 'a', type: 'select', label: 'x' }] }), 'bad definitions');
  assert(formDefError({ fields: [{ id: 'a', type: 'text', label: 'x' }, { id: 'a', type: 'text', label: 'y' }] }) === 'Field ids must be unique', 'duplicate ids');
  assert(formDefError({ fields: [{ id: '_hp', type: 'text', label: 'x' }] }) && formDefError({ fields: [{ id: 's', type: 'select', label: 'x', options: [1] }] })
    && formDefError({ fields: [{ id: 's', type: 'select', label: 'x', options: ['  A  B '] }] }), 'honeypot id and untrimmed options refused');
  const good = validateSubmission(def, { name: ' Ann ', email: 'a@b.lk', size: 'M', stars: '5', ok: 'on', when: '2026-10-13', n: '3.5', evil: 'x' }) as any;
  assert(good.ok && good.data.name === 'Ann' && good.data.stars === 5 && good.data.ok === true && good.data.n === 3.5, 'valid submission');
  assert(!('evil' in good.data), 'unknown fields stripped');
  assert((validateSubmission(def, { email: 'a@b.lk' }) as any).error === 'Name is required', 'required');
  assert(!(validateSubmission(def, { name: 'A', email: 'nope' }) as any).ok, 'email');
  assert(!(validateSubmission(def, { name: 'A', size: 'XL' }) as any).ok && !(validateSubmission(def, { name: 'A', stars: '6' }) as any).ok, 'select and rating');
  assert((validateSubmission(def, { name: 'A', [HONEYPOT]: 'bot' }) as any).spam === true, 'honeypot');
  console.log('forms self-check ok');
}
