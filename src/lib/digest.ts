// Weekly scan digest: pure builder (no I/O). The cron route feeds it the last 7 days of scans.

export type DigestInput = {
  businessName: string;
  timezone: string;                     // owner's time zone, e.g. Asia/Colombo
  qrs: { slug: string; title: string }[];
  scans: { slug: string; scanned_at: string }[];
  appUrl: string;
};

export type Digest = { subject: string; html: string; total: number; busiestHour: number | null; top: string | null };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const hourIn = (iso: string, tz: string) => {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(new Date(iso)));
  } catch {
    return new Date(iso).getUTCHours();
  }
};

export function buildDigest(i: DigestInput): Digest {
  const total = i.scans.length;
  const byHour = new Array(24).fill(0);
  const bySlug: Record<string, number> = {};
  for (const s of i.scans) {
    byHour[hourIn(s.scanned_at, i.timezone)]++;
    bySlug[s.slug] = (bySlug[s.slug] || 0) + 1;
  }
  const busiestHour = total ? byHour.indexOf(Math.max(...byHour)) : null;
  const topSlug = Object.entries(bySlug).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const top = topSlug ? i.qrs.find(q => q.slug === topSlug)?.title || topSlug : null;
  const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`;

  const subject = total
    ? `${total} scan${total === 1 ? '' : 's'} this week${top ? ` · top: ${top}` : ''}`
    : 'No scans this week — a fresh offer might help';
  const body = total
    ? `<p><b>${total}</b> scan${total === 1 ? '' : 's'} in the last 7 days.</p>
       <p>Busiest time: <b>${hourLabel(busiestHour!)}</b>. Most-scanned code: <b>${esc(top)}</b>.</p>
       <p>Tip: put a new offer live just before ${hourLabel(busiestHour!).slice(0, 5)} — it takes seconds and no reprint.</p>`
    : `<p>Your codes had no scans in the last 7 days. Check they are visible on tables and windows, or put a new offer live.</p>`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;color:#16171b">
    <h2 style="margin:0 0 12px">${esc(i.businessName || 'Your weekly scans')}</h2>${body}
    <p><a href="${esc(i.appUrl)}/" style="background:#E85D3A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open dashboard</a></p>
    <p style="font-size:12px;color:#77787e">You get this every Monday. Turn it off in Settings.</p></div>`;
  return { subject, html, total, busiestHour, top };
}

/** Self-check: npx tsx src/lib/digest.ts */
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('digest.ts')) {
  const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
  // 13:30Z and 14:10Z are 19:00 and 19:40 in Colombo (UTC+5:30).
  const d = buildDigest({
    businessName: 'Café <Lagoon>', timezone: 'Asia/Colombo', appUrl: 'https://x',
    qrs: [{ slug: 'aaaaaaa', title: 'Table' }, { slug: 'bbbbbbb', title: 'Window' }],
    scans: [{ slug: 'aaaaaaa', scanned_at: '2026-10-05T13:30:00Z' }, { slug: 'aaaaaaa', scanned_at: '2026-10-05T14:10:00Z' }, { slug: 'bbbbbbb', scanned_at: '2026-10-06T03:00:00Z' }],
  });
  assert(d.total === 3 && d.busiestHour === 19 && d.top === 'Table', `numbers ${JSON.stringify(d)}`);
  assert(d.html.includes('Café &lt;Lagoon&gt;'), 'escapes name');
  assert(buildDigest({ businessName: '', timezone: 'Bad/Zone', appUrl: 'x', qrs: [], scans: [] }).subject.startsWith('No scans'), 'empty week');
  console.log('digest self-check ok');
}
