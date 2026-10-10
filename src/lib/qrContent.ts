// What a QR code encodes. Shared by the dashboard, the create/edit preview, the viewer modal and the server.
// Dynamic codes always encode the permanent short domain, never window.location (printed codes must not
// depend on which host the dashboard happened to be opened on).

export const SHORT_DOMAIN: string = (
  (import.meta as any).env?.VITE_SHORT_DOMAIN || 'https://scnr.tharkak.com'
).replace(/\/$/, '');

export const SHORT_HOST = SHORT_DOMAIN.replace(/^https?:\/\//, '');

export function vcardText(d: any = {}): string {
  return `BEGIN:VCARD\nVERSION:3.0\nN:${d.last_name || ''};${d.first_name || ''}\nFN:${d.first_name || ''} ${d.last_name || ''}\nTEL:${d.phone || ''}\nEMAIL:${d.email || ''}\nORG:${d.company || ''}\nURL:${d.website || ''}\nEND:VCARD`;
}

export function getQRContent(qr: any, shortDomain: string = SHORT_DOMAIN): string {
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
