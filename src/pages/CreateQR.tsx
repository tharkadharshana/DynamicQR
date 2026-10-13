import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabase';
import QRCodeStyling from 'qr-code-styling';
import { pageEditPath } from './Pages';
import { apiFetch } from '../lib/api';
import { useUI } from '../shared/UIContext';
import { getQRContent, stylingOptions, resizeLogo, SHORT_DOMAIN, shortHost, buildDestination, SOCIALS, gtinValid, FRAME_TEXTS, DOT_STYLES, normDotStyle } from '../lib/qrContent';
import { waLink } from '../lib/site';
import { downloadQR } from '../components/QRViewerModal';

const PREVIEW_SIZE = 180;
const DEFAULT_STYLE: any = { dot_color: '#1A1916', bg_color: '#FFFFFF', dot_style: 'square', corner_style: 'square', error_correction: 'M', output_size: 400, logo_url: '' };

// Tabs shown up front, then the "More" menu. Every URL kind is stored as qr_type 'url' with content_data.kind.
const MAIN_TYPES: [string, string][] = [['url', 'Link'], ['pdf', 'PDF'], ['whatsapp', 'WhatsApp'], ['google_review', 'Google review'], ['gs1', 'GS1'], ['vcard', 'vCard']];
const MORE_TYPES: [string, string][] = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn'], ['x', 'X'],
  ['phone', 'Phone'], ['sms', 'SMS'], ['location', 'Location'], ['event', 'Event'], ['app', 'App store'], ['wifi', 'Wi-Fi'], ['text', 'Text'], ['email', 'Email']];
const URL_KINDS = ['url', 'pdf', 'whatsapp', 'google_review', 'gs1', 'app', 'phone', 'sms', 'location', ...Object.keys(SOCIALS)];
// Kinds whose destination is built from their inputs (the rest take a typed URL).
const DERIVED_KINDS = ['pdf', 'google_review', 'phone', 'sms', 'location', ...Object.keys(SOCIALS)];
const DYNAMIC_ONLY = ['gs1', 'event', 'app'];

export default function CreateQR() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { showModal, showToast } = useUI();
  const [qrType, setQrType] = useState('url');
  const [isDynamic, setIsDynamic] = useState(true);
  const [urlError, setUrlError] = useState(false);
  const [planData, setPlanData] = useState<any>(null);
  const [gtin, setGtin] = useState('');
  const [uploading, setUploading] = useState(false);
  const brandApplied = useRef(false);
  
  const [formData, setFormData] = useState({
    title: '',
    client: '',
    destination_url: '',
    qr_type: 'url',
    content_data: {} as any,
    slug: '',
    is_active: true,
    style: { ...DEFAULT_STYLE },
    options: {
      password_protect: false,
      password: '',
      expiry_date_enabled: false,
      expiry_date: '',
      scan_limit_enabled: false,
      scan_limit: 100,
      visitor_rate_limit: 5,
      visitor_rate_period: 3600
    }
  });

  const canvasRef = useRef<HTMLDivElement>(null);
  const qrCodeRef = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    try {
      qrCodeRef.current = new QRCodeStyling({
        width: PREVIEW_SIZE,
        height: PREVIEW_SIZE,
        margin: 0,
        type: "canvas",
      });
      if (canvasRef.current && qrCodeRef.current) {
        qrCodeRef.current.append(canvasRef.current);
      }
    } catch (err) {
      console.error("Failed to initialize QR Code library:", err);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
    if (id) {
      const fetchQR = async () => {
        try {
          const data = await apiFetch(`/api/qr/${id}`);
          // Block pages are edited in the Pages builder, older Kit pages in the Restaurant Kit.
          if (data.qr_type === 'page') { navigate(pageEditPath(data), { replace: true }); return; }

          setQrType(data.content_data?.kind || (data.content_data?.wa_phone ? 'whatsapp' : data.qr_type || 'url'));
          setGtin(data.gtin || '');
          setIsDynamic(data.is_dynamic !== false);
          setFormData({
            title: data.title || '',
            client: data.client || '',
            destination_url: data.destination_url || '',
            qr_type: data.qr_type || 'url',
            content_data: data.content_data || {},
            slug: data.slug || '',
            is_active: data.is_active !== false,
            style: { ...DEFAULT_STYLE, ...data.style },
            options: {
              password_protect: !!data.has_password,
              password: '',
              expiry_date_enabled: !!data.expiry_date,
              expiry_date: data.expiry_date || '',
              scan_limit_enabled: data.rate_limit?.enabled || false,
              scan_limit: data.rate_limit?.max_scans || 100,
              visitor_rate_limit: data.visitor_rate_limit !== undefined ? data.visitor_rate_limit : 5,
              visitor_rate_period: data.visitor_rate_period !== undefined ? data.visitor_rate_period : 3600
            }
          });
        } catch (err: any) {
          console.error("Error fetching QR", err);
          if (err.status === 403 || err.status === 401) {
            showToast('error', "You don't have permission to edit this QR code.");
          }
          navigate('/');
        }
      };
      fetchQR();
    }
  }, [id, navigate]);

  // Gate on plan *limits*, not plan name: trial users are plan 'free' with Pro limits.
  const locked = (feature: string) => !!planData && !planData.limits?.[feature];

  const fetchPlan = async () => {
    try {
      const data = await apiFetch('/api/user/plan');
      setPlanData(data);
    } catch (err) {
      console.error('Plan fetch failed', err);
    }
  };

  // New codes start from the account's saved brand style, once.
  useEffect(() => {
    const brand = planData?.profile?.brand_style;
    if (id || !brand || brandApplied.current) return;
    brandApplied.current = true;
    setFormData(f => ({ ...f, style: { ...DEFAULT_STYLE, ...brand } }));
  }, [planData, id]);

  useEffect(() => {
    // Static Wi-Fi codes let phones join directly; dynamic ones show a page with the password.
    if (qrType === 'wifi') setIsDynamic(false);
    if (DYNAMIC_ONLY.includes(qrType)) setIsDynamic(true);
  }, [qrType]);

  const isUrlKind = URL_KINDS.includes(qrType);
  const dbType = isUrlKind ? 'url' : qrType;
  const dest = DERIVED_KINDS.includes(qrType) ? buildDestination(qrType, formData.content_data) : formData.destination_url;
  const cd = formData.content_data || {};
  const setCd = (patch: any) => setFormData(f => ({ ...f, content_data: { ...f.content_data, ...patch } }));
  const setStyle = (patch: any) => setFormData(f => ({ ...f, style: { ...f.style, ...patch } }));
  const pickType = (t: string) => { setQrType(t); setFormData(f => ({ ...f, qr_type: URL_KINDS.includes(t) ? 'url' : t })); };

  useEffect(() => {
    if (qrCodeRef.current) {
      const content = getQRContent({
        is_dynamic: isDynamic,
        slug: formData.slug || 'preview',
        qr_type: dbType,
        content_data: formData.content_data,
        destination_url: dest,
        gtin: qrType === 'gs1' && gtinValid(gtin) ? gtin : undefined,
      }) || SHORT_DOMAIN;

      qrCodeRef.current.update(stylingOptions(formData.style, content, PREVIEW_SIZE));
    }
  }, [dest, formData.style, qrType, dbType, formData.content_data, isDynamic, formData.slug, gtin]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('error', "Logo must be less than 5MB");
      return;
    }

    try {
      const logo_url = await resizeLogo(file); // <= 256 px PNG keeps the save request small
      setFormData(f => ({ ...f, style: { ...f.style, logo_url, error_correction: 'H' } }));
    } catch {
      showToast('error', 'Could not read that image. Try a PNG or JPG.');
    }
  };

  const handleSubmit = async () => {
    if (qrType === 'whatsapp' && !(formData.content_data?.wa_phone || '').replace(/\D/g, '')) {
      showToast('error', 'Enter a WhatsApp number with country code, e.g. +94 77 123 4567');
      return;
    }
    if (['url', 'app', 'gs1'].includes(qrType) && !/^https?:\/\//.test(formData.destination_url || '')) {
      setUrlError(true);
      return;
    }
    setUrlError(false);
    if (DERIVED_KINDS.includes(qrType) && !dest) {
      showToast('error', qrType === 'pdf' ? 'Upload a PDF first.' : 'Fill in the required fields for this code.');
      return;
    }
    if (qrType === 'gs1' && !gtinValid(gtin)) {
      showToast('error', 'Enter a valid GTIN (8, 12, 13 or 14 digits).');
      return;
    }
    if (qrType === 'event' && !(cd.title && cd.start)) {
      showToast('error', 'An event needs a title and a start time.');
      return;
    }

    if (!(await supabase.auth.getSession()).data.session) return;
    setLoading(true);

    // URL kinds carry their kind so the editor reopens on the right tab; Link and WhatsApp keep the old shape.
    const kind = isUrlKind && qrType !== 'url' && qrType !== 'whatsapp' ? qrType : undefined;
    const body = {
      ...formData,
      qr_type: dbType,
      destination_url: dest,
      content_data: { ...formData.content_data, kind },
      is_dynamic: isDynamic,
      // On edit, null clears a GTIN when the code stops being a GS1 code.
      ...(qrType === 'gs1' ? { gtin } : id ? { gtin: null } : {}),
    };
    try {
      await apiFetch(id ? `/api/qr/${id}` : '/api/qr', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      navigate('/');
    } catch (error: any) {
      console.error('Error saving QR code:', error);
      if (error.status === 409 || (error.status === 400 && qrType === 'gs1')) {
        showToast('error', error.message);
      } else if (error.status === 403) {
        showToast('error', error.message || 'Plan limit reached. Please upgrade.');
        navigate('/billing');
      } else {
        showToast('error', 'Failed to save QR code');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    showModal({
      type: 'confirm',
      title: 'Delete QR Code',
      message: 'Are you sure you want to delete this QR code? This action cannot be undone and all historical scan data, analytics, and stats related to this QR code will be permanently deleted.',
      confirmText: 'Delete Permanently',
      isDestructive: true,
      onConfirm: async () => {
        try {
          setLoading(true);
          await apiFetch(`/api/qr/${formData.slug}`, {
            method: 'DELETE'
          });
          showToast('success', 'QR code deleted successfully');
          navigate('/');
        } catch (err) {
          console.error(err);
          showToast('error', 'Error deleting QR code.');
          setLoading(false);
        }
      }
    });
  };

  // Render at the chosen output size for the file, then return the on-screen preview to its size.
  const downloadPreview = async (extension: 'png' | 'svg') => {
    const qr = qrCodeRef.current;
    if (!qr) return;
    const size = Number(formData.style.output_size) || 1200;
    qr.update({ width: size, height: size });
    try {
      await downloadQR(qr, formData.style, size, `scnr-qr-${size}px`, extension);
    } catch {
      showToast('error', 'Failed to generate download');
    } finally {
      qr.update({ width: PREVIEW_SIZE, height: PREVIEW_SIZE });
    }
  };

  // PDF goes straight to Storage through a signed upload URL; replacing it keeps the same code.
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { path, token, publicUrl } = await apiFetch('/api/files', { method: 'POST', body: JSON.stringify({ type: 'pdf', size: file.size, name: file.name }) });
      const { error } = await supabase.storage.from('files').uploadToSignedUrl(path, token, file, { contentType: 'application/pdf' });
      if (error) throw error;
      setCd({ file_url: publicUrl, file_name: file.name });
    } catch (err: any) {
      showToast('error', err.status === 403 ? err.message || 'That file is over your plan limit.' : 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const saveBrandStyle = async () => {
    try {
      await apiFetch('/api/user/profile', { method: 'PUT', body: JSON.stringify({ brand_style: formData.style }) });
      showToast('success', 'Saved. New codes will start with this design.');
    } catch {
      showToast('error', 'Could not save your default design.');
    }
  };

  const getShortUrl = () => {
    if (isUrlKind) {
      if (!dest) return 'Enter content to generate QR';
      return '→ ' + (dest.length > 55 ? dest.slice(0, 55) + '…' : dest);
    } else if (qrType === 'event') {
      return '→ Calendar event' + (cd.title ? `: ${cd.title}` : '');
    } else if (qrType === 'vcard') {
      return '→ vCard Contact';
    } else if (qrType === 'wifi') {
      return '→ WiFi Network';
    } else if (qrType === 'email') {
      return '→ Email to ' + (formData.content_data.email || '...');
    } else {
      return '→ Text Content';
    }
  };

  return (
    <div className="content">
      <div className="page active">
        <div className="create-layout">
          {/* Left: Form */}
          <div>
              {/* QR Name field */}
              <div className="form-section">
                <label className="form-label">QR Name *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Restaurant Menu QR" 
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  required
                />
              </div>
              {planData?.limits?.bulk_create && (
                <div className="form-section">
                  <label className="form-label" htmlFor="qr-client">Client / folder <span style={{ color: 'var(--text3)', fontWeight: 'normal' }}>(optional)</span></label>
                  <input id="qr-client" type="text" className="form-input" placeholder="e.g. Café Lagoon" value={formData.client}
                    onChange={(e) => setFormData({ ...formData, client: e.target.value })} />
                </div>
              )}

              {/* QR type selector */}
              <div className="card mb16">
                <div className="card-title">QR code type</div>
                <div className="qr-type-tabs">
                  {MAIN_TYPES.map(([t, label]) => (
                    <button key={t} className={`qr-type-tab ${qrType === t ? 'active' : ''}`} onClick={() => pickType(t)}>{label}</button>
                  ))}
                  <button className="qr-type-tab" onClick={() => navigate('/pages/new')}>Page →</button>
                  <select className={`qr-type-tab ${MORE_TYPES.some(([t]) => t === qrType) ? 'active' : ''}`} aria-label="More code types"
                    value={MORE_TYPES.some(([t]) => t === qrType) ? qrType : ''} onChange={(e) => e.target.value && pickType(e.target.value)}>
                    <option value="">More ▾</option>
                    {MORE_TYPES.map(([t, label]) => <option key={t} value={t}>{label}</option>)}
                  </select>
                </div>

                {/* Link, App store fallback and GS1 product page all take a typed URL */}
                {['url', 'app', 'gs1'].includes(qrType) && (
                  <div id="fields-url">
                    {qrType === 'gs1' && (
                      <div className="grid-2 mb16">
                        <div className="form-section" style={{ marginBottom: 0 }}>
                          <label className="form-label" htmlFor="gtin">GTIN (barcode number) *</label>
                          <input id="gtin" inputMode="numeric" className={`form-input ${gtin && !gtinValid(gtin) ? 'error' : ''}`} placeholder="4006381333931" value={gtin}
                            onChange={(e) => setGtin(e.target.value.replace(/\D/g, '').slice(0, 14))} />
                          {gtin && !gtinValid(gtin) && <div className="error-msg" style={{ display: 'block' }}>Check the number: a GTIN has 8, 12, 13 or 14 numbers and a valid check digit.</div>}
                        </div>
                        <div className="form-section" style={{ marginBottom: 0 }}>
                          <label className="form-label" htmlFor="gs1-batch">Batch or lot <span style={{ color: 'var(--text3)', fontWeight: 'normal' }}>(optional)</span></label>
                          <input id="gs1-batch" className="form-input" placeholder="L2026-01" value={cd.batch || ''} onChange={(e) => setCd({ batch: e.target.value })} />
                        </div>
                      </div>
                    )}
                    {qrType === 'app' && (
                      <>
                        <div className="form-section"><label className="form-label" htmlFor="app-ios">App Store link (iPhone)</label>
                          <input id="app-ios" type="url" className="form-input" placeholder="https://apps.apple.com/app/..." value={cd.app?.ios || ''} onChange={(e) => setCd({ app: { ...cd.app, ios: e.target.value } })} /></div>
                        <div className="form-section"><label className="form-label" htmlFor="app-android">Google Play link (Android)</label>
                          <input id="app-android" type="url" className="form-input" placeholder="https://play.google.com/store/apps/details?id=..." value={cd.app?.android || ''} onChange={(e) => setCd({ app: { ...cd.app, android: e.target.value } })} /></div>
                      </>
                    )}
                    <div className="form-section">
                      <label className="form-label">{qrType === 'app' ? 'Link for other devices *' : qrType === 'gs1' ? 'Product page URL *' : 'Destination URL *'}</label>
                      <input
                        type="url"
                        className={`form-input ${urlError ? 'error' : ''}`}
                        placeholder="https://yourwebsite.com"
                        value={formData.destination_url}
                        onChange={(e) => setFormData({...formData, destination_url: e.target.value})}
                      />
                      {urlError && <div className="error-msg" style={{ display: 'block' }}>Please enter a valid URL starting with https://</div>}
                    </div>
                  </div>
                )}

                {qrType === 'pdf' && (
                  <div className="form-section">
                    <label className="form-label" htmlFor="pdf-file">PDF file *</label>
                    {cd.file_url && <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '8px' }}>Current file: <a href={cd.file_url} target="_blank" rel="noreferrer">{cd.file_name || 'PDF'}</a> (uploading a new one keeps the same code)</div>}
                    <input id="pdf-file" type="file" accept="application/pdf" className="form-input" disabled={uploading} onChange={handlePdfUpload} />
                    {uploading && <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '6px' }}>Uploading…</div>}
                  </div>
                )}

                {qrType === 'google_review' && (
                  <div className="form-section">
                    <label className="form-label" htmlFor="place-id">Google Place ID *</label>
                    <input id="place-id" className="form-input" placeholder="ChIJ..." value={cd.place_id || ''} onChange={(e) => setCd({ place_id: e.target.value })} />
                    <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noreferrer" style={{ fontSize: '12px' }}>Find your Place ID</a>
                  </div>
                )}

                {SOCIALS[qrType] && (
                  <div className="form-section">
                    <label className="form-label" htmlFor="handle">Username or profile link *</label>
                    <input id="handle" className="form-input" placeholder="@yourbusiness" value={cd.handle || ''} onChange={(e) => setCd({ handle: e.target.value })} />
                  </div>
                )}

                {(qrType === 'phone' || qrType === 'sms') && (
                  <>
                    <div className="form-section">
                      <label className="form-label" htmlFor="tel">Phone number *</label>
                      <input id="tel" type="tel" className="form-input" placeholder="+94 77 123 4567" value={cd.phone || ''} onChange={(e) => setCd({ phone: e.target.value })} />
                    </div>
                    {qrType === 'sms' && (
                      <div className="form-section">
                        <label className="form-label" htmlFor="sms-body">Message</label>
                        <input id="sms-body" className="form-input" placeholder="Hi! I'd like to book a table" value={cd.body || ''} onChange={(e) => setCd({ body: e.target.value })} />
                      </div>
                    )}
                  </>
                )}

                {qrType === 'location' && (
                  <>
                    <div className="form-section">
                      <label className="form-label" htmlFor="loc-address">Address or place name</label>
                      <input id="loc-address" className="form-input" placeholder="Galle Face Green, Colombo" value={cd.address || ''} onChange={(e) => setCd({ address: e.target.value })} />
                    </div>
                    <div className="grid-2 mb16">
                      <div className="form-section" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor="loc-lat">Or latitude</label>
                        <input id="loc-lat" inputMode="decimal" className="form-input" placeholder="6.9271" value={cd.lat ?? ''} onChange={(e) => setCd({ lat: e.target.value })} />
                      </div>
                      <div className="form-section" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor="loc-lng">Longitude</label>
                        <input id="loc-lng" inputMode="decimal" className="form-input" placeholder="79.8612" value={cd.lng ?? ''} onChange={(e) => setCd({ lng: e.target.value })} />
                      </div>
                    </div>
                  </>
                )}

                {qrType === 'event' && (
                  <div id="fields-event">
                    <div className="form-section"><label className="form-label" htmlFor="ev-title">Event name *</label>
                      <input id="ev-title" className="form-input" placeholder="Launch night" value={cd.title || ''} onChange={(e) => setCd({ title: e.target.value })} /></div>
                    <div className="grid-2 mb16">
                      <div className="form-section" style={{ marginBottom: 0 }}><label className="form-label" htmlFor="ev-start">Starts *</label>
                        <input id="ev-start" type="datetime-local" className="form-input" value={cd.start || ''} onChange={(e) => setCd({ start: e.target.value })} /></div>
                      <div className="form-section" style={{ marginBottom: 0 }}><label className="form-label" htmlFor="ev-end">Ends</label>
                        <input id="ev-end" type="datetime-local" className="form-input" value={cd.end || ''} onChange={(e) => setCd({ end: e.target.value })} /></div>
                    </div>
                    <div className="form-section"><label className="form-label" htmlFor="ev-loc">Location</label>
                      <input id="ev-loc" className="form-input" placeholder="Hotel ballroom, Colombo 03" value={cd.location || ''} onChange={(e) => setCd({ location: e.target.value })} /></div>
                    <div className="form-section"><label className="form-label" htmlFor="ev-desc">Description</label>
                      <textarea id="ev-desc" className="form-input" rows={3} value={cd.description || ''} onChange={(e) => setCd({ description: e.target.value })} /></div>
                    <div className="form-section"><label className="form-label" htmlFor="ev-url">Event link</label>
                      <input id="ev-url" type="url" className="form-input" placeholder="https://..." value={cd.url || ''} onChange={(e) => setCd({ url: e.target.value })} /></div>
                  </div>
                )}

                {/* WhatsApp: a URL code pointing at wa.me with a ready message */}
                {qrType === 'whatsapp' && (
                  <div id="fields-whatsapp">
                    <div className="form-section">
                      <label className="form-label" htmlFor="wa-phone">WhatsApp number *</label>
                      <input id="wa-phone" type="tel" className="form-input" placeholder="+94 77 123 4567" value={formData.content_data?.wa_phone || ''}
                        onChange={(e) => { const cd = { ...formData.content_data, wa_phone: e.target.value }; setFormData({ ...formData, qr_type: 'url', content_data: cd, destination_url: waLink(cd.wa_phone, cd.wa_text || '') }); }} />
                    </div>
                    <div className="form-section">
                      <label className="form-label" htmlFor="wa-text">Message the customer starts with</label>
                      <input id="wa-text" type="text" className="form-input" placeholder="Hi! I'd like to order…" value={formData.content_data?.wa_text || ''}
                        onChange={(e) => { const cd = { ...formData.content_data, wa_text: e.target.value }; setFormData({ ...formData, qr_type: 'url', content_data: cd, destination_url: waLink(cd.wa_phone || '', cd.wa_text) }); }} />
                    </div>
                  </div>
                )}

                {/* vCard fields */}
                {qrType === 'vcard' && (
                  <div id="fields-vcard">
                    <div className="grid-2 mb16">
                      <div className="form-section" style={{ marginBottom: 0 }}>
                        <label className="form-label">First name</label>
                        <input type="text" className="form-input" placeholder="Ashan" value={formData.content_data?.first_name || ''} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, first_name: e.target.value}})} />
                      </div>
                      <div className="form-section" style={{ marginBottom: 0 }}>
                        <label className="form-label">Last name</label>
                        <input type="text" className="form-input" placeholder="Kumar" value={formData.content_data?.last_name || ''} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, last_name: e.target.value}})} />
                      </div>
                    </div>
                    <div className="form-section"><label className="form-label">Phone</label><input type="tel" className="form-input" placeholder="+94 77 123 4567" value={formData.content_data?.phone || ''} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, phone: e.target.value}})} /></div>
                    <div className="form-section"><label className="form-label">Email</label><input type="email" className="form-input" placeholder="ashan@email.com" value={formData.content_data?.email || ''} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, email: e.target.value}})} /></div>
                    <div className="form-section"><label className="form-label">Company</label><input type="text" className="form-input" placeholder="Company name" value={formData.content_data?.company || ''} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, company: e.target.value}})} /></div>
                    <div className="form-section"><label className="form-label">Website</label><input type="url" className="form-input" placeholder="https://yoursite.com" value={formData.content_data?.website || ''} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, website: e.target.value}})} /></div>
                  </div>
                )}

                {/* WiFi fields */}
                {qrType === 'wifi' && (
                  <div id="fields-wifi">
                    <div className="form-section"><label className="form-label">Network name (SSID)</label><input type="text" className="form-input" placeholder="MyHomeWiFi" value={formData.content_data?.ssid || ''} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, ssid: e.target.value}})} /></div>
                    <div className="form-section"><label className="form-label">Password</label><input type="text" className="form-input" placeholder="password123" value={formData.content_data?.password || ''} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, password: e.target.value}})} /></div>
                    <div className="form-section">
                      <label className="form-label">Security type</label>
                      <select className="form-input" value={formData.content_data?.encryption || 'WPA'} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, encryption: e.target.value}})}>
                        <option value="WPA">WPA/WPA2</option>
                        <option value="WEP">WEP</option>
                        <option value="">None (open)</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Text fields */}
                {qrType === 'text' && (
                  <div id="fields-text">
                    <div className="form-section">
                      <label className="form-label">Text content</label>
                      <textarea className="form-input" placeholder="Enter any text, message, or note..." rows={4} value={formData.content_data?.text || ''} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, text: e.target.value}})}></textarea>
                    </div>
                  </div>
                )}

                {/* Email fields */}
                {qrType === 'email' && (
                  <div id="fields-email">
                    <div className="form-section"><label className="form-label">Recipient email</label><input type="email" className="form-input" placeholder="hello@example.com" value={formData.content_data?.email || ''} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, email: e.target.value}})} /></div>
                    <div className="form-section"><label className="form-label">Subject</label><input type="text" className="form-input" placeholder="Subject line" value={formData.content_data?.subject || ''} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, subject: e.target.value}})} /></div>
                    <div className="form-section"><label className="form-label">Body (optional)</label><textarea className="form-input" placeholder="Message body..." rows={3} value={formData.content_data?.body || ''} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, body: e.target.value}})}></textarea></div>
                  </div>
                )}
              </div>

            {/* Style */}
            <div className="card mb16">
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#E85D3A', color: 'white', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>2</span>
                  <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text3)', fontSize: '13px' }}>STYLE</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px' }} onClick={saveBrandStyle}>
                    Save as my default
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '4px 12px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px' }}
                    onClick={() => setFormData({...formData, style: { ...DEFAULT_STYLE }})}
                  >
                    Reset style
                  </button>
                </div>
              </div>

              <div className="form-section">
                <label className="form-label">Foreground color</label>
                <div className="color-row">
                  {['#1A1916', '#E85D3A', '#4D9EFF', '#3DCC7E', '#9B7FFF'].map(color => (
                    <div 
                      key={color}
                      className={`color-swatch ${formData.style.dot_color === color ? 'selected' : ''}`} 
                      style={{ background: color }} 
                      onClick={() => setFormData({...formData, style: {...formData.style, dot_color: color}})}
                    ></div>
                  ))}
                  <div className="color-input-wrap">
                    <div className="color-preview" style={{ background: formData.style.dot_color }}></div>
                    <input 
                      type="color" 
                      className="form-input" 
                      value={formData.style.dot_color} 
                      style={{ height: '36px', padding: '4px', cursor: 'pointer' }} 
                      onChange={(e) => setFormData({...formData, style: {...formData.style, dot_color: e.target.value}})}
                    />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <label className="form-label">Background color</label>
                <div className="color-row">
                  {['#FFFFFF', '#F4F3EF', '#FBE9E4', '#E8F5EC', '#EEF0FF'].map(color => (
                    <div 
                      key={color}
                      className={`color-swatch ${formData.style.bg_color === color ? 'selected' : ''}`} 
                      style={{ background: color, border: color === '#FFFFFF' ? '1px solid var(--border)' : 'none' }} 
                      onClick={() => setFormData({...formData, style: {...formData.style, bg_color: color}})}
                    ></div>
                  ))}
                  <div className="color-input-wrap">
                    <div className="color-preview" style={{ background: formData.style.bg_color, border: '1px solid var(--border2)' }}></div>
                    <input 
                      type="color" 
                      className="form-input" 
                      value={formData.style.bg_color} 
                      style={{ height: '36px', padding: '4px', cursor: 'pointer' }} 
                      onChange={(e) => setFormData({...formData, style: {...formData.style, bg_color: e.target.value}})}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-section" style={{ flex: 1 }}>
                  <label className="form-label" htmlFor="dot-style">Dot style</label>
                  <select id="dot-style" className="form-input" value={normDotStyle(formData.style.dot_style)}
                    onChange={(e) => setStyle({ dot_style: e.target.value })}>
                    {DOT_STYLES.map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1).replace('-', ' ')}</option>)}
                  </select>
                </div>
                <div className="form-section" style={{ flex: 1 }}>
                  <label className="form-label" htmlFor="corner-dot">Corner dot</label>
                  <select id="corner-dot" className="form-input" value={formData.style.corner_dot_style || ''} onChange={(e) => setStyle({ corner_dot_style: e.target.value || undefined })}>
                    <option value="">Match corners</option>
                    <option value="square">Square</option>
                    <option value="dot">Dot</option>
                  </select>
                </div>
                <div className="form-section" style={{ flex: 1 }}>
                  <label className="form-label" htmlFor="qr-shape">Shape</label>
                  <select id="qr-shape" className="form-input" value={formData.style.shape || 'square'} onChange={(e) => setStyle({ shape: e.target.value })}>
                    <option value="square">Square</option>
                    <option value="circle">Circle</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-section" style={{ flex: 1 }}>
                  <label className="form-label">Corner style</label>
                  <div className="style-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <div className={`style-opt ${formData.style.corner_style === 'square' ? 'selected' : ''}`} onClick={() => setFormData({...formData, style: {...formData.style, corner_style: 'square'}})} title="Square">
                      <svg viewBox="0 0 28 28" fill="none" stroke="var(--text2)" strokeWidth="2"><rect x="4" y="4" width="20" height="20"/><rect x="8" y="8" width="12" height="12" fill="var(--text2)" stroke="none"/></svg>
                    </div>
                    <div className={`style-opt ${formData.style.corner_style === 'dot' ? 'selected' : ''}`} onClick={() => setFormData({...formData, style: {...formData.style, corner_style: 'dot'}})} title="Dot">
                      <svg viewBox="0 0 28 28" fill="none" stroke="var(--text2)" strokeWidth="2"><rect x="4" y="4" width="20" height="20" rx="10"/><circle cx="14" cy="14" r="6" fill="var(--text2)" stroke="none"/></svg>
                    </div>
                    <div className={`style-opt ${formData.style.corner_style === 'rounded' ? 'selected' : ''}`} onClick={() => setFormData({...formData, style: {...formData.style, corner_style: 'rounded'}})} title="Rounded">
                      <svg viewBox="0 0 28 28" fill="none" stroke="var(--text2)" strokeWidth="2"><rect x="4" y="4" width="20" height="20" rx="6"/><rect x="8" y="8" width="12" height="12" rx="3" fill="var(--text2)" stroke="none"/></svg>
                    </div>
                  </div>
                </div>
                <div className="form-section" style={{ flex: 1 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="checkbox" checked={!!formData.style.gradient_color}
                      onChange={(e) => setStyle({ gradient_color: e.target.checked ? '#E85D3A' : undefined })} />
                    Gradient
                  </label>
                  {formData.style.gradient_color && (
                    <input type="color" className="form-input" aria-label="Gradient end colour" value={formData.style.gradient_color}
                      style={{ height: '36px', padding: '4px', cursor: 'pointer' }} onChange={(e) => setStyle({ gradient_color: e.target.value })} />
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-section" style={{ flex: 2 }}>
                  <label className="form-label" htmlFor="qr-frame">Frame</label>
                  <select id="qr-frame" className="form-input"
                    value={!formData.style.frame ? '' : FRAME_TEXTS.includes(formData.style.frame.text) ? formData.style.frame.text : 'custom'}
                    onChange={(e) => setStyle({ frame: e.target.value ? { color: formData.style.frame?.color || '#1A1916', text: e.target.value === 'custom' ? '' : e.target.value } : undefined })}>
                    <option value="">No frame</option>
                    {FRAME_TEXTS.map(t => <option key={t} value={t}>{t}</option>)}
                    <option value="custom">Custom text…</option>
                  </select>
                  {formData.style.frame && !FRAME_TEXTS.includes(formData.style.frame.text) && (
                    <input className="form-input" style={{ marginTop: '8px' }} maxLength={24} placeholder="Your call to action" value={formData.style.frame.text}
                      onChange={(e) => setStyle({ frame: { ...formData.style.frame, text: e.target.value } })} />
                  )}
                </div>
                {formData.style.frame && (
                  <div className="form-section" style={{ flex: 1 }}>
                    <label className="form-label" htmlFor="frame-color">Frame colour</label>
                    <input id="frame-color" type="color" className="form-input" value={formData.style.frame.color || '#1A1916'}
                      style={{ height: '36px', padding: '4px', cursor: 'pointer' }} onChange={(e) => setStyle({ frame: { ...formData.style.frame, color: e.target.value } })} />
                  </div>
                )}
              </div>

              <div className="form-section">
                <label className="form-label">Center logo <span style={{ color: 'var(--text3)', fontWeight: 'normal' }}>(optional — auto-sets error correction to H)</span></label>
                <div 
                  style={{ border: '1px dashed var(--border2)', borderRadius: '8px', padding: '24px', textAlign: 'center', cursor: 'pointer', position: 'relative' }} 
                  onClick={() => document.getElementById('logo-upload')?.click()}
                >
                  {formData.style.logo_url ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <img src={formData.style.logo_url} alt="Logo" style={{ maxHeight: '60px', maxWidth: '100%', marginBottom: '12px' }} />
                      <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Click to replace logo</div>
                      <button 
                        className="btn btn-ghost" 
                        style={{ position: 'absolute', top: '8px', right: '8px', padding: '4px 8px', fontSize: '12px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormData({...formData, style: {...formData.style, logo_url: ''}});
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '24px', marginBottom: '8px' }}>🖼️</div>
                      <div style={{ fontWeight: 500, marginBottom: '4px' }}>Drop logo here or click to upload</div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)' }}>PNG, SVG, or JPG · resized to 256 px · centered</div>
                    </>
                  )}
                  <input type="file" id="logo-upload" style={{ display: 'none' }} accept="image/png, image/jpeg, image/svg+xml" onChange={handleLogoUpload} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-section" style={{ flex: 1 }}>
                  <label className="form-label">Error correction</label>
                  <select 
                    className="form-input" 
                    value={formData.style.error_correction}
                    onChange={(e) => setFormData({...formData, style: {...formData.style, error_correction: e.target.value}})}
                  >
                    <option value="M">M — Medium (15% recovery)</option>
                    <option value="H">H — High (30% recovery, required for logos)</option>
                    <option value="L">L — Low (7% recovery, smallest QR)</option>
                    <option value="Q">Q — Quartile (25% recovery)</option>
                  </select>
                </div>
                <div className="form-section" style={{ flex: 1 }}>
                  <label className="form-label">Output size</label>
                  <select 
                    className="form-input" 
                    value={formData.style.output_size}
                    onChange={(e) => setFormData({...formData, style: {...formData.style, output_size: parseInt(e.target.value)}})}
                  >
                    <option value={400}>Standard (400px)</option>
                    <option value={800}>High Res (800px)</option>
                    <option value={1200}>Ultra (1200px)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="card mb16">
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: '#E85D3A', color: 'white', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>3</span>
                <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text3)', fontSize: '13px' }}>OPTIONS</span>
              </div>

              <div className="toggle-wrap" style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, marginBottom: '4px' }}>Dynamic QR</div>
                  <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Editable destination + scan analytics</div>
                </div>
                <button 
                  className={`toggle ${isDynamic ? 'on' : ''}`} 
                  onClick={() => !DYNAMIC_ONLY.includes(qrType) && setIsDynamic(!isDynamic)}
                ></button>
              </div>

              <div className="toggle-wrap" style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontWeight: 500 }}>Password protect</div>
                    {locked('password_protect') && <span className="chip" style={{ background: 'var(--amber-ll)', color: 'var(--amber)', fontSize: '10px' }}>PRO</span>}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Require a PIN before redirecting</div>
                </div>
                <button 
                  className={`toggle ${formData.options.password_protect ? 'on' : ''}`} 
                  onClick={() => {
                    if (locked('password_protect')) return navigate('/billing');
                    setFormData({...formData, options: {...formData.options, password_protect: !formData.options.password_protect}});
                  }}
                ></button>
              </div>
              {formData.options.password_protect && (
                <div className="form-section" style={{ padding: '0 0 16px 0' }}>
                  <input type="text" className="form-input" placeholder="Enter PIN or password" value={formData.options.password} onChange={(e) => setFormData({...formData, options: {...formData.options, password: e.target.value}})} />
                </div>
              )}

              <div className="toggle-wrap" style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontWeight: 500 }}>Expiry date</div>
                    {locked('expiry_gate') && <span className="chip" style={{ background: 'var(--amber-ll)', color: 'var(--amber)', fontSize: '10px' }}>PRO</span>}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text3)' }}>QR deactivates automatically after this date</div>
                </div>
                <button 
                  className={`toggle ${formData.options.expiry_date_enabled ? 'on' : ''}`} 
                  onClick={() => {
                    if (locked('expiry_gate')) return navigate('/billing');
                    setFormData({...formData, options: {...formData.options, expiry_date_enabled: !formData.options.expiry_date_enabled}});
                  }}
                ></button>
              </div>
              {formData.options.expiry_date_enabled && (
                <div className="form-section" style={{ padding: '0 0 16px 0' }}>
                  <input type="datetime-local" className="form-input" value={formData.options.expiry_date} onChange={(e) => setFormData({...formData, options: {...formData.options, expiry_date: e.target.value}})} />
                </div>
              )}

              <div className="toggle-wrap" style={{ padding: '16px 0' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontWeight: 500 }}>Scan limit</div>
                    {locked('scan_limit_gate') && <span className="chip" style={{ background: 'var(--amber-ll)', color: 'var(--amber)', fontSize: '10px' }}>PRO</span>}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Deactivate after N total scans</div>
                </div>
                <button 
                  className={`toggle ${formData.options.scan_limit_enabled ? 'on' : ''}`} 
                  onClick={() => {
                    if (locked('scan_limit_gate')) return navigate('/billing');
                    setFormData({...formData, options: {...formData.options, scan_limit_enabled: !formData.options.scan_limit_enabled}});
                  }}
                ></button>
              </div>
              {formData.options.scan_limit_enabled && (
                <div className="form-section" style={{ padding: '0 0 16px 0' }}>
                  <input type="number" className="form-input" placeholder="e.g. 100" value={formData.options.scan_limit} onChange={(e) => setFormData({...formData, options: {...formData.options, scan_limit: parseInt(e.target.value) || 0}})} />
                </div>
              )}
            </div>

            {/* Visitor Guard */}
            <div className="card mb16">
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: '#E85D3A', color: 'white', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>4</span>
                <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text3)', fontSize: '13px' }}>VISITOR GUARD</span>
              </div>
              
              <div style={{ padding: '8px 0 16px 0' }}>
                <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '16px' }}>
                  Limit how many times each unique visitor can scan this QR code within a specific timeframe. 
                  This is highly effective against bot spam and automated crawlers.
                </div>
                
                <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', opacity: locked('visitor_guard_gate') ? 0.6 : 1 }}>
                  <div className="form-section">
                    <label className="form-label" style={{ fontSize: '11px', textTransform: 'uppercase' }}>Scans per visitor</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                       <input 
                         type="number" 
                         className="form-input" 
                         min="0"
                         style={{ flex: 1 }}
                         disabled={locked('visitor_guard_gate')}
                         value={locked('visitor_guard_gate') ? 5 : formData.options.visitor_rate_limit} 
                         onChange={(e) => setFormData({...formData, options: {...formData.options, visitor_rate_limit: parseInt(e.target.value) || 0}})} 
                       />
                       <span style={{ fontSize: '13px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                         {locked('visitor_guard_gate') ? 'scans' : (formData.options.visitor_rate_limit === 0 ? 'Unlimited' : 'scans')}
                       </span>
                    </div>
                  </div>
                  
                  <div className="form-section">
                    <label className="form-label" style={{ fontSize: '11px', textTransform: 'uppercase' }}>Time window</label>
                    <select 
                       className="form-input" 
                       disabled={locked('visitor_guard_gate')}
                       value={locked('visitor_guard_gate') ? 3600 : formData.options.visitor_rate_period}
                       onChange={(e) => setFormData({...formData, options: {...formData.options, visitor_rate_period: parseInt(e.target.value)}})}
                    >
                      <option value={60}>1 minute (Cooldown)</option>
                      <option value={3600}>1 hour</option>
                      <option value={86400}>24 hours</option>
                      <option value={604800}>7 days</option>
                    </select>
                  </div>
                </div>
                
                {locked('visitor_guard_gate') ? (
                  <div style={{ marginTop: '8px', padding: '10px', background: 'var(--surface2)', borderRadius: '6px', fontSize: '12px', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🛡️</span>
                    <span>Standard Protection: 5 scans / 1 hour active. (Upgrade for custom limits).</span>
                  </div>
                ) : (formData.options.visitor_rate_limit === 0 && (
                  <div style={{ marginTop: '8px', padding: '10px', background: 'var(--amber-ll)', borderRadius: '6px', fontSize: '12px', color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>⚠️</span>
                    <span>Unlimited scans per visitor is unlocked by your {planData?.is_trial ? 'trial' : planData?.plan} plan.</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1, padding: '12px', fontSize: '15px', justifyContent: 'center' }} 
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? 'Saving...' : (id ? 'Update QR Code →' : 'Create QR Code →')}
              </button>
              <button 
                className="btn btn-ghost" 
                onClick={() => {
                  setQrType('url');
                  setIsDynamic(true);
                  setGtin('');
                  setFormData({
                    title: '',
                    client: '',
                    destination_url: '',
                    slug: '',
                    qr_type: 'url',
                    is_active: true,
                    content_data: {},
                    style: { ...DEFAULT_STYLE, ...(planData?.profile?.brand_style || {}) },
                    options: {
                      password_protect: false,
                      password: '',
                      expiry_date_enabled: false,
                      expiry_date: '',
                      scan_limit_enabled: false,
                      scan_limit: 100,
                      visitor_rate_limit: 5,
                      visitor_rate_period: 3600
                    }
                  });
                }}
              >
                Reset
              </button>
              {id && (
                <button
                  className="btn btn-ghost"
                  style={{ color: 'var(--coral)', border: '1px solid var(--coral)' }}
                  onClick={handleDelete}
                  disabled={loading}
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* Right: Preview */}
          <div className="qr-preview-card">
            <div className="card-title">Live preview</div>
            <div className="qr-preview-frame">
              <div ref={canvasRef} id="preview-canvas"></div>
            </div>
            {/* The frame is added to downloads only; this band previews its text and colour. */}
            {formData.style.frame && (
              <div style={{ background: formData.style.frame.color || '#1A1916', color: '#fff', fontWeight: 700, textAlign: 'center', padding: '6px', borderRadius: '6px', margin: '-8px 0 12px' }}>
                {formData.style.frame.text || 'Scan me'}
              </div>
            )}
            <div className="qr-preview-slug" id="preview-slug">
              {isDynamic ? `${shortHost()}/${formData.slug || '———'}` : 'Static QR'}
            </div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px' }}>Destination</div>
              <div style={{ fontSize: '13px', color: 'var(--text2)', wordBreak: 'break-all', lineHeight: '1.5' }} id="preview-dest">
                {getShortUrl()}
              </div>
            </div>
            <div className="divider"></div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Download</div>
              <div className="dl-row">
                <button className="dl-btn" onClick={() => downloadPreview('png')}>PNG</button>
                <button className="dl-btn" onClick={() => downloadPreview('svg')}>SVG</button>
              </div>
            </div>
            <div className="divider"></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text3)' }}>Type</span>
                <span style={{ color: 'var(--text)', fontWeight: 500 }} id="preview-type">{qrType.toUpperCase()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text3)' }}>Mode</span>
                <span className="chip" style={{ background: isDynamic ? 'var(--coral-ll)' : 'var(--surface3)', color: isDynamic ? 'var(--coral)' : 'var(--text2)' }} id="preview-mode">
                  {isDynamic ? 'Dynamic' : 'Static'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text3)' }}>Error correction</span>
                <span style={{ color: 'var(--text)', fontWeight: 500 }} id="preview-ec">
                  {formData.style.error_correction} ({formData.style.error_correction === 'M' ? '15%' : formData.style.error_correction === 'H' ? '30%' : formData.style.error_correction === 'L' ? '7%' : '25%'})
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
