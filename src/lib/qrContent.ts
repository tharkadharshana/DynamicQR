// What a QR code encodes. Shared by the dashboard, the create/edit preview, the viewer modal and the server.
// Dynamic codes always encode the permanent short domain, never window.location (printed codes must not
// depend on which host the dashboard happened to be opened on).

// Vite only inlines `import.meta.env.VITE_*` written out in full; the typeof guard keeps Node (server, QA) safe.
const ENV_DOMAIN = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_SHORT_DOMAIN : undefined;
export const SHORT_DOMAIN: string = (ENV_DOMAIN || 'https://scnr.tharkak.com').replace(/\/$/, '');

export const SHORT_HOST = SHORT_DOMAIN.replace(/^https?:\/\//, '');

// Team accounts with a verified custom domain encode that instead (set once the plan loads).
let activeDomain = SHORT_DOMAIN;
export function setShortDomain(hostname: string | null | undefined) {
  activeDomain = hostname ? `https://${hostname}` : SHORT_DOMAIN;
}
export const shortHost = () => activeDomain.replace(/^https?:\/\//, '');

export function vcardText(d: any = {}): string {
  return `BEGIN:VCARD\nVERSION:3.0\nN:${d.last_name || ''};${d.first_name || ''}\nFN:${d.first_name || ''} ${d.last_name || ''}\nTEL:${d.phone || ''}\nEMAIL:${d.email || ''}\nORG:${d.company || ''}\nURL:${d.website || ''}\nEND:VCARD`;
}

/** qr-code-styling options from a stored `style` (used by the editor preview, downloads and the viewer modal). */
export function stylingOptions(style: any = {}, data: string, size: number) {
  const dotType = ({ dots: 'dots', rounded: 'rounded', diamond: 'classy', star: 'classy-rounded' } as any)[style.dot_style] || 'square';
  const cornerType = ({ dot: 'dot', rounded: 'extra-rounded' } as any)[style.corner_style] || 'square';
  const color = style.dot_color || '#000000';
  return {
    width: size,
    height: size,
    data,
    image: style.logo_url || undefined,
    dotsOptions: { color, type: dotType },
    cornersSquareOptions: { type: cornerType, color },
    cornersDotOptions: { type: cornerType === 'extra-rounded' ? 'dot' : cornerType, color },
    backgroundOptions: { color: style.bg_color || '#FFFFFF' },
    imageOptions: { crossOrigin: 'anonymous', margin: 5, imageSize: 0.4 },
    qrOptions: { errorCorrectionLevel: style.error_correction || 'M' },
  } as any;
}

/** Shrink an uploaded logo to <= maxPx (PNG data URL) so the QR save stays far below the 100 KB API body limit. */
export function resizeLogo(file: File, maxPx = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale) || maxPx;
      canvas.height = Math.round(img.height * scale) || maxPx;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = URL.createObjectURL(file);
  });
}

export function getQRContent(qr: any, shortDomain: string = activeDomain): string {
  if (qr.is_dynamic !== false) return `${shortDomain}/${qr.slug}`;
  const d = qr.content_data || {};
  switch (qr.qr_type) {
    case 'vcard': return vcardText(d);
    case 'wifi': return `WIFI:S:${d.ssid || ''};T:${d.encryption || 'WPA'};P:${d.password || ''};;`;
    case 'text': return d.text || '';
    case 'email': return `mailto:${d.email || ''}?subject=${encodeURIComponent(d.subject || '')}&body=${encodeURIComponent(d.body || '')}`;
    default: return qr.destination_url || '';
  }
}
