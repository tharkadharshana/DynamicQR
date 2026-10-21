import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useUI } from '../shared/UIContext';
import { renderGuestPage } from '../lib/guestPage';
import { FIELD_TYPES, formDefError } from '../lib/forms';

// Form builder: a list of fields (content_data.fields) previewed with the same renderGuestPage the Worker uses.

const TYPE_LABELS: Record<string, string> = { text: 'Short text', email: 'Email', phone: 'Phone', number: 'Number', textarea: 'Long text', select: 'Dropdown', checkbox: 'Checkbox', date: 'Date', rating: 'Rating (1 to 5)' };
// Stable field ids: submissions are keyed by them, so renaming or moving a field keeps its answers.
const fid = () => 'f' + Math.random().toString(36).slice(2, 7).padEnd(5, '0');

export default function FormEditor() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { showToast } = useUI();
  const [title, setTitle] = useState('Contact us');
  const [meta, setMeta] = useState<any>({ intro: '', submit_label: 'Send', thank_you: 'Thanks, we got your message.', notify_email: '' });
  const [fields, setFields] = useState<any[]>([{ id: fid(), type: 'text', label: 'Name', required: true }, { id: fid(), type: 'email', label: 'Email' }]);
  const [addType, setAddType] = useState('text');
  const [loading, setLoading] = useState(!!slug);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [limitError, setLimitError] = useState('');

  useEffect(() => {
    if (!slug) return;
    apiFetch(`/api/qr/${slug}`).then(qr => {
      if (qr.qr_type !== 'form') { navigate(`/edit/${slug}`, { replace: true }); return; }
      const { fields: fs, title: _t, ...rest } = qr.content_data || {};
      setTitle(qr.title || '');
      setMeta({ intro: '', submit_label: '', thank_you: '', notify_email: '', ...rest });
      setFields(Array.isArray(fs) ? fs : []);
    }).catch(() => showToast('error', 'Could not load this form')).finally(() => setLoading(false));
  }, [slug]);

  const content_data = {
    ...meta, title, notify_email: String(meta.notify_email || '').trim(),
    fields: fields.map(({ options, ...f }) => (f.type === 'select' ? { ...f, options: (options || []).map((o: string) => o.trim()).filter(Boolean) } : f)),
  };
  const upd = (i: number, patch: any) => setFields(fs => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: number) => setFields(fs => { const n = [...fs]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });

  const save = async () => {
    const err = formDefError(content_data);
    setError(err || '');
    setLimitError('');
    if (err) return;
    setSaving(true);
    try {
      if (slug) {
        await apiFetch(`/api/qr/${slug}`, { method: 'PUT', body: JSON.stringify({ title, content_data }) });
        showToast('success', 'Form saved. Live on the next scan, no reprint needed.');
      } else {
        await apiFetch('/api/qr', { method: 'POST', body: JSON.stringify({
          title, qr_type: 'form', is_dynamic: true, content_data,
          style: { dot_color: '#1A1916', bg_color: '#FFFFFF', dot_style: 'rounded', corner_style: 'rounded', error_correction: 'M', output_size: 1200 },
        }) });
        showToast('success', 'Form created.');
      }
      navigate('/forms');
    } catch (err: any) {
      if (err?.status === 403) setLimitError(err.message || 'Your plan does not allow another form.');
      else setError(err?.message || 'Could not save the form');
    } finally {
      setSaving(false);
    }
  };

  const input = (label: string, v: any, on: (v: string) => void, type = 'text', ph = '') => (
    <div className="form-section" style={{ marginBottom: '10px' }}>
      <label className="form-label">{label}</label>
      {type === 'textarea'
        ? <textarea aria-label={label} className="form-input" rows={3} value={v || ''} placeholder={ph} onChange={e => on(e.target.value)} />
        : <input aria-label={label} className="form-input" type={type} value={v || ''} placeholder={ph} onChange={e => on(e.target.value)} />}
    </div>
  );
  const m = (key: string, label: string, type = 'text', ph = '') => input(label, meta[key], v => setMeta({ ...meta, [key]: v }), type, ph);

  if (loading) return <div className="content" style={{ padding: '28px' }}>Loading…</div>;

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">
        <div className="grid-21" style={{ alignItems: 'start' }}>
          <div>
            <div className="card mb16">
              <div className="card-title">{slug ? 'Edit form' : 'New form'}</div>
              {input('Form title', title, setTitle)}
              {m('intro', 'Intro (optional)', 'textarea', 'Tell us what you need and we will reply within a day.')}
              <div className="grid-2">
                {m('submit_label', 'Submit button', 'text', 'Send')}
                {m('notify_email', 'Email me each response (optional)', 'email', 'you@business.lk')}
              </div>
              {m('thank_you', 'Thank-you message', 'textarea', 'Thanks, we got your message.')}
            </div>

            {fields.map((f, i) => (
              <div key={f.id} className="card mb16">
                <div className="section-row" style={{ marginBottom: '10px' }}>
                  <span className="card-title" style={{ margin: 0 }}>{TYPE_LABELS[f.type] || f.type}</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                    <button className="btn btn-ghost btn-sm" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--coral)' }} onClick={() => setFields(fs => fs.filter((_, j) => j !== i))}>Delete</button>
                  </div>
                </div>
                {input('Question', f.label, v => upd(i, { label: v }))}
                {f.type === 'select' && (
                  <div className="form-section" style={{ marginBottom: '10px' }}>
                    <label className="form-label" htmlFor="f-options-one-per-line">Options (one per line)</label>
                    <textarea id="f-options-one-per-line" className="form-input" rows={4} value={(f.options || []).join('\n')} onChange={e => upd(i, { options: e.target.value.split('\n') })} />
                  </div>
                )}
                <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px' }}>
                  <input type="checkbox" checked={!!f.required} onChange={e => upd(i, { required: e.target.checked })} /> Required
                </label>
              </div>
            ))}

            <div className="card mb16" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select className="form-input" value={addType} onChange={e => setAddType(e.target.value)} aria-label="Field type">
                {FIELD_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
              <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }} disabled={fields.length >= 30}
                onClick={() => setFields(fs => [...fs, { id: fid(), type: addType, label: TYPE_LABELS[addType], ...(addType === 'select' ? { options: ['Option 1', 'Option 2'] } : {}) }])}>+ Add field</button>
            </div>

            {error && <div className="card mb16" style={{ color: 'var(--coral)', fontSize: '13px' }}>{error}</div>}
            {limitError && (
              <div className="card mb16" style={{ color: 'var(--coral)', fontSize: '13px' }}>
                {limitError} <Link to="/billing" style={{ fontWeight: 700 }}>See plans →</Link>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <Link className="btn btn-ghost" to="/forms">Cancel</Link>
              <button className="btn btn-primary" disabled={saving || !title.trim()} onClick={save}>{saving ? 'Saving…' : slug ? 'Save changes' : 'Create form'}</button>
            </div>
          </div>

          <div className="card" style={{ position: 'sticky', top: 0 }}>
            <iframe title="Form preview" srcDoc={(renderGuestPage({ qr_type: 'form', title, content_data }, 'en', 'https://preview.local/f') as any)?.body || ''} sandbox=""
              style={{ width: '100%', height: '640px', border: '1px solid var(--border)', borderRadius: '12px', background: '#fff' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
