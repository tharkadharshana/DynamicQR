import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { buildNotices } from '../lib/notices';

// The bell: a popover with account notices worked out from the plan data (and AI credit use). There is no notification
// table yet, so cleared items are remembered per browser (ponytail: upgrade path is a notifications table with read flags).

const KEY = 'scnr_notifs_cleared';
const read = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (ids: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(ids.slice(-200))); } catch { /* private mode: they come back next visit */ } };

const ICON: Record<string, string> = { warn: '⚠', info: 'ⓘ', bad: '⛔' };

export default function NotificationBell({ planData }: { planData?: any }) {
  const [open, setOpen] = useState(false);
  const [cleared, setCleared] = useState<string[]>(read);
  const [ai, setAi] = useState<{ used_credits: number; limit_credits: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { apiFetch('/api/ai/usage').then(r => r?.enabled && setAi(r)).catch(() => {}); }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const all = useMemo(() => buildNotices(planData, ai), [planData, ai]);
  const items = all.filter(n => !cleared.includes(n.id));
  const clear = (ids: string[]) => { const next = [...new Set([...cleared, ...ids])]; setCleared(next); write(next); };

  return (
    <div className="notif" ref={box}>
      <button className="btn btn-icon btn-sm bell-btn" aria-label={items.length ? `Notifications, ${items.length} new` : 'Notifications'} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></svg>
        {items.length > 0 && <span className="bell-dot" />}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <b>Notifications</b>
            <button className="notif-clear" disabled={!items.length} onClick={() => clear(items.map(n => n.id))}>Clear all</button>
          </div>
          {items.length === 0 ? (
            <div className="notif-empty"><span>🔔</span><b>You are all caught up</b><small>New notices about your plan, scans and AI credits show up here.</small></div>
          ) : (
            <ul className="notif-list">
              {items.map(n => (
                <li key={n.id} className={`notif-item ${n.tone}`}>
                  <span className="notif-ic" aria-hidden="true">{ICON[n.tone]}</span>
                  <div>
                    <b>{n.title}</b>
                    <p>{n.text}</p>
                    {n.to && <Link to={n.to} onClick={() => setOpen(false)}>{n.cta || 'Open'} →</Link>}
                  </div>
                  <button className="notif-x" aria-label={`Dismiss: ${n.title}`} onClick={() => clear([n.id])}>×</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
