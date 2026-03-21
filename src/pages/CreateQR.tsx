import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import QRCode from 'qrcode';

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
      error_correction: 'M'
    },
    rate_limit: {
      enabled: false,
      max_scans: 100,
      period: 'total'
    }
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);

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
              error_correction: data.style?.error_correction || 'M'
            },
            rate_limit: data.rate_limit || { enabled: false, max_scans: 100, period: 'total' }
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
    if (canvasRef.current) {
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

      QRCode.toCanvas(canvasRef.current, content, {
        width: 180,
        margin: 1,
        color: {
          dark: formData.style.dot_color,
          light: formData.style.bg_color,
        },
        errorCorrectionLevel: formData.style.error_correction as any
      }).catch(err => console.error(err));
    }
  }, [formData.destination_url, formData.style, qrType, formData.content_data, isDynamic, formData.slug]);

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

        const qrSvg = await QRCode.toString(content, {
          type: 'svg',
          color: { dark: formData.style.dot_color, light: formData.style.bg_color },
          margin: 1
        });

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
    if (!canvasRef.current) return;
    const a = document.createElement('a');
    a.download = `scnr-qr.${fmt === 'print' ? 'png' : fmt}`;
    a.href = canvasRef.current.toDataURL('image/png');
    a.click();
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
              <div className="card-title">Style</div>

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

              <div className="form-section">
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

              <div className="toggle-wrap">
                <button 
                  className={`toggle ${isDynamic ? 'on' : ''}`} 
                  onClick={() => setIsDynamic(!isDynamic)}
                ></button>
                <span className="toggle-label">Dynamic QR (editable destination + analytics)</span>
              </div>
            </div>

            {/* Advanced Settings */}
            <div className="card mb16">
              <div className="card-title">Advanced Settings</div>
              <div className="toggle-wrap mb16">
                <button 
                  className={`toggle ${formData.rate_limit.enabled ? 'on' : ''}`} 
                  onClick={() => setFormData({...formData, rate_limit: {...formData.rate_limit, enabled: !formData.rate_limit.enabled}})}
                ></button>
                <span className="toggle-label">Enable Rate Limiting</span>
              </div>

              {formData.rate_limit.enabled && (
                <div style={{ display: 'flex', gap: '16px', background: 'var(--surface2)', padding: '16px', borderRadius: '8px' }}>
                  <div className="form-section" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="form-label">Max Scans</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      min="1"
                      value={formData.rate_limit.max_scans}
                      onChange={(e) => setFormData({...formData, rate_limit: {...formData.rate_limit, max_scans: parseInt(e.target.value) || 1}})}
                    />
                  </div>
                  <div className="form-section" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="form-label">Period</label>
                    <select 
                      className="form-input"
                      value={formData.rate_limit.period}
                      onChange={(e) => setFormData({...formData, rate_limit: {...formData.rate_limit, period: e.target.value}})}
                    >
                      <option value="total">Total (Lifetime)</option>
                      <option value="daily">Per Day</option>
                      <option value="monthly">Per Month</option>
                    </select>
                  </div>
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
            </div>
          </div>

          {/* Right: Preview */}
          <div className="preview-pane">
            <div className="preview-sticky">
              <div className="preview-card">
                <div className="preview-header">
                  <div className="preview-dots"><span></span><span></span><span></span></div>
                  <div className="preview-url" id="preview-dest">{getShortUrl()}</div>
                </div>
                <div className="preview-qr-wrap">
                  <canvas ref={canvasRef} width="180" height="180" style={{ display: 'block', margin: '0 auto' }}></canvas>
                </div>
                <div className="preview-meta">
                  <div className="meta-row"><span>Type</span><span id="preview-type">{qrType.toUpperCase()}</span></div>
                  <div className="meta-row"><span>Mode</span><span id="preview-mode">{isDynamic ? 'Dynamic' : 'Static'}</span></div>
                  <div className="meta-row"><span>Error correction</span><span id="preview-ec">{formData.style.error_correction}</span></div>
                  <div className="meta-row"><span>Short URL</span><span id="preview-slug" style={{ color: 'var(--blue)' }}>{window.location.host}/{formData.slug || '———'}</span></div>
                </div>
              </div>
              <div className="download-row">
                <button className="btn btn-ghost" onClick={() => downloadPreview('png')}>PNG</button>
                <button className="btn btn-ghost" onClick={() => downloadPreview('svg')}>SVG</button>
                <button className="btn btn-ghost" onClick={() => downloadPreview('print')}>Print PDF</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
