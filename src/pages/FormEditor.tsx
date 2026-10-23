import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useUI } from '../shared/UIContext';
import { renderGuestPage } from '../lib/guestPage';
import { FIELD_TYPES, formDefError } from '../lib/forms';

// Form builder: a list of fields (content_data.fields) previewed with the same renderGuestPage the Worker uses.

const TYPE_LABELS: Record<string, string> = { text: 'Short text', email: 'Email', phone: 'Phone', number: 'Number', textarea: 'Long text', select: 'Dropdown', checkbox: 'Checkbox', date: 'Date', rating: 'Rating (1 to 5)' };
// Tile glyph and colour per field type.
const TYPE_TILE: Record<string, [string, string, string]> = {
  text: ['T', '#E6EEFD', '#3B6FE0'], email: ['✉', '#EEE8FD', '#7C5CE0'], phone: ['☎', '#E0F5F3', '#169C8E'], number: ['#', '#FFF1DC', '#D98A12'],
  textarea: ['💬', '#E1F6EA', '#1F9D55'], select: ['☰', '#FFEFD9', '#E8872A'], checkbox: ['☑', '#FDE7F0', '#D6427F'], date: ['▦', '#E8F1FB', '#3B82C4'], rating: ['★', '#FFF4D6', '#E0A410'],
};
// Stable field ids: submissions are keyed by them, so renaming or moving a field keeps its answers.
const fid = () => 'f' + Math.random().toString(36).slice(2, 7).padEnd(5, '0');
const newField = (type: string) => ({ id: fid(), type, label: TYPE_LABELS[type], ...(type === 'select' ? { options: ['Option 1', 'Option 2'] } : {}) });

export default function FormEditor() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { showToast } = useUI();
  const [title, setTitle] = useState('Contact Us');
  const [meta, setMeta] = useState<any>({ intro: slug ? '' : 'A simple contact form to get in touch with your team.', submit_label: 'Send message', thank_you: 'Thanks, we got your message.', notify_email: '', redirect_url: '' });
  const [fields, setFields] = useState<any[]>([{ id: fid(), type: 'text', label: 'Name', required: true }, { id: fid(), type: 'email', label: 'Email', required: true }, { id: fid(), type: 'textarea', label: 'Message', required: true }, { id: fid(), type: 'select', label: 'Subject', required: true, options: ['General Inquiry', 'Support', 'Sales'] }]);
  const [loading, setLoading] = useState(!!slug);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [limitError, setLimitError] = useState('');
  const [tab, setTab] = useState<'build' | 'settings'>('build');
  const [sel, setSel] = useState<number | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const drag = useRef<number | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!slug) return;
    apiFetch(`/api/qr/${slug}`).then(qr => {
      if (qr.qr_type !== 'form') { navigate(`/edit/${slug}`, { replace: true }); return; }
      const { fields: fs, title: _t, ...rest } = qr.content_data || {};
      setTitle(qr.title || '');
      setMeta({ intro: '', submit_label: '', thank_you: '', notify_email: '', redirect_url: '', ...rest });
      setFields(Array.isArray(fs) ? fs : []);
    }).catch(() => showToast('error', 'Could not load this form')).finally(() => setLoading(false));
  }, [slug]);

  const content_data = {
    ...meta, title, notify_email: String(meta.notify_email || '').trim(), redirect_url: String(meta.redirect_url || '').trim(),
    fields: fields.map(({ options, ...f }) => (f.type === 'select' ? { ...f, options: (options || []).map((o: string) => o.trim()).filter(Boolean) } : f)),
  };
  const upd = (i: number, patch: any) => setFields(fs => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: number) => setFields(fs => { const n = [...fs]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const remove = (i: number) => { setFields(fs => fs.filter((_, j) => j !== i)); setSel(null); setMenu(null); };
  const add = (type: string) => { setFields(fs => [...fs, newField(type)]); setSel(fields.length); setPicker(false); };
  const dropOn = (to: number) => {
    const from = drag.current;
    drag.current = null;
    if (from === null || from === to) return;
    setFields(fs => { const n = [...fs]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; });
    setSel(to);
  };

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

  if (loading) return <div className="content" style={{ padding: '28px' }}>Loading…</div>;

  const m = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setMeta({ ...meta, [key]: e.target.value });
  const typePicker = (
    <div className="fb-picker" role="menu">
      {FIELD_TYPES.map(t => (
        <button key={t} role="menuitem" disabled={fields.length >= 30} onClick={() => add(t)}>
          <i style={{ background: TYPE_TILE[t][1], color: TYPE_TILE[t][2] }}>{TYPE_TILE[t][0]}</i>{TYPE_LABELS[t]}
        </button>
      ))}
    </div>
  );
  const selField = sel !== null ? fields[sel] : null;

  return (
    <div className="fb">
      <header className="fb-head">
        <button className="fb-back" onClick={() => navigate('/forms')} aria-label="Back to forms">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <div className="fb-head-text">
          <h1>{slug ? title || 'Edit form' : 'New Form'} <span className="fb-pill">{slug ? 'Live' : 'Draft'}</span></h1>
          <p>Create and customise your form. Add fields, set up responses and publish when you are ready.</p>
        </div>
        <div className="fb-head-actions">
          <button className="fb-btn" onClick={() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>Preview
          </button>
          <button className="fb-btn primary" disabled={saving || !title.trim()} onClick={save}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h11l4 4v14H5zM8 3v6h8V3M8 21v-7h8v7" /></svg>{saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      <div className="fb-grid">
        <div className="fb-main">
          <section className="fb-title-card">
            <span className="fb-title-ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8M8 12h8M8 16h4" /></svg></span>
            <div className="fb-title-fields">
              <input aria-label="Form title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Form title" />
              <input aria-label="Intro" value={meta.intro || ''} onChange={m('intro')} placeholder="A short line that tells people what this form is for" />
            </div>
            <div className="fb-tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'build'} className={tab === 'build' ? 'on' : ''} onClick={() => setTab('build')}>✎ Build</button>
              <button role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>⚙ Settings</button>
              {slug ? <Link role="tab" aria-selected={false} to={`/forms/${slug}/responses`}>▥ Responses</Link> : <span role="tab" aria-disabled="true" title="Save the form first">▥ Responses</span>}
            </div>
          </section>

          {tab === 'build' ? (<>
            <section className="fb-card">
              <div className="fb-card-head">
                <div><h2>Form Fields</h2><p>Drag to reorder • Click to edit • Add new fields</p></div>
                <div className="fb-rel">
                  <button className="fb-btn" disabled={fields.length >= 30} onClick={() => setPicker(p => !p)} aria-expanded={picker}>+ Add field</button>
                  {picker && typePicker}
                </div>
              </div>
              <div className="fb-list">
                {fields.map((f, i) => {
                  const [glyph, bg, fg] = TYPE_TILE[f.type] || TYPE_TILE.text;
                  return (
                    <div key={f.id} className={`fb-row${sel === i ? ' sel' : ''}`} draggable onDragStart={() => { drag.current = i; }} onDragOver={e => e.preventDefault()} onDrop={() => dropOn(i)} onClick={() => setSel(i)}>
                      <span className="fb-tile" style={{ background: bg, color: fg }}>{glyph}</span>
                      <div className="fb-row-text"><b>{f.label || 'Untitled'}{f.required && <em> *</em>}</b><small>{TYPE_LABELS[f.type] || f.type}</small></div>
                      <span className="fb-grip" aria-hidden="true">⠿</span>
                      <div className="fb-rel" onClick={e => e.stopPropagation()}>
                        <button className="fb-dots" aria-label="Field actions" onClick={() => setMenu(menu === i ? null : i)}>⋮</button>
                        {menu === i && (
                          <div className="fb-menu" role="menu">
                            <button role="menuitem" disabled={i === 0} onClick={() => { move(i, -1); setMenu(null); }}>Move up</button>
                            <button role="menuitem" disabled={i === fields.length - 1} onClick={() => { move(i, 1); setMenu(null); }}>Move down</button>
                            <button role="menuitem" disabled={fields.length >= 30} onClick={() => { setFields(fs => [...fs.slice(0, i + 1), { ...f, id: fid(), label: `${f.label} copy` }, ...fs.slice(i + 1)]); setMenu(null); }}>Duplicate</button>
                            <button role="menuitem" className="danger" onClick={() => remove(i)}>Delete</button>
                          </div>
                        )}
                      </div>
                      <button className="fb-chev" aria-label="Edit field" onClick={e => { e.stopPropagation(); setSel(sel === i ? null : i); }}>⌄</button>
                    </div>
                  );
                })}
                <button className="fb-addbar" disabled={fields.length >= 30} onClick={() => setPicker(true)}><span>+</span>Add field</button>
              </div>
            </section>

            <section className="fb-card">
              <h2>Form Actions</h2>
              <div className="fb-actions">
                <div className="fb-act">
                  <span className="fb-act-ic">💬</span>
                  <div>
                    <label htmlFor="fb-thanks">Thank you message</label>
                    <textarea id="fb-thanks" rows={3} maxLength={200} value={meta.thank_you || ''} onChange={m('thank_you')} placeholder="Thanks, we got your message." />
                    <small>{(meta.thank_you || '').length}/200</small>
                  </div>
                </div>
                <div className="fb-act">
                  <span className="fb-act-ic">🔗</span>
                  <div>
                    <label htmlFor="fb-redirect">Redirect after submit <em>(optional)</em></label>
                    <input id="fb-redirect" type="url" value={meta.redirect_url || ''} onChange={m('redirect_url')} placeholder="https://yourwebsite.com/thank-you" />
                  </div>
                </div>
              </div>
            </section>
          </>) : (
            <section className="fb-card">
              <h2>Settings</h2>
              <div className="fb-settings">
                <div><label htmlFor="fb-submit">Submit button</label><input id="fb-submit" value={meta.submit_label || ''} onChange={m('submit_label')} placeholder="Send" /></div>
                <div><label htmlFor="fb-notify">Email me each response <em>(optional)</em></label><input id="fb-notify" type="email" value={meta.notify_email || ''} onChange={m('notify_email')} placeholder="you@business.lk" /></div>
              </div>
            </section>
          )}

          {error && <div className="fb-error" role="alert">{error}</div>}
          {limitError && <div className="fb-error" role="alert">{limitError} <Link to="/billing" style={{ fontWeight: 700 }}>See plans →</Link></div>}
          <div className="fb-bar">
            <Link className="fb-btn" to="/forms">✕ Cancel</Link>
            <button className="fb-btn primary big" disabled={saving || !title.trim()} onClick={save}>{saving ? 'Saving…' : slug ? 'Save changes' : 'Save form'} ›</button>
          </div>
        </div>

        <aside className="fb-side">
          <section className="fb-card" ref={previewRef}>
            <div className="fb-card-head">
              <h2>Live Preview</h2>
              <div className="fb-device">
                <button aria-label="Desktop preview" className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}>🖥</button>
                <button aria-label="Mobile preview" className={device === 'mobile' ? 'on' : ''} onClick={() => setDevice('mobile')}>📱</button>
              </div>
            </div>
            <div className={`fb-frame ${device}`}>
              <iframe title="Form preview" srcDoc={(renderGuestPage({ qr_type: 'form', title, content_data }, 'en', 'https://preview.local/f') as any)?.body || ''} sandbox="" />
            </div>
          </section>

          <section className="fb-card">
            <h2>Field Settings</h2>
            {selField && sel !== null ? (
              <div className="fb-fs">
                <label htmlFor="fb-q">Question</label>
                <input id="fb-q" value={selField.label} onChange={e => upd(sel, { label: e.target.value })} />
                <small>Type: {TYPE_LABELS[selField.type] || selField.type}</small>
                {selField.type === 'select' && (<>
                  <label htmlFor="fb-opts">Options (one per line)</label>
                  <textarea id="fb-opts" rows={4} value={(selField.options || []).join('\n')} onChange={e => upd(sel, { options: e.target.value.split('\n') })} />
                </>)}
                <label className="fb-switch"><input type="checkbox" checked={!!selField.required} onChange={e => upd(sel, { required: e.target.checked })} /><span />Required</label>
              </div>
            ) : (
              <div className="fb-hint"><span>💡</span><p>The fields are fully customisable. Click on any field in the form to edit its label, type, validation and more.</p></div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
