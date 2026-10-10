import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';

// Documents only what exists: the dashboard's own routes, reachable under /api/v1 with an API key.
const ENDPOINTS: [string, string, string][] = [
  ['GET', '/qr', 'List your codes (each with its stats)'],
  ['POST', '/qr', 'Create a code: { title, destination_url, qr_type, is_dynamic, content_data?, client?, style?, options? }'],
  ['GET', '/qr/:slug', 'One code'],
  ['PUT', '/qr/:slug', 'Update: { title?, destination_url?, is_active?, content_data?, client?, style?, options? } — live on the next scan'],
  ['DELETE', '/qr/:slug', 'Delete a code and its scan data'],
  ['GET', '/analytics/:slug/summary', '{ total_scans, unique_visitors, mobile_pct, first_scan, last_scan }'],
  ['GET', '/analytics/:slug/timeseries?days=30', '[{ date, total_scans, unique_scans }] (capped to your plan history)'],
  ['GET', '/analytics/:slug/countries', 'Top 10 countries'],
  ['GET', '/analytics/:slug/devices | os | browsers | hours', 'Breakdowns (all time)'],
  ['GET', '/analytics/:slug/recent', 'Last 20 scans'],
  ['GET', '/analytics/:slug/events.csv', 'Raw scans as CSV (newest 10,000)'],
  ['GET', '/analytics/account/:uid/summary', 'Account totals (also timeseries, countries, … with ?slugs=a,b)'],
];

const code: React.CSSProperties = { fontFamily: 'monospace', fontSize: '12px', background: 'var(--surface2)', padding: '12px', borderRadius: '8px', overflowX: 'auto', whiteSpace: 'pre' };

export default function ApiDocs() {
  const { planData } = useOutletContext<{ planData: any }>();
  const navigate = useNavigate();
  const base = `${window.location.origin}/api/v1`;
  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active" style={{ maxWidth: '860px', display: 'grid', gap: '16px' }}>
        <div className="card">
          <div className="card-title">REST API</div>
          <p style={{ fontSize: '13px', color: 'var(--text2)' }}>
            Manage codes and read statistics from your own systems. Available on the Team plan.
            {!planData?.limits?.api_access && <> <button className="btn btn-primary btn-sm" style={{ marginLeft: '8px' }} onClick={() => navigate('/billing')}>Upgrade</button></>}
          </p>
        </div>
        <div className="card">
          <div className="card-title">Authentication</div>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '10px' }}>Create a key in <b>Settings → API keys</b>. It is shown once. Send it as a Bearer token. Keys cannot change billing, team members or other keys.</p>
          <div style={code}>{`curl ${base}/qr \\\n  -H "Authorization: Bearer sk_live_…"`}</div>
        </div>
        <div className="card">
          <div className="card-title">Endpoints <span style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 400 }}>· base {base}</span></div>
          <table className="plan-compare" style={{ width: '100%' }}>
            <tbody>
              {ENDPOINTS.map(([m, p, d]) => (
                <tr key={m + p}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700, width: '70px' }}>{m}</td>
                  <td style={{ fontFamily: 'monospace', textAlign: 'left' }}>{p}</td>
                  <td style={{ textAlign: 'left', color: 'var(--text2)' }}>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-title">Errors and limits</div>
          <p style={{ fontSize: '13px', color: 'var(--text2)' }}>Errors are JSON: <code>{'{ "error": "…", "code"?: "LIMIT_QR_CODES" }'}</code>. 401 = bad or revoked key, 403 = plan limit or feature, 404 = not found, 429 = rate limit (300 requests and 60 writes per 15 minutes). Plan caps (600 codes on Team) apply to the API too. Webhooks are not available yet.</p>
        </div>
      </div>
    </div>
  );
}
