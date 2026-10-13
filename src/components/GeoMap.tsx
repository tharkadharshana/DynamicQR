import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';

const COLORS = ['#1A1916', '#E85D3A', '#4D9EFF', '#3DCC7E', '#9B7FFF', '#F5A623', '#D0021B'];

/** OpenStreetMap with one dot per GPS scan. Leaflet and its CSS load only when a map is shown. */
export default function GeoMap({ points }: { points: { lat: number; lng: number }[] }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import('leaflet').Map | undefined, gone = false;
    Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([{ default: L }]) => {
      if (gone || !el.current) return;
      map = L.map(el.current);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
      const pts = points.map(p => [Number(p.lat), Number(p.lng)] as [number, number]);
      pts.forEach(p => L.circleMarker(p, { radius: 5, color: '#E85D3A', weight: 1, fillOpacity: 0.6 }).addTo(map!));
      if (pts.length > 1) map.fitBounds(pts, { padding: [24, 24], maxZoom: 15 });
      else map.setView(pts[0] || [7.87, 80.77], 7);
    });
    return () => { gone = true; map?.remove(); };
  }, [points]);
  return <div ref={el} style={{ height: '320px', borderRadius: '6px', isolation: 'isolate' }} />;
}

function List({ title, rows, label, n, pct }: { title: string; rows: any[]; label: string; n: string; pct?: boolean }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {rows.length === 0 ? <p style={{ fontSize: '13px', color: 'var(--text3)' }}>No data yet.</p> : rows.map((r, i) => (
          <div key={r[label]} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: COLORS[i % COLORS.length] }}></div>
              <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r[label]}>{r[label]}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 500 }}>{r[n]}</span>
              {pct && <span style={{ color: 'var(--text3)', width: '30px', textAlign: 'right' }}>{r.pct}%</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Phase 10 cards shared by the per-code and account analytics: cities, languages, referrers and the scan map.
 *  `base` is /api/analytics/<slug> or /api/analytics/account/<uid>; `query` is '' or '?slugs=...'. */
export function TrackingCards({ base, query = '' }: { base: string; query?: string }) {
  const [d, setD] = useState<{ cities: any[]; languages: any[]; referrers: any[]; geo: any[] }>({ cities: [], languages: [], referrers: [], geo: [] });
  useEffect(() => {
    const get = (v: string) => apiFetch(`${base}/${v}${query}`).then(r => (Array.isArray(r) ? r : [])).catch(() => []);
    Promise.all(['cities', 'languages', 'referrers', 'geo'].map(get)).then(([cities, languages, referrers, geo]) => setD({ cities, languages, referrers, geo }));
  }, [base, query]);
  return (
    <>
      <div className="mb16" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <List title="Top cities" rows={d.cities} label="city" n="scans" />
        <List title="Languages" rows={d.languages} label="language" n="count" pct />
        <List title="Referrers" rows={d.referrers} label="referrer" n="count" pct />
      </div>
      <div className="card mb16">
        <div className="card-title">Scan map</div>
        <div style={{ marginTop: '16px' }}>
          {d.geo.length ? <GeoMap points={d.geo} /> : <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Turn on GPS tracking on a code to see scans on a map.</p>}
        </div>
      </div>
    </>
  );
}
