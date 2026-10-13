import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import ToolsLayout from '../components/ToolsLayout';
import { TOOLS } from '../components/FooterHub';
import { buildDestination, stylingOptions, withUtm } from '../lib/qrContent';

const PLACE_ID_FINDER = 'https://developers.google.com/maps/documentation/places/web-service/place-id';

/** Text field with a visible label. */
function Field({ label, value, onChange, placeholder, type = 'text', hint, multiline }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; hint?: React.ReactNode; multiline?: boolean;
}) {
  const id = 'f-' + label.replace(/\W+/g, '-').toLowerCase();
  const props = { id, value, placeholder, onChange: (e: React.ChangeEvent<any>) => onChange(e.target.value), className: 'tool-input' };
  return (
    <div className="tool-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea rows={3} {...props} /> : <input type={type} {...props} />}
      {hint && <small>{hint}</small>}
    </div>
  );
}

/** Output box with a Copy button; the copy status is announced to screen readers. */
function CopyResult({ value, children }: { value: string; children?: React.ReactNode }) {
  const [msg, setMsg] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setMsg('Copied'); } catch { setMsg('Copy failed. Select the text and copy it.'); }
    setTimeout(() => setMsg(''), 2500);
  };
  return (
    <div className="tool-out">
      <output aria-live="polite" className="tool-result">{value || 'Your result appears here.'}</output>
      <div className="tool-actions">
        <button type="button" className="btn-cta" onClick={copy} disabled={!value}>Copy</button>
        {value && children}
        <span role="status" className="tool-status">{msg}</span>
      </div>
    </div>
  );
}

const Cta = ({ text = 'Need to change where it points later? Make a dynamic code.' }: { text?: string }) => (
  <div className="tool-cta">
    <p>{text}</p>
    <Link to="/login" className="btn-cta">Sign up free</Link>
  </div>
);

function UtmBuilder() {
  const [url, setUrl] = useState('');
  const [u, setU] = useState({ source: '', medium: '', campaign: '', term: '', content: '' });
  const set = (k: keyof typeof u) => (v: string) => setU(p => ({ ...p, [k]: v.trim() }));
  let valid = true;
  try { valid = /^https?:$/.test(new URL(url).protocol); } catch { valid = false; }
  const out = url && valid ? withUtm(url.trim(), u) : '';
  return (
    <>
      <Field label="Website link" type="url" value={url} onChange={setUrl} placeholder="https://yourcafe.lk/menu" hint={url && !valid ? 'Start with http:// or https://' : undefined} />
      <div className="tool-grid">
        <Field label="Source" value={u.source} onChange={set('source')} placeholder="flyer" />
        <Field label="Medium" value={u.medium} onChange={set('medium')} placeholder="qr" />
        <Field label="Campaign" value={u.campaign} onChange={set('campaign')} placeholder="new-year-sale" />
        <Field label="Term (optional)" value={u.term} onChange={set('term')} />
        <Field label="Content (optional)" value={u.content} onChange={set('content')} />
      </div>
      <CopyResult value={out} />
      <p className="tool-note">If your link already has a utm_ tag, it is kept. Scnr can add the same tags to a dynamic code for you, so you can change them later without reprinting.</p>
      <Cta />
    </>
  );
}

function ReviewLink() {
  const [id, setId] = useState('');
  return (
    <>
      <Field label="Google Place ID" value={id} onChange={setId} placeholder="ChIJ..." hint={<>Don't know it? <a href={PLACE_ID_FINDER} target="_blank" rel="noreferrer">Find your Place ID with Google's finder</a>.</>} />
      <CopyResult value={buildDestination('google_review', { place_id: id })}>
        {id.trim() && <a className="btn-text" href={buildDestination('google_review', { place_id: id })} target="_blank" rel="noreferrer">Test link</a>}
      </CopyResult>
      <Cta text="Put it on a table tent as a QR code, and change it later if you move or rebrand." />
    </>
  );
}

function WhatsappLink() {
  const [phone, setPhone] = useState('');
  const [text, setText] = useState('');
  const out = buildDestination('whatsapp', { phone, text });
  return (
    <>
      <Field label="Phone number with country code" type="tel" value={phone} onChange={setPhone} placeholder="+94 77 123 4567" />
      <Field label="Message (optional)" value={text} onChange={setText} placeholder="Hi, I'd like to book a table" multiline />
      <CopyResult value={out}>
        {out && <a className="btn-text" href={out} target="_blank" rel="noreferrer">Test link</a>}
      </CopyResult>
      <Cta />
    </>
  );
}

function QrGenerator() {
  const [text, setText] = useState('');
  const [dot, setDot] = useState('#000000');
  const [bg, setBg] = useState('#FFFFFF');
  const box = useRef<HTMLDivElement>(null);
  const qr = useRef<any>(null);
  useEffect(() => {
    let live = true;
    if (!text.trim()) { qr.current = null; if (box.current) box.current.innerHTML = ''; return; }
    import('qr-code-styling').then(({ default: QRCodeStyling }) => {
      if (!live || !box.current) return;
      const opts = stylingOptions({ dot_color: dot, bg_color: bg, dot_style: 'rounded', error_correction: 'M' }, text.trim(), 280);
      if (qr.current) qr.current.update(opts);
      else { qr.current = new QRCodeStyling(opts); box.current.innerHTML = ''; qr.current.append(box.current); }
    });
    return () => { live = false; };
  }, [text, dot, bg]);
  const dl = (extension: 'png' | 'svg') => qr.current?.download({ name: 'qr-code', extension });
  return (
    <>
      <Field label="Link or text" value={text} onChange={setText} placeholder="https://yourcafe.lk/menu" />
      <div className="tool-grid">
        <div className="tool-field"><label htmlFor="qr-dot">Dot colour</label><input id="qr-dot" type="color" value={dot} onChange={e => setDot(e.target.value)} /></div>
        <div className="tool-field"><label htmlFor="qr-bg">Background colour</label><input id="qr-bg" type="color" value={bg} onChange={e => setBg(e.target.value)} /></div>
      </div>
      <div ref={box} className="tool-qr" aria-live="polite" aria-label="QR code preview" />
      {!text.trim() && <p className="tool-note">Type a link or some text to see your code.</p>}
      <div className="tool-actions">
        <button type="button" className="btn-cta" disabled={!text.trim()} onClick={() => dl('png')}>Download PNG</button>
        <button type="button" className="btn-cta" disabled={!text.trim()} onClick={() => dl('svg')}>Download SVG</button>
      </div>
      <p className="tool-note">This is a static code: the link is built into the pattern, so it can never be changed or counted. Keep strong contrast between the two colours so phones can read it.</p>
      <Cta />
    </>
  );
}

function QrScanner() {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const [on, setOn] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const stop = () => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
    setOn(false);
  };
  useEffect(() => stop, []);

  /** Decode one image source: the browser's BarcodeDetector when present, else jsQR on a canvas. */
  const decode = async (src: HTMLVideoElement | ImageBitmap, w: number, h: number): Promise<string> => {
    const BD = (window as any).BarcodeDetector;
    if (BD) {
      const found = await new BD({ formats: ['qr_code'] }).detect(src);
      return found[0]?.rawValue || '';
    }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(src, 0, 0, w, h);
    const { default: jsQR } = await import('jsqr');
    return jsQR(ctx.getImageData(0, 0, w, h).data, w, h)?.data || '';
  };

  const start = async () => {
    setError(''); setResult('');
    if (!navigator.mediaDevices?.getUserMedia) { setError('This browser cannot open the camera. Use "Scan from a photo" instead.'); return; }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Camera access was blocked. Allow the camera in your browser settings, or use "Scan from a photo".'
        : e?.name === 'NotFoundError' ? 'No camera found on this device. Use "Scan from a photo" instead.'
        : 'The camera could not be started. Use "Scan from a photo" instead.');
      return;
    }
    const v = video.current!;
    v.srcObject = stream.current;
    await v.play().catch(() => {});
    setOn(true);
    let last = 0;
    const tick = async (t: number) => {
      if (!stream.current) return;
      if (t - last > 150 && v.videoWidth) {
        last = t;
        try {
          const text = await decode(v, v.videoWidth, v.videoHeight);
          if (text) { setResult(text); stop(); return; }
        } catch { /* keep trying */ }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const fromFile = async (f?: File) => {
    if (!f) return;
    setError(''); setResult('');
    try {
      const bmp = await createImageBitmap(f);
      const text = await decode(bmp, bmp.width, bmp.height);
      bmp.close();
      if (text) setResult(text); else setError('No QR code found in that photo. Try a sharper, closer picture.');
    } catch { setError('That file could not be read as an image.'); }
  };

  const isUrl = /^https?:\/\//i.test(result);
  const copy = async () => {
    try { await navigator.clipboard.writeText(result); setCopied('Copied'); } catch { setCopied('Copy failed'); }
    setTimeout(() => setCopied(''), 2500);
  };
  return (
    <>
      <div className="tool-video" hidden={!on}>
        <video ref={video} playsInline muted aria-label="Camera preview" />
      </div>
      <div className="tool-actions">
        {on ? <button type="button" className="btn-cta" onClick={stop}>Stop camera</button>
          : <button type="button" className="btn-cta" onClick={start}>Scan with camera</button>}
        <label className="btn-text tool-file">
          Scan from a photo
          <input type="file" accept="image/*" onChange={e => { fromFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      <div aria-live="polite">
        {error && <p className="tool-error" role="alert">{error}</p>}
        {result && (
          <div className="tool-out">
            <output className="tool-result">{result}</output>
            <div className="tool-actions">
              <button type="button" className="btn-cta" onClick={copy}>Copy</button>
              {isUrl && <a className="btn-text" href={result} target="_blank" rel="noreferrer noopener">Open link</a>}
              <span role="status" className="tool-status">{copied}</span>
            </div>
            {isUrl && <p className="tool-note">Check the address before you open it. Links in QR codes can lead anywhere.</p>}
          </div>
        )}
      </div>
      <p className="tool-note">Scanning happens on your device. Nothing you scan is sent to us.</p>
      <Cta text="Want to know how many people scan your own code? Make a dynamic code with scan statistics." />
    </>
  );
}

const PAGES: Record<string, { title: string; h1: string; intro: string; description: string; View: React.ComponentType }> = {
  'qr-scanner': { title: 'Free QR code scanner', h1: 'QR code scanner', intro: 'Point your camera at a QR code, or upload a photo of one. You see what is inside before anything opens.', description: 'Scan any QR code with your camera or from a photo. Free, no sign-in, and nothing leaves your device.', View: QrScanner },
  'utm-builder': { title: 'Free UTM link builder', h1: 'UTM link builder', intro: 'Add source, medium and campaign tags to a link so your analytics shows which flyer, post or poster brought the visit.', description: 'Free UTM link builder. Add utm_source, utm_medium and utm_campaign tags to any link and copy it.', View: UtmBuilder },
  'google-review-link': { title: 'Google review link generator', h1: 'Google review link maker', intro: 'Make a link that opens the review box for your business on Google. Put it on a receipt, a table tent or a QR code.', description: 'Free Google review link generator. Turn your Place ID into a direct link to the review box.', View: ReviewLink },
  'whatsapp-link': { title: 'Free WhatsApp link maker', h1: 'WhatsApp link maker', intro: 'Make a click-to-chat link that opens WhatsApp with your number and, if you like, a message already typed.', description: 'Free WhatsApp link generator. Create a wa.me click-to-chat link with a ready message.', View: WhatsappLink },
  'qr-generator': { title: 'Free QR code generator', h1: 'Free QR code generator', intro: 'Make a static QR code for a link or text, in your colours. Download it as PNG or SVG.', description: 'Free QR code generator. Make a static QR code for a link or text with your own colours and download PNG or SVG.', View: QrGenerator },
};

export default function Tools() {
  const { slug } = useParams();
  if (!slug) {
    return (
      <ToolsLayout title="Free QR code tools" description="Free QR code scanner, QR generator, UTM builder, Google review link and WhatsApp link tools. No sign-in needed.">
        <h1 className="hero-h1 tool-h1">Free tools</h1>
        <p className="tool-intro">Small tools for QR codes and links. No sign-in needed.</p>
        <div className="tool-cards">
          {TOOLS.map(t => (
            <Link key={t.slug} to={`/tools/${t.slug}`} className="tool-card">
              <strong>{t.name}</strong>
              <span>{t.desc}</span>
            </Link>
          ))}
        </div>
      </ToolsLayout>
    );
  }
  const p = PAGES[slug];
  if (!p) return <Navigate to="/tools" replace />;
  return (
    <ToolsLayout title={p.title} description={p.description}>
      <p className="tool-crumb"><Link to="/tools">Free tools</Link></p>
      <h1 className="hero-h1 tool-h1">{p.h1}</h1>
      <p className="tool-intro">{p.intro}</p>
      <div className="tool-box"><p.View /></div>
    </ToolsLayout>
  );
}
