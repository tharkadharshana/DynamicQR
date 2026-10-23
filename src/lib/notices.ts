// Account notices for the bell, worked out from the plan snapshot (there is no notification table yet).

export interface Notice { id: string; tone: 'warn' | 'info' | 'bad'; title: string; text: string; to?: string; cta?: string }

/** The notices for a plan snapshot. Pure, so it can be checked on its own. Ids include the month or date so a new situation notifies again. */
export function buildNotices(p: any, ai?: { used_credits: number; limit_credits: number } | null, now = new Date()): Notice[] {
  if (!p) return [];
  const out: Notice[] = [];
  const month = now.toISOString().slice(0, 7);
  if (p.plan === 'free' && !p.is_trial) {
    out.push({ id: `lapsed-${p.is_expired ? 'paid' : 'trial'}`, tone: 'bad', title: p.is_expired ? 'Your subscription has expired' : 'Your free trial has ended', text: 'Free keeps 3 codes, 1 of them dynamic. Upgrade to keep everything live.', to: '/billing', cta: 'See plans' });
  }
  if (p.pause_on) {
    const n = p.dynamic_over_allowance || 0;
    out.push({ id: `pause-${String(p.pause_on).slice(0, 10)}`, tone: 'warn', title: `${n} dynamic code${n === 1 ? '' : 's'} will pause`, text: `${new Date(p.pause_on) > now ? 'Pauses on' : 'Paused on'} ${new Date(p.pause_on).toLocaleDateString()}. Nothing is deleted, and upgrading brings them back.`, to: '/billing', cta: 'Upgrade' });
  }
  const left = p.plan_expires_at ? Math.ceil((new Date(p.plan_expires_at).getTime() - now.getTime()) / 86400000) : null;
  if (p.plan !== 'free' && left !== null && left >= 0 && left <= 7) {
    out.push({ id: `renew-${String(p.plan_expires_at).slice(0, 10)}`, tone: 'warn', title: `Your plan ends in ${left} day${left === 1 ? '' : 's'}`, text: 'Renew to keep your plan limits and features.', to: '/billing', cta: 'Renew' });
  }
  const cap = p.limits?.monthly_scans || 0;
  if (cap && (p.monthly_scans_used || 0) / cap >= 0.8) {
    const pct = Math.min(100, Math.round(((p.monthly_scans_used || 0) / cap) * 100));
    out.push({ id: `scans-${month}-${pct >= 100 ? 100 : 80}`, tone: pct >= 100 ? 'bad' : 'warn', title: pct >= 100 ? 'Monthly scan limit reached' : `${pct}% of your monthly scans used`, text: `${(p.monthly_scans_used || 0).toLocaleString()} of ${cap.toLocaleString()} scans this month.`, to: '/billing', cta: 'Get more scans' });
  }
  if (ai && ai.limit_credits > 0 && ai.used_credits / ai.limit_credits >= 0.8) {
    const out100 = ai.used_credits >= ai.limit_credits;
    out.push({ id: `ai-${month}-${out100 ? 100 : 80}`, tone: out100 ? 'bad' : 'warn', title: out100 ? 'AI credits used up' : 'AI credits running low', text: `${ai.used_credits} of ${ai.limit_credits} credits used this month.`, to: '/billing', cta: 'Upgrade' });
  }
  return out;
}

/** Self-check: npx tsx src/lib/notices.ts */
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('notices.ts')) {
  const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
  const now = new Date('2026-10-23T10:00:00Z');
  assert(buildNotices(null).length === 0, 'no plan data, no notices');
  assert(buildNotices({ plan: 'pro', is_trial: false, limits: { monthly_scans: 1000 }, monthly_scans_used: 100 }, null, now).length === 0, 'a healthy account has none');
  const lapsed = buildNotices({ plan: 'free', is_trial: false, limits: { monthly_scans: 1000 }, monthly_scans_used: 850, pause_on: '2026-11-01T00:00:00Z', dynamic_over_allowance: 2 }, { used_credits: 290, limit_credits: 300 }, now);
  assert(lapsed.map(n => n.id).join() === 'lapsed-trial,pause-2026-11-01,scans-2026-10-80,ai-2026-10-80', `lapsed trial, pause, 85% scans, 97% AI: ${lapsed.map(n => n.id)}`);
  assert(buildNotices({ plan: 'free', is_trial: true, limits: { monthly_scans: 1000 }, monthly_scans_used: 1000 }, null, now)[0].tone === 'bad', 'full scan quota is bad');
  assert(buildNotices({ plan: 'pro', limits: {}, plan_expires_at: '2026-10-26T10:00:00Z' }, null, now)[0].id === 'renew-2026-10-26', 'plan ending in 3 days');
  assert(buildNotices({ plan: 'pro', limits: {}, plan_expires_at: '2026-12-26T10:00:00Z' }, null, now).length === 0, 'plan ending in 2 months is quiet');
  console.log('notices self-check ok');
}
