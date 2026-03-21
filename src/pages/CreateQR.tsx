import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import QRCodeStyling from 'qr-code-styling';

export default function CreateQR() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [qrType, setQrType] = useState('url');
  const [isDynamic, setIsDynamic] = useState(true);
  const [urlError, setUrlError] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    destination_url: '',
    qr_type: 'url',
    content_data: {} as any,
    slug: '',
    is_active: true,
    style: {
      dot_color: '#1A1916',
      bg_color: '#FFFFFF',
      dot_style: 'square',
      corner_style: 'square',
      error_correction: 'M',
      output_size: 400,
      logo_url: ''
    },
    options: {
      password_protect: false,
      password: '',
      expiry_date_enabled: false,
      expiry_date: '',
      scan_limit_enabled: false,
      scan_limit: 100
    }
  });

  const canvasRef = useRef<HTMLDivElement>(null);
  const qrCodeRef = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    qrCodeRef.current = new QRCodeStyling({
      width: 180,
      height: 180,
      margin: 0,
      type: "canvas",
    });
    if (canvasRef.current) {
      qrCodeRef.current.append(canvasRef.current);
    }
  }, []);

  useEffect(() => {
    if (id) {
      const fetchQR = async () => {
        const docRef = doc(db, 'qr_codes', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          setQrType(data.qr_type || 'url');
          setIsDynamic(data.is_dynamic !== false);
          setFormData({
            title: data.title || '',
            destination_url: data.destination_url || '',
            qr_type: data.qr_type || 'url',
            content_data: data.content_data || {},
            slug: data.slug || '',
            is_active: data.is_active !== false,
            style: {
              dot_color: data.style?.dot_color || '#1A1916',
              bg_color: data.style?.bg_color || '#FFFFFF',
              dot_style: data.style?.dot_style || 'square',
              corner_style: data.style?.corner_style || 'square',
              error_correction: data.style?.error_correction || 'M',
              output_size: data.style?.output_size || 400,
              logo_url: data.style?.logo_url || ''
            },
            options: data.options || {
              password_protect: false,
              password: '',
              expiry_date_enabled: false,
              expiry_date: '',
              scan_limit_enabled: false,
              scan_limit: 100
            }
          });
        }
      };
      fetchQR();
    }
  }, [id]);

  useEffect(() => {
    if (qrType === 'wifi') {
      setIsDynamic(false);
    }
  }, [qrType]);

  useEffect(() => {
    if (qrCodeRef.current) {
      let content = '';
      if (isDynamic) {
        content = formData.slug ? `${window.location.origin}/${formData.slug}` : `${window.location.origin}/preview`;
      } else {
        if (qrType === 'url') {
          content = formData.destination_url || 'https://scnr.app';
        } else if (qrType === 'vcard') {
          content = `BEGIN:VCARD\nVERSION:3.0\nN:${formData.content_data?.last_name || ''};${formData.content_data?.first_name || ''}\nFN:${formData.content_data?.first_name || ''} ${formData.content_data?.last_name || ''}\nTEL:${formData.content_data?.phone || ''}\nEMAIL:${formData.content_data?.email || ''}\nORG:${formData.content_data?.company || ''}\nURL:${formData.content_data?.website || ''}\nEND:VCARD`;
        } else if (qrType === 'wifi') {
          content = `WIFI:S:${formData.content_data?.ssid || ''};T:${formData.content_data?.encryption || 'WPA'};P:${formData.content_data?.password || ''};;`;
        } else if (qrType === 'text') {
          content = formData.content_data?.text || 'Enter text';
        } else if (qrType === 'email') {
          content = `mailto:${formData.content_data?.email || ''}?subject=${encodeURIComponent(formData.content_data?.subject || '')}&body=${encodeURIComponent(formData.content_data?.body || '')}`;
        }
      }

      let dotType: any = 'square';
      if (formData.style.dot_style === 'dots') dotType = 'dots';
      if (formData.style.dot_style === 'rounded') dotType = 'rounded';
      if (formData.style.dot_style === 'diamond') dotType = 'classy';
      if (formData.style.dot_style === 'star') dotType = 'classy-rounded';

      let cornerType: any = 'square';
      if (formData.style.corner_style === 'dot') cornerType = 'dot';
      if (formData.style.corner_style === 'rounded') cornerType = 'extra-rounded';

      qrCodeRef.current.update({
        data: content,
        image: formData.style.logo_url || undefined,
        dotsOptions: {
          color: formData.style.dot_color,
          type: dotType as any
        },
        cornersSquareOptions: {
          type: cornerType as any,
          color: formData.style.dot_color
        },
        cornersDotOptions: {
          type: cornerType === 'extra-rounded' ? 'dot' : cornerType as any,
          color: formData.style.dot_color
        },
        backgroundOptions: {
          color: formData.style.bg_color,
        },
        imageOptions: {
          crossOrigin: 'anonymous',
          margin: 5,
          imageSize: 0.4
        },
        qrOptions: {
          errorCorrectionLevel: formData.style.error_correction as any
        }
      });
    }
  }, [formData.destination_url, formData.style, qrType, formData.content_data, isDynamic, formData.slug]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 1024 * 1024) {
      alert("Logo must be less than 1MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setFormData({
          ...formData,
          style: {
            ...formData.style,
            logo_url: event.target.result as string,
            error_correction: 'H' // Auto set to H
          }
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (qrType === 'url' && (!formData.destination_url || !formData.destination_url.startsWith('http'))) {
      setUrlError(true);
      return;
    }
    setUrlError(false);
    
    if (!auth.currentUser) return;
    setLoading(true);

    try {
      if (id) {
        // Update
        const docRef = doc(db, 'qr_codes', id);
        
        let content = '';
        if (isDynamic) {
          content = `${window.location.origin}/${formData.slug}`;
        } else {
          if (qrType === 'url') {
            content = formData.destination_url || 'https://scnr.app';
          } else if (qrType === 'vcard') {
            content = `BEGIN:VCARD\nVERSION:3.0\nN:${formData.content_data?.last_name || ''};${formData.content_data?.first_name || ''}\nFN:${formData.content_data?.first_name || ''} ${formData.content_data?.last_name || ''}\nTEL:${formData.content_data?.phone || ''}\nEMAIL:${formData.content_data?.email || ''}\nORG:${formData.content_data?.company || ''}\nURL:${formData.content_data?.website || ''}\nEND:VCARD`;
          } else if (qrType === 'wifi') {
            content = `WIFI:S:${formData.content_data?.ssid || ''};T:${formData.content_data?.encryption || 'WPA'};P:${formData.content_data?.password || ''};;`;
          } else if (qrType === 'text') {
            content = formData.content_data?.text || '';
          } else if (qrType === 'email') {
            content = `mailto:${formData.content_data?.email || ''}?subject=${encodeURIComponent(formData.content_data?.subject || '')}&body=${encodeURIComponent(formData.content_data?.body || '')}`;
          }
        }

        let qrSvg = '';
        if (qrCodeRef.current) {
          const rawSvg = await qrCodeRef.current.getRawData('svg');
          if (rawSvg) {
            qrSvg = await (rawSvg as Blob).text();
          }
        }

        await updateDoc(docRef, {
          ...formData,
          qr_type: qrType,
          is_dynamic: isDynamic,
          qr_svg: qrSvg,
          updated_at: serverTimestamp(),
        });
      } else {
        // Create via exact schema backend API
        const token = await auth.currentUser.getIdToken();
        const res = await fetch('/api/qr', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            ...formData,
            is_dynamic: isDynamic
          })
        });
        
        if (!res.ok) {
          throw new Error('Failed to create QR code on the server');
        }
      }
      navigate('/');
    } catch (error) {
      console.error('Error saving QR code:', error);
      alert('Failed to save QR code');
    } finally {
      setLoading(false);
    }
  };

  const downloadPreview = (fmt: string) => {
    if (!qrCodeRef.current) return;
    const extension = fmt === 'print' ? 'png' : fmt;
    qrCodeRef.current.download({ name: 'scnr-qr', extension: extension as any });
  };

  const getShortUrl = () => {
    if (!formData.destination_url) return 'Enter content to generate QR';
    const short = formData.destination_url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    return '→ ' + (short.length > 40 ? short.slice(0, 40) + '…' : short);
  };

  return (
    <div className="content" style={{ padding: '28px', overflow: 'auto', height: '100%' }}>
      <div className="page active">
        <div className="create-layout">
          {/* Left: Form */}
          <div>
            {/* QR type selector */}
            <div className="card mb16">
              <div className="card-title">QR code type</div>
              <div className="qr-type-tabs">
                <button className={`qr-type-tab ${qrType === 'url' ? 'active' : ''}`} onClick={() => { setQrType('url'); setFormData({...formData, qr_type: 'url'}); }}>URL</button>
                <button className={`qr-type-tab ${qrType === 'vcard' ? 'active' : ''}`} onClick={() => { setQrType('vcard'); setFormData({...formData, qr_type: 'vcard'}); }}>vCard</button>
                <button className={`qr-type-tab ${qrType === 'wifi' ? 'active' : ''}`} onClick={() => { setQrType('wifi'); setFormData({...formData, qr_type: 'wifi'}); }}>WiFi</button>
                <button className={`qr-type-tab ${qrType === 'text' ? 'active' : ''}`} onClick={() => { setQrType('text'); setFormData({...formData, qr_type: 'text'}); }}>Text</button>
                <button className={`qr-type-tab ${qrType === 'email' ? 'active' : ''}`} onClick={() => { setQrType('email'); setFormData({...formData, qr_type: 'email'}); }}>Email</button>
              </div>

              {/* URL fields */}
              {qrType === 'url' && (
                <div id="fields-url">
                  <div className="form-section">
                    <label className="form-label">Destination URL *</label>
                    <input 
                      type="url" 
                      className={`form-input ${urlError ? 'error' : ''}`} 
                      placeholder="https://yourwebsite.com" 
                      value={formData.destination_url}
                      onChange={(e) => setFormData({...formData, destination_url: e.target.value})}
                    />
                    {urlError && <div className="error-msg" style={{ display: 'block' }}>Please enter a valid URL starting with https://</div>}
                  </div>
                  <div className="form-section">
                    <label className="form-label">QR Code title</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. Restaurant Menu QR" 
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                    />
                  </div>
                </div>
              )}

              {/* vCard fields */}
              {qrType === 'vcard' && (
                <div id="fields-vcard">
                  <div className="grid-2 mb16" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
                  <div className="form-section">
                    <label className="form-label">QR Code title</label>
                    <input type="text" className="form-input" placeholder="e.g. My Contact Info" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} />
                  </div>
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
                  <div className="form-section">
                    <label className="form-label">QR Code title</label>
                    <input type="text" className="form-input" placeholder="e.g. Guest WiFi" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} />
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
                  <div className="form-section">
                    <label className="form-label">QR Code title</label>
                    <input type="text" className="form-input" placeholder="e.g. Secret Message" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} />
                  </div>
                </div>
              )}

              {/* Email fields */}
              {qrType === 'email' && (
                <div id="fields-email">
                  <div className="form-section"><label className="form-label">Recipient email</label><input type="email" className="form-input" placeholder="hello@example.com" value={formData.content_data?.email || ''} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, email: e.target.value}})} /></div>
                  <div className="form-section"><label className="form-label">Subject</label><input type="text" className="form-input" placeholder="Subject line" value={formData.content_data?.subject || ''} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, subject: e.target.value}})} /></div>
                  <div className="form-section"><label className="form-label">Body (optional)</label><textarea className="form-input" placeholder="Message body..." rows={3} value={formData.content_data?.body || ''} onChange={(e) => setFormData({...formData, content_data: {...formData.content_data, body: e.target.value}})}></textarea></div>
                  <div className="form-section">
                    <label className="form-label">QR Code title</label>
                    <input type="text" className="form-input" placeholder="e.g. Contact Support" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} />
                  </div>
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
                <button 
                  className="btn btn-ghost" 
                  style={{ padding: '4px 12px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px' }} 
                  onClick={() => setFormData({...formData, style: { dot_color: '#1A1916', bg_color: '#FFFFFF', dot_style: 'square', corner_style: 'square', error_correction: 'M', output_size: 400, logo_url: '' }})}
                >
                  Reset style
                </button>
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
                <div className="form-section" style={{ flex: 2 }}>
                  <label className="form-label">Dot style</label>
                  <div className="style-grid">
                    <div className={`style-opt ${formData.style.dot_style === 'square' ? 'selected' : ''}`} onClick={() => setFormData({...formData, style: {...formData.style, dot_style: 'square'}})} title="Square">
                      <svg viewBox="0 0 28 28" fill="var(--text2)"><rect x="2" y="2" width="6" height="6"/><rect x="20" y="2" width="6" height="6"/><rect x="2" y="20" width="6" height="6"/><rect x="11" y="2" width="6" height="6"/><rect x="2" y="11" width="6" height="6"/><rect x="20" y="20" width="6" height="6"/><rect x="11" y="20" width="6" height="6"/><rect x="20" y="11" width="6" height="6"/><rect x="11" y="11" width="6" height="6"/></svg>
                    </div>
                    <div className={`style-opt ${formData.style.dot_style === 'dots' ? 'selected' : ''}`} onClick={() => setFormData({...formData, style: {...formData.style, dot_style: 'dots'}})} title="Dots">
                      <svg viewBox="0 0 28 28" fill="var(--text2)"><circle cx="5" cy="5" r="3"/><circle cx="23" cy="5" r="3"/><circle cx="5" cy="23" r="3"/><circle cx="14" cy="5" r="3"/><circle cx="5" cy="14" r="3"/><circle cx="23" cy="23" r="3"/><circle cx="14" cy="23" r="3"/><circle cx="23" cy="14" r="3"/><circle cx="14" cy="14" r="3"/></svg>
                    </div>
                    <div className={`style-opt ${formData.style.dot_style === 'rounded' ? 'selected' : ''}`} onClick={() => setFormData({...formData, style: {...formData.style, dot_style: 'rounded'}})} title="Rounded">
                      <svg viewBox="0 0 28 28" fill="var(--text2)"><rect x="2" y="2" width="6" height="6" rx="2"/><rect x="20" y="2" width="6" height="6" rx="2"/><rect x="2" y="20" width="6" height="6" rx="2"/><rect x="11" y="2" width="6" height="6" rx="2"/><rect x="2" y="11" width="6" height="6" rx="2"/><rect x="20" y="20" width="6" height="6" rx="2"/><rect x="11" y="20" width="6" height="6" rx="2"/><rect x="20" y="11" width="6" height="6" rx="2"/><rect x="11" y="11" width="6" height="6" rx="2"/></svg>
                    </div>
                    <div className={`style-opt ${formData.style.dot_style === 'diamond' ? 'selected' : ''}`} onClick={() => setFormData({...formData, style: {...formData.style, dot_style: 'diamond'}})} title="Diamond">
                      <svg viewBox="0 0 28 28" fill="var(--text2)"><polygon points="5,2 8,5 5,8 2,5"/><polygon points="23,2 26,5 23,8 20,5"/><polygon points="5,20 8,23 5,26 2,23"/><polygon points="14,2 17,5 14,8 11,5"/><polygon points="5,11 8,14 5,17 2,14"/><polygon points="23,20 26,23 23,26 20,23"/><polygon points="14,20 17,23 14,26 11,23"/><polygon points="23,11 26,14 23,17 20,14"/><polygon points="14,11 17,14 14,17 11,14"/></svg>
                    </div>
                    <div className={`style-opt ${formData.style.dot_style === 'star' ? 'selected' : ''}`} onClick={() => setFormData({...formData, style: {...formData.style, dot_style: 'star'}})} title="Star">
                      <svg viewBox="0 0 28 28" fill="var(--text2)"><text x="2" y="9" fontSize="8">★</text><text x="20" y="9" fontSize="8">★</text><text x="11" y="9" fontSize="8">★</text><text x="2" y="18" fontSize="8">★</text><text x="20" y="18" fontSize="8">★</text><text x="11" y="18" fontSize="8">★</text><text x="2" y="27" fontSize="8">★</text><text x="20" y="27" fontSize="8">★</text><text x="11" y="27" fontSize="8">★</text></svg>
                    </div>
                  </div>
                </div>
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
                      <div style={{ fontSize: '12px', color: 'var(--text3)' }}>PNG, SVG, or JPG · Max 1MB · Will be centered at 22% size</div>
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
                  onClick={() => setIsDynamic(!isDynamic)}
                ></button>
              </div>

              <div className="toggle-wrap" style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, marginBottom: '4px' }}>Password protect</div>
                  <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Require a PIN before redirecting</div>
                </div>
                <button 
                  className={`toggle ${formData.options.password_protect ? 'on' : ''}`} 
                  onClick={() => setFormData({...formData, options: {...formData.options, password_protect: !formData.options.password_protect}})}
                ></button>
              </div>
              {formData.options.password_protect && (
                <div className="form-section" style={{ padding: '0 0 16px 0' }}>
                  <input type="text" className="form-input" placeholder="Enter PIN or password" value={formData.options.password} onChange={(e) => setFormData({...formData, options: {...formData.options, password: e.target.value}})} />
                </div>
              )}

              <div className="toggle-wrap" style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, marginBottom: '4px' }}>Expiry date</div>
                  <div style={{ fontSize: '13px', color: 'var(--text3)' }}>QR deactivates automatically after this date</div>
                </div>
                <button 
                  className={`toggle ${formData.options.expiry_date_enabled ? 'on' : ''}`} 
                  onClick={() => setFormData({...formData, options: {...formData.options, expiry_date_enabled: !formData.options.expiry_date_enabled}})}
                ></button>
              </div>
              {formData.options.expiry_date_enabled && (
                <div className="form-section" style={{ padding: '0 0 16px 0' }}>
                  <input type="datetime-local" className="form-input" value={formData.options.expiry_date} onChange={(e) => setFormData({...formData, options: {...formData.options, expiry_date: e.target.value}})} />
                </div>
              )}

              <div className="toggle-wrap" style={{ padding: '16px 0' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, marginBottom: '4px' }}>Scan limit</div>
                  <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Deactivate after N total scans</div>
                </div>
                <button 
                  className={`toggle ${formData.options.scan_limit_enabled ? 'on' : ''}`} 
                  onClick={() => setFormData({...formData, options: {...formData.options, scan_limit_enabled: !formData.options.scan_limit_enabled}})}
                ></button>
              </div>
              {formData.options.scan_limit_enabled && (
                <div className="form-section" style={{ padding: '0 0 0 0' }}>
                  <input type="number" className="form-input" placeholder="e.g. 100" value={formData.options.scan_limit} onChange={(e) => setFormData({...formData, options: {...formData.options, scan_limit: parseInt(e.target.value) || 0}})} />
                </div>
              )}
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
                  setFormData({
                    title: '',
                    destination_url: '',
                    slug: '',
                    qr_type: 'url',
                    content_data: {},
                    style: {
                      dot_color: '#1A1916',
                      bg_color: '#FFFFFF',
                      dot_style: 'square',
                      corner_style: 'square',
                      error_correction: 'M',
                      output_size: 400,
                      logo_url: ''
                    },
                    options: {
                      password_protect: false,
                      password: '',
                      expiry_date_enabled: false,
                      expiry_date: '',
                      scan_limit_enabled: false,
                      scan_limit: 100
                    }
                  });
                }}
              >
                Reset
              </button>
            </div>
          </div>

          {/* Right: Preview */}
          <div className="qr-preview-card">
            <div className="card-title">Live preview</div>
            <div className="qr-preview-frame">
              <div ref={canvasRef} id="preview-canvas"></div>
            </div>
            <div className="qr-preview-slug" id="preview-slug">
              {isDynamic ? `scnr.app/${formData.slug || '———'}` : 'Static QR'}
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
                <button className="dl-btn" onClick={() => downloadPreview('print')}>Print PDF</button>
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
