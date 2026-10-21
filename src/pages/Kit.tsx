import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useUI } from '../shared/UIContext';
import { SITE, waLink } from '../lib/site';

// Restaurant Kit: one guest page (menu, review, WhatsApp, Wi-Fi, today's offer) on ONE dynamic code,
// plus an optional static Wi-Fi code so phones can join without typing.

type L = 'en' | 'si' | 'ta';
const LABELS: Record<string, Record<L, string>> = {
  menu: { en: 'Menu', si: 'මෙනුව', ta: 'மெனு' },
  review: { en: 'Leave a Google review', si: 'Google සමාලෝචනයක් තබන්න', ta: 'Google மதிப்பாய்வு இடுங்கள்' },
  whatsapp: { en: 'WhatsApp us', si: 'WhatsApp කරන්න', ta: 'WhatsApp செய்யுங்கள்' },
  phone: { en: 'Call us', si: 'අමතන්න', ta: 'அழைக்கவும்' },
};

const empty = {
  name: '', subtitle: '', color: '#2B4A3A',
  menu: '', review: '', whatsapp: '', whatsappText: 'Hi! I would like to make a reservation.', phone: '',
  extraLabel: '', extraUrl: '',
  wifiSsid: '', wifiPassword: '',
  offerTitle: '', offerText: '',
  siName: '', siSubtitle: '', siOffer: '', taName: '', taSubtitle: '', taOffer: '',
};
type Form = typeof empty;

/** Form → guest-page content_data (the Worker renders it). */
export function toContent(f: Form) {
  const links: any[] = [];
  if (f.menu) links.push({ kind: 'menu', label: LABELS.menu.en, url: f.menu });
  if (f.review) links.push({ kind: 'review', label: LABELS.review.en, url: f.review });
  if (f.whatsapp) links.push({ kind: 'whatsapp', label: LABELS.whatsapp.en, url: waLink(f.whatsapp, f.whatsappText) });
  if (f.phone) links.push({ kind: 'phone', label: LABELS.phone.en, url: `tel:${f.phone.replace(/[^\d+]/g, '')}` });
  if (f.extraLabel && f.extraUrl) links.push({ kind: 'link', label: f.extraLabel, url: f.extraUrl });
  const tr = (l: L, name: string, subtitle: string, offer: string) => ({
    ...(name ? { name } : {}), ...(subtitle ? { subtitle } : {}),
    ...(offer ? { offer: { text: offer } } : {}),
    labels: links.map(x => LABELS[x.kind]?.[l] || x.label),
  });
  return {
    name: f.name, subtitle: f.subtitle, color: f.color,
    offer: f.offerText ? { title: f.offerTitle || undefined, text: f.offerText } : undefined,
    links,
    wifi: f.wifiSsid ? { ssid: f.wifiSsid, password: f.wifiPassword } : undefined,
    i18n: { si: tr('si', f.siName, f.siSubtitle, f.siOffer), ta: tr('ta', f.taName, f.taSubtitle, f.taOffer) },
    kit: { ...f }, // keeps the form so the kit can be edited later
  };
}

export default function Kit() {
  const [params] = useSearchParams();
  const editSlug = params.get('edit');
  const navigate = useNavigate();
  const { showToast } = useUI();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(empty);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false); // messages show only after a failed Continue
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    if (!editSlug) return;
    apiFetch(`/api/qr/${editSlug}`).then(qr => setF({ ...empty, ...(qr.content_data?.kit || {}), name: qr.content_data?.name || qr.title || '' }))
      .catch(() => showToast('error', 'Could not load this kit'));
  }, [editSlug]);

  // What blocks Continue on this step, recomputed on every keystroke so a message disappears once it is fixed.
  const problems: Record<string, string> = {};
  if (step === 0 && !f.name.trim()) problems.name = 'Enter your business name.';
  if (step === 1) {
    if (!(f.menu || f.review || f.whatsapp || f.phone || f.extraUrl || f.wifiSsid)) problems.links = 'Add at least one link, number or Wi-Fi so guests have something to tap.';
    for (const k of ['menu', 'review', 'extraUrl'] as const) if (f[k] && !/^https?:\/\//i.test(f[k])) problems[k] = 'Enter the full link, starting with https://';
    for (const k of ['whatsapp', 'phone'] as const) if (f[k] && f[k].replace(/\D/g, '').length < 7) problems[k] = 'Enter the full number with country code, e.g. +94 77 123 4567';
    if (f.extraLabel && !f.extraUrl) problems.extraUrl = 'Add the link for this button.';
  }
  const next = () => {
    const first = Object.keys(problems)[0];
    if (!first) { setTried(false); setStep(step + 1); return; }
    setTried(true);
    document.getElementById(first === 'links' ? 'kit-menu' : `kit-${first}`)?.focus();
  };

  const save = async () => {
    setSaving(true);
    try {
      const content_data = toContent(f);
      if (editSlug) {
        await apiFetch(`/api/qr/${editSlug}`, { method: 'PUT', body: JSON.stringify({ title: f.name, content_data }) });
        showToast('success', 'Kit updated. Live on the next scan, no reprint needed.');
        navigate('/');
        return;
      }
      const page = await apiFetch('/api/qr', { method: 'POST', body: JSON.stringify({
        title: f.name, qr_type: 'page', is_dynamic: true, content_data,
        style: { dot_color: '#1A1916', bg_color: '#FFFFFF', dot_style: 'rounded', corner_style: 'rounded', error_correction: 'M', output_size: 1200 },
      }) });
      let wifiSlug = '';
      if (f.wifiSsid) {
        const wifi = await apiFetch('/api/qr', { method: 'POST', body: JSON.stringify({
          title: `${f.name} Wi-Fi`, qr_type: 'wifi', is_dynamic: false,
          content_data: { ssid: f.wifiSsid, password: f.wifiPassword, encryption: f.wifiPassword ? 'WPA' : '' },
        }) }).catch(() => null); // plan may not allow a 2nd code; the guest page still shows the Wi-Fi details
        wifiSlug = wifi?.slug || '';
      }
      navigate(`/kit/print/${page.slug}${wifiSlug ? `?wifi=${wifiSlug}` : ''}`);
    } catch (err: any) {
      showToast('error', err?.message || 'Could not create the kit');
      if (err?.status === 403) navigate('/billing');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, k: keyof Form, ph = '', type = 'text') => (
    <div className="form-section">
      <label className="form-label" htmlFor={`kit-${k}`}>{label}</label>
      <input id={`kit-${k}`} type={type} className={`form-input${tried && problems[k] ? ' error' : ''}`} aria-invalid={tried && !!problems[k]} placeholder={ph} value={f[k]} onChange={set(k)} />
      {tried && problems[k] && <div className="error-msg" role="alert">{problems[k]}</div>}
    </div>
  );

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active" style={{ maxWidth: '720px' }}>
        <div className="card mb16">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
            {[0, 1, 2].map(i => <div key={i} style={{ flex: 1, height: '4px', borderRadius: '9px', background: i <= step ? 'var(--coral)' : 'var(--surface3)' }} />)}
          </div>

          {step === 0 && (<>
            <div className="card-title">{editSlug ? 'Edit your kit' : 'Restaurant Kit'} · your business</div>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '16px' }}>One QR on every table opens a guest page with your menu, reviews, WhatsApp, Wi-Fi and today's offer — in English, Sinhala and Tamil. Change any of it later without reprinting.</p>
            {field('Business name *', 'name', 'Café Lagoon')}
            {field('Short line under the name', 'subtitle', 'Galle Road · open until 11pm')}
            <div className="form-section">
              <label className="form-label" htmlFor="kit-color">Brand colour</label>
              <input id="kit-color" type="color" className="form-input" style={{ height: '40px', padding: '4px' }} value={f.color} onChange={set('color')} />
            </div>
          </>)}

          {step === 1 && (<>
            <div className="card-title">Links on the guest page</div>
            {tried && problems.links && <div className="error-msg" role="alert" style={{ marginBottom: '10px', fontSize: '13px' }}>{problems.links}</div>}
            {field('Menu (link to your menu or PDF)', 'menu', 'https://cafelagoon.lk/menu.pdf', 'url')}
            {field('Google review link', 'review', 'https://g.page/r/…/review', 'url')}
            <div className="grid-2">
              {field('WhatsApp number', 'whatsapp', '+94 77 123 4567', 'tel')}
              {field('Phone number', 'phone', '+94 11 234 5678', 'tel')}
            </div>
            {f.whatsapp && field('WhatsApp message guests start with', 'whatsappText')}
            <div className="grid-2">
              {field('Wi-Fi name', 'wifiSsid', 'Lagoon-Guest')}
              {field('Wi-Fi password', 'wifiPassword', 'kottu2026')}
            </div>
            <div className="grid-2">
              {field('Extra button label', 'extraLabel', 'Order online')}
              {field('Extra button link', 'extraUrl', 'https://…', 'url')}
            </div>
          </>)}

          {step === 2 && (<>
            <div className="card-title">Today's offer and languages</div>
            {field('Offer heading (optional)', 'offerTitle', "Today's offer")}
            {field('Offer', 'offerText', 'Kottu night: 20% off after 7pm')}
            <p style={{ fontSize: '13px', color: 'var(--text3)', margin: '8px 0 12px' }}>Button labels are translated for you. Add your own wording for the name and offer if you like (optional).</p>
            <div className="grid-2">
              {field('Name in Sinhala', 'siName')}
              {field('Name in Tamil', 'taName')}
              {field('Offer in Sinhala', 'siOffer')}
              {field('Offer in Tamil', 'taOffer')}
            </div>
          </>)}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '18px', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
            {SITE.whatsapp && step === 2 && (
              <a className="btn btn-ghost" href={waLink(SITE.whatsapp, `Hi, I'd like help setting up my Restaurant Kit (${f.name}).`)} target="_blank" rel="noreferrer">Book setup on WhatsApp</a>
            )}
            {step < 2
              ? <button className="btn btn-primary" onClick={next}>Continue →</button>
              : <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : editSlug ? 'Save changes' : 'Create kit and print →'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
