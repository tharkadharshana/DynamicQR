import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { apiFetch } from '../lib/api';
import QRCode from 'qrcode';
import { ArrowLeft, Download, Palette, Eye } from 'lucide-react';

const DOT_STYLES = [
  { value: 'square', label: 'Square', icon: '■' },
  { value: 'rounded', label: 'Rounded', icon: '▢' },
  { value: 'dots', label: 'Dots', icon: '●' },
];

const CORNER_STYLES = [
  { value: 'square', label: 'Square' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'extra_rounded', label: 'Extra Round' },
];

export default function CreateQR() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    destination_url: '',
    is_active: true,
    type: 'url',
    style: {
      dot_color: '#8b5cf6',
      bg_color: '#0f0f18',
      dot_style: 'square',
      corner_style: 'square',
      logo_url: null as string | null,
      error_correction: 'M'
    }
  });

  useEffect(() => {
    if (id) {
      const fetchQR = async () => {
        const docRef = doc(db, 'qr_codes', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          setFormData({
            title: data.title || '',
            destination_url: data.destination_url || '',
            is_active: data.is_active !== false,
            type: data.type || 'url',
            style: {
              dot_color: data.style?.dot_color || '#8b5cf6',
              bg_color: data.style?.bg_color || '#0f0f18',
              dot_style: data.style?.dot_style || 'square',
              corner_style: data.style?.corner_style || 'square',
              logo_url: data.style?.logo_url || null,
              error_correction: data.style?.error_correction || 'M'
            }
          });
        }
      };
      fetchQR();
    }
  }, [id]);

  useEffect(() => {
    const generatePreview = async () => {
      if (!formData.destination_url) {
        setQrDataUrl('');
        return;
      }
      try {
        const url = await QRCode.toDataURL(
          id ? `https://scnr.app/${id}` : formData.destination_url,
          {
            color: {
              dark: formData.style.dot_color,
              light: formData.style.bg_color,
            },
            margin: 2,
            width: 400,
            errorCorrectionLevel: (formData.style.error_correction || 'M') as any,
          }
        );
        setQrDataUrl(url);
      } catch (err) {
        console.error(err);
      }
    };
    generatePreview();
  }, [formData.destination_url, formData.style, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (id) {
        await apiFetch(`/api/qr/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: formData.title,
            destination_url: formData.destination_url,
            is_active: formData.is_active,
            style: formData.style
          })
        });
        setSuccess('QR code updated successfully!');
        setTimeout(() => navigate('/'), 1000);
      } else {
        await apiFetch('/api/qr', {
          method: 'POST',
          body: JSON.stringify({
            title: formData.title,
            destination_url: formData.destination_url,
            type: formData.type,
            style: formData.style
          })
        });
        setSuccess('QR code created successfully!');
        setTimeout(() => navigate('/'), 1000);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save QR code');
    } finally {
      setLoading(false);
    }
  };

  const downloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.download = `scnr-qr-${id || 'preview'}.png`;
    a.href = qrDataUrl;
    a.click();
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/')} className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">{id ? 'Edit QR Code' : 'Create New QR Code'}</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{id ? 'Update your QR code settings' : 'Set up your dynamic QR code'}</p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className="lg:col-span-3">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6 space-y-5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-violet-400" />
                Basic Information
              </h3>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 transition-all"
                  placeholder="e.g., Restaurant Menu QR"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Destination URL</label>
                <input
                  type="url"
                  required
                  value={formData.destination_url}
                  onChange={(e) => setFormData({ ...formData, destination_url: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 transition-all"
                  placeholder="https://example.com"
                />
              </div>

              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-700 rounded-full peer peer-checked:bg-violet-600 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                </label>
                <span className="text-sm text-zinc-300">Active</span>
              </div>
            </div>

            {/* Style Options */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6 space-y-5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-violet-400" />
                Style Customization
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Dot Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.style.dot_color}
                      onChange={(e) => setFormData({
                        ...formData,
                        style: { ...formData.style, dot_color: e.target.value }
                      })}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent"
                    />
                    <input
                      type="text"
                      value={formData.style.dot_color}
                      onChange={(e) => setFormData({
                        ...formData,
                        style: { ...formData.style, dot_color: e.target.value }
                      })}
                      className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-300 font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Background Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.style.bg_color}
                      onChange={(e) => setFormData({
                        ...formData,
                        style: { ...formData.style, bg_color: e.target.value }
                      })}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent"
                    />
                    <input
                      type="text"
                      value={formData.style.bg_color}
                      onChange={(e) => setFormData({
                        ...formData,
                        style: { ...formData.style, bg_color: e.target.value }
                      })}
                      className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-300 font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                  </div>
                </div>
              </div>

              {/* Dot Style */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">Dot Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {DOT_STYLES.map((style) => (
                    <button
                      key={style.value}
                      type="button"
                      onClick={() => setFormData({
                        ...formData,
                        style: { ...formData.style, dot_style: style.value }
                      })}
                      className={`px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                        formData.style.dot_style === style.value
                          ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                          : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:border-white/[0.12]'
                      }`}
                    >
                      <span className="text-lg mr-1">{style.icon}</span> {style.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Corner Style */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">Corner Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {CORNER_STYLES.map((style) => (
                    <button
                      key={style.value}
                      type="button"
                      onClick={() => setFormData({
                        ...formData,
                        style: { ...formData.style, corner_style: style.value }
                      })}
                      className={`px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                        formData.style.corner_style === style.value
                          ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                          : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:border-white/[0.12]'
                      }`}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error Correction */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Error Correction Level</label>
                <select
                  value={formData.style.error_correction}
                  onChange={(e) => setFormData({
                    ...formData,
                    style: { ...formData.style, error_correction: e.target.value }
                  })}
                  className="w-full px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/30 appearance-none cursor-pointer"
                >
                  <option value="L">Low (7% recovery)</option>
                  <option value="M">Medium (15% recovery)</option>
                  <option value="Q">Quartile (25% recovery)</option>
                  <option value="H">High (30% recovery — required for logo)</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-4 py-2.5 rounded-lg border border-white/[0.08] text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-sm font-medium text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 disabled:opacity-50 transition-all"
              >
                {loading ? 'Saving...' : id ? 'Update QR Code' : 'Create QR Code'}
              </button>
            </div>
          </form>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2">
          <div className="sticky top-8 rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
            <h3 className="text-sm font-semibold text-white mb-4">Preview</h3>
            {qrDataUrl ? (
              <div className="space-y-4">
                <div className="flex justify-center p-6 rounded-lg" style={{ backgroundColor: formData.style.bg_color }}>
                  <img src={qrDataUrl} alt="QR Code Preview" className="w-52 h-52 rounded-lg shadow-xl" />
                </div>
                <button
                  type="button"
                  onClick={downloadQR}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.06] text-sm font-medium text-zinc-300 hover:bg-white/[0.1] transition-all"
                >
                  <Download className="w-4 h-4" />
                  Download PNG
                </button>
                <div className="text-center">
                  <p className="text-[11px] text-zinc-600">
                    Version 3 · {formData.style.error_correction} correction · 29×29 modules
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-60 text-zinc-600">
                <QRCode className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">Enter a URL to see preview</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper component for QRCode icon in empty state
function QRCodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="3" height="3" /><rect x="18" y="14" width="3" height="3" /><rect x="14" y="18" width="3" height="3" /><rect x="18" y="18" width="3" height="3" />
    </svg>
  );
}
