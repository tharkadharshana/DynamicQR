import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { supabase } from '../supabase';
import { useUI } from '../shared/UIContext';
import { renderGuestPage, BLOCK_KINDS, type Lang } from '../lib/guestPage';
import { PAGE_TEMPLATES } from '../lib/pageTemplates';
import { SOCIALS } from '../lib/qrContent';

// Pages builder: a list of blocks (content_data.blocks) rendered by the same renderGuestPage the Worker uses.

const PREVIEW_URL = 'https://preview.local/p';
const DEFAULT_THEME = { accent: '#2B4A3A', bg: '#FFF8F2', text: '#24180F', button: 'rounded', font: 'system' };
const BLANK = { theme: DEFAULT_THEME, blocks: [{ kind: 'header', name: 'Your name', tagline: '' }] };
// The main text fields of each block that get a Sinhala and Tamil version (content_data.i18n[lang].blocks[i]).
const TR_FIELDS: Record<string, string[]> = { header: ['name', 'tagline'], button: ['label'], text: ['text'], offer: ['title', 'text'] };
const KIND_LABELS: Record<string, string> = { header: 'Header', socials: 'Social links', button: 'Button', text: 'Text', image: 'Image', video: 'Video', products: 'Products', contact: 'Contact', offer: 'Offer', wifi: 'Wi-Fi', divider: 'Divider' };
const LANG_LABELS: Record<string, string> = { si: 'Sinhala', ta: 'Tamil' };
const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

const previewHtml = (title: string, content_data: any, lang: Lang = 'en') =>
  (renderGuestPage({ qr_type: 'page', title, content_data }, lang, PREVIEW_URL) as any)?.body || '';

// Stable block ids: click counts are keyed by them, so moving a block keeps its Engagements history.
const bid = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0');
const withIds = (bs: any[]) => bs.map(b => (b.id ? b : { ...b, id: bid() }));

/** Editor state keeps each block's translations on the block (`_tr`), so moving or deleting a block moves them too. */
function fromContent(cd: any) {
  return withIds(cd.blocks || []).map((b: any, i: number) => ({ ...b, _tr: { si: cd.i18n?.si?.blocks?.[i] || {}, ta: cd.i18n?.ta?.blocks?.[i] || {} } }));
}
function toContent(blocks: any[], theme: any) {
  const i18n: any = {};
  for (const l of ['si', 'ta']) {
    const tr = blocks.map(b => Object.fromEntries(Object.entries(b._tr?.[l] || {}).filter(([, v]) => v)));
    if (tr.some(o => Object.keys(o).length)) i18n[l] = { blocks: tr };
  }
  return { theme, blocks: blocks.map(({ _tr, ...b }) => b), i18n };
}
/** An older Restaurant Kit page (name, subtitle, offer, links, wifi) as blocks. */
function kitToBlocks(d: any) {
  const blocks: any[] = [{ kind: 'header', name: d.name || '', tagline: d.subtitle || '', _tr: { si: { name: d.i18n?.si?.name, tagline: d.i18n?.si?.subtitle }, ta: { name: d.i18n?.ta?.name, tagline: d.i18n?.ta?.subtitle } } }];
  if (d.offer?.text) blocks.push({ kind: 'offer', title: d.offer.title || '', text: d.offer.text, _tr: { si: { text: d.i18n?.si?.offer?.text }, ta: { text: d.i18n?.ta?.offer?.text } } });
  (d.links || []).forEach((l: any, i: number) => blocks.push({ kind: 'button', label: l.label, url: l.url, _tr: { si: { label: d.i18n?.si?.labels?.[i] }, ta: { label: d.i18n?.ta?.labels?.[i] } } }));
  if (d.wifi?.ssid) blocks.push({ kind: 'wifi', ssid: d.wifi.ssid, password: d.wifi.password || '' });
  return withIds(blocks);
}

/** The gallery lives at /pages; this loads the chosen template (admin-managed rows, built-ins as the fallback) and opens the editor. */
function TemplateLoader({ template }: { template: string }) {
  const [tpl, setTpl] = useState<{ name: string; content: any } | null | undefined>(undefined);
  useEffect(() => {
    apiFetch('/api/page-templates').then((l: any[]) => setTpl(l.find(t => t.id === template) || PAGE_TEMPLATES.find(t => t.id === template) || null))
      .catch(() => setTpl(PAGE_TEMPLATES.find(t => t.id === template) || null));
  }, [template]);
  if (tpl === undefined) return <div className="content" style={{ padding: '28px' }}>Loading…</div>;
  return <Editor key={template} template={template} tpl={tpl} />;
}

export default function PageEditor() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const template = params.get('template');
  if (!slug && !template) return <Navigate to="/pages" replace />;
  if (!slug && template !== 'blank') return <TemplateLoader template={template!} />;
  return <Editor key={slug || template!} slug={slug} template={template} tpl={null} />;
}

function Editor({ slug, template, tpl }: { slug?: string; template: string | null; tpl: { name: string; content: any } | null }) {
  const navigate = useNavigate();
  const { showToast } = useUI();
  const [start] = useState(() => (!slug ? structuredClone(tpl?.content || BLANK) : null));
  const [title, setTitle] = useState(start ? tpl?.name || 'My page' : '');
  const [theme, setTheme] = useState<any>(start ? { ...DEFAULT_THEME, ...start.theme } : DEFAULT_THEME);
  const [blocks, setBlocks] = useState<any[]>(start ? fromContent(start) : []);
  const [legacy, setLegacy] = useState<any>(null); // a Kit page with no blocks yet
  const [loading, setLoading] = useState(!!slug);
  const [lang, setLang] = useState<Lang>('en');
  const [addKind, setAddKind] = useState('button');
  const [saving, setSaving] = useState(false);
  const [limitError, setLimitError] = useState('');
  const [uploading, setUploading] = useState('');

  useEffect(() => {
    if (!slug) return;
    apiFetch(`/api/qr/${slug}`).then(qr => {
      if (qr.qr_type !== 'page') { navigate(`/edit/${slug}`, { replace: true }); return; } // not a page: the code editor
      const cd = qr.content_data || {};
      setTitle(qr.title || '');
      if (Array.isArray(cd.blocks)) { setBlocks(fromContent(cd)); setTheme({ ...DEFAULT_THEME, ...(cd.theme || {}) }); }
      else { setLegacy(qr); if (cd.color) setTheme({ ...DEFAULT_THEME, accent: cd.color }); }
    }).catch(() => showToast('error', 'Could not load this page')).finally(() => setLoading(false));
  }, [slug]);

  const content_data = toContent(blocks, theme);
  const upd = (i: number, patch: any) => setBlocks(bs => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const updItem = (i: number, j: number, patch: any) => setBlocks(bs => bs.map((b, k) => (k === i ? { ...b, items: b.items.map((it: any, m: number) => (m === j ? { ...it, ...patch } : it)) } : b)));
  const move = (i: number, d: number) => setBlocks(bs => { const n = [...bs]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const add = () => setBlocks(bs => [...bs, { id: bid(), kind: addKind, ...(addKind === 'socials' || addKind === 'products' ? { items: [] } : {}), _tr: { si: {}, ta: {} } }]);

  // Image goes straight to Storage through a signed upload URL, like the PDF code type.
  const upload = async (id: string, file: File | undefined, done: (url: string) => void) => {
    if (!file) return;
    const type = IMAGE_TYPES[file.type];
    if (!type) return showToast('error', 'Use a PNG, JPG or WebP image.');
    setUploading(id);
    try {
      const { path, token, publicUrl } = await apiFetch('/api/files', { method: 'POST', body: JSON.stringify({ type, size: file.size, name: file.name }) });
      const { error } = await supabase.storage.from('files').uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (error) throw error;
      done(publicUrl);
    } catch (err: any) {
      showToast('error', err.status === 403 ? err.message || 'That image is over your plan limit.' : 'Upload failed. Try again.');
    } finally {
      setUploading('');
    }
  };

  const save = async () => {
    setSaving(true);
    setLimitError('');
    try {
      if (slug) {
        await apiFetch(`/api/qr/${slug}`, { method: 'PUT', body: JSON.stringify({ title, content_data }) });
        showToast('success', 'Page saved. Live on the next scan, no reprint needed.');
      } else {
        await apiFetch('/api/qr', { method: 'POST', body: JSON.stringify({
          title, qr_type: 'page', is_dynamic: true, content_data,
          style: { dot_color: '#1A1916', bg_color: '#FFFFFF', dot_style: 'rounded', corner_style: 'rounded', error_correction: 'M', output_size: 1200 },
        }) });
        showToast('success', 'Page created.');
      }
      navigate('/pages');
    } catch (err: any) {
      if (err?.status === 403) setLimitError(err.message || 'Your plan does not allow another page.');
      else showToast('error', err?.message || 'Could not save the page');
    } finally {
      setSaving(false);
    }
  };

  // Small controlled inputs. `v` is the current value, `on` takes the new one.
  const input = (label: string, v: any, on: (v: string) => void, type = 'text', ph = '') => (
    <div className="form-section" style={{ marginBottom: '10px' }}>
      <label className="form-label">{label}</label>
      {type === 'textarea'
        ? <textarea className="form-input" rows={3} value={v || ''} placeholder={ph} onChange={e => on(e.target.value)} />
        : <input className="form-input" type={type} value={v || ''} placeholder={ph} onChange={e => on(e.target.value)} />}
    </div>
  );
  const f = (i: number, key: string, label: string, type = 'text', ph = '') => input(label, blocks[i][key], v => upd(i, { [key]: v }), type, ph);
  const image = (id: string, label: string, v: any, on: (v: string) => void) => (
    <div className="form-section" style={{ marginBottom: '10px' }}>
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input className="form-input" type="url" value={v || ''} placeholder="https://…" onChange={e => on(e.target.value)} />
        <label className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap', cursor: 'pointer' }}>
          {uploading === id ? 'Uploading…' : 'Upload'}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; upload(id, file, on); }} />
        </label>
      </div>
    </div>
  );

  const blockForm = (b: any, i: number) => {
    switch (b.kind) {
      case 'header': return <>{f(i, 'name', 'Name')}{f(i, 'tagline', 'Line under the name')}{image(`${i}`, 'Photo or logo', b.avatar, v => upd(i, { avatar: v }))}</>;
      case 'button': return <div className="grid-2">{f(i, 'label', 'Label')}{f(i, 'url', 'Link', 'url', 'https://…')}</div>;
      case 'text': return f(i, 'text', 'Text', 'textarea');
      case 'image': return <>{image(`${i}`, 'Image', b.url, v => upd(i, { url: v }))}<div className="grid-2">{f(i, 'alt', 'Description (for screen readers)')}{f(i, 'link', 'Opens this link (optional)', 'url', 'https://…')}</div></>;
      case 'video': return f(i, 'url', 'YouTube or Vimeo link', 'url', 'https://youtu.be/…');
      case 'offer': return <div className="grid-2">{f(i, 'title', 'Heading', 'text', "Today's offer")}{f(i, 'text', 'Offer')}</div>;
      case 'wifi': return <div className="grid-2">{f(i, 'ssid', 'Network name')}{f(i, 'password', 'Password')}</div>;
      case 'contact': return <div className="grid-2">{f(i, 'name', 'Name (optional)')}{f(i, 'phone', 'Phone', 'tel')}{f(i, 'email', 'Email', 'email')}{f(i, 'website', 'Website', 'url', 'https://…')}{f(i, 'address', 'Address')}</div>;
      case 'socials': return <>
        {(b.items || []).map((it: any, j: number) => (
          <div key={j} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <select className="form-input" style={{ width: '140px' }} value={it.network} onChange={e => updItem(i, j, { network: e.target.value })}>
              {Object.keys(SOCIALS).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <input className="form-input" placeholder="@handle" value={it.handle || ''} onChange={e => updItem(i, j, { handle: e.target.value })} />
            <button className="btn btn-ghost btn-sm" onClick={() => upd(i, { items: b.items.filter((_: any, m: number) => m !== j) })}>Remove</button>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => upd(i, { items: [...(b.items || []), { network: 'instagram', handle: '' }] })}>+ Social link</button>
      </>;
      case 'products': return <>
        {f(i, 'title', 'Section heading')}
        {(b.items || []).map((it: any, j: number) => (
          <div key={j} style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', marginBottom: '8px' }}>
            <div className="grid-2">
              {input('Product', it.title, v => updItem(i, j, { title: v }))}
              {input('Price', it.price, v => updItem(i, j, { price: v }), 'text', 'LKR 2,500')}
            </div>
            {image(`${i}-${j}`, 'Photo', it.image, v => updItem(i, j, { image: v }))}
            {input('Link', it.url, v => updItem(i, j, { url: v }), 'url', 'https://…')}
            <button className="btn btn-ghost btn-sm" onClick={() => upd(i, { items: b.items.filter((_: any, m: number) => m !== j) })}>Remove product</button>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => upd(i, { items: [...(b.items || []), { title: '', price: '', url: '' }] })}>+ Product</button>
      </>;
      default: return null;
    }
  };

  const translations = (b: any, i: number) => TR_FIELDS[b.kind] && (
    <details style={{ marginTop: '6px' }}>
      <summary style={{ fontSize: '12px', color: 'var(--text3)', cursor: 'pointer' }}>Sinhala and Tamil (optional)</summary>
      <div className="grid-2" style={{ marginTop: '8px' }}>
        {['si', 'ta'].flatMap(l => TR_FIELDS[b.kind].map(k => (
          <React.Fragment key={l + k}>{input(`${KIND_LABELS[b.kind]} ${k} in ${LANG_LABELS[l]}`, b._tr?.[l]?.[k], v => upd(i, { _tr: { ...b._tr, [l]: { ...(b._tr?.[l] || {}), [k]: v } } }))}</React.Fragment>
        )))}
      </div>
    </details>
  );

  if (loading) return <div className="content" style={{ padding: '28px' }}>Loading…</div>;

  if (legacy) return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="card" style={{ maxWidth: '640px' }}>
        <div className="card-title">This page was made with the Restaurant Kit</div>
        <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '16px' }}>Keep editing it in the Kit, or convert it to blocks to add products, images, video, contact details and more. Converting keeps the same QR code.</p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => { setBlocks(kitToBlocks(legacy.content_data || {})); setLegacy(null); }}>Convert to blocks</button>
          <Link className="btn btn-ghost" to={`/kit?edit=${legacy.id}`}>Edit in the Restaurant Kit</Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">
        <div className="grid-21" style={{ alignItems: 'start' }}>
          <div>
            <div className="card mb16">
              <div className="card-title">{slug ? 'Edit page' : 'New page'}</div>
              {input('Page title (only you see this)', title, setTitle)}
              <div className="grid-2">
                {(['accent', 'bg', 'text'] as const).map(k => (
                  <div key={k} className="form-section" style={{ marginBottom: '10px' }}>
                    <label className="form-label" htmlFor="f-k">{{ accent: 'Accent colour', bg: 'Background', text: 'Text colour' }[k]}</label>
                    <input id="f-k" type="color" className="form-input" style={{ height: '40px', padding: '4px' }} value={theme[k]} onChange={e => setTheme({ ...theme, [k]: e.target.value })} />
                  </div>
                ))}
                <div className="form-section" style={{ marginBottom: '10px' }}>
                  <label className="form-label" htmlFor="f-button-style">Button style</label>
                  <select id="f-button-style" className="form-input" value={theme.button} onChange={e => setTheme({ ...theme, button: e.target.value })}>
                    <option value="rounded">Rounded</option><option value="pill">Pill</option><option value="square">Square</option>
                  </select>
                </div>
                <div className="form-section" style={{ marginBottom: '10px' }}>
                  <label className="form-label" htmlFor="f-font">Font</label>
                  <select id="f-font" className="form-input" value={theme.font} onChange={e => setTheme({ ...theme, font: e.target.value })}>
                    <option value="system">Clean</option><option value="serif">Serif</option><option value="mono">Monospace</option>
                  </select>
                </div>
              </div>
            </div>

            {blocks.map((b, i) => (
              <div key={b.id || i} className="card mb16">
                <div className="section-row" style={{ marginBottom: '10px' }}>
                  <span className="card-title" style={{ margin: 0 }}>{KIND_LABELS[b.kind] || b.kind}</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                    <button className="btn btn-ghost btn-sm" disabled={i === blocks.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--coral)' }} onClick={() => setBlocks(bs => bs.filter((_, j) => j !== i))}>Delete</button>
                  </div>
                </div>
                {blockForm(b, i)}
                {translations(b, i)}
              </div>
            ))}

            <div className="card mb16" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select className="form-input" value={addKind} onChange={e => setAddKind(e.target.value)} aria-label="Block type">
                {BLOCK_KINDS.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
              </select>
              <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }} onClick={add}>+ Add block</button>
            </div>

            {limitError && (
              <div className="card mb16" style={{ color: 'var(--coral)', fontSize: '13px' }}>
                {limitError} <Link to="/billing" style={{ fontWeight: 700 }}>See plans →</Link>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <Link className="btn btn-ghost" to="/pages">Cancel</Link>
              <button className="btn btn-primary" disabled={saving || !title.trim() || !blocks.length} onClick={save}>{saving ? 'Saving…' : slug ? 'Save changes' : 'Create page'}</button>
            </div>
          </div>

          <div className="card" style={{ position: 'sticky', top: 0 }}>
            <div className="qr-type-tabs" style={{ marginBottom: '12px' }}>
              {(['en', 'si', 'ta'] as Lang[]).map(l => (
                <button key={l} className={`qr-type-tab ${lang === l ? 'active' : ''}`} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
              ))}
            </div>
            <iframe title="Page preview" srcDoc={previewHtml(title, content_data, lang)} sandbox=""
              style={{ width: '100%', height: '640px', border: '1px solid var(--border)', borderRadius: '12px', background: '#fff' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
