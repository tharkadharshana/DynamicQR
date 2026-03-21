<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/073b7ca7-716e-4c83-bcff-6507fde83c73

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`





<svg width="100%" viewBox="0 0 680 620" xmlns="http://www.w3.org/2000/svg" style="background:#1a1d24;font-family:'Instrument Sans',system-ui,sans-serif">
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </marker>
  <!-- Color ramps -->
  <style>
    .th { font-size:14px; font-weight:600; fill:#ECEAE3; }
    .ts { font-size:12px; font-weight:400; fill:#9B9A93; }

    .c-gray rect  { fill:#21252F; stroke:rgba(255,255,255,0.12); }
    .c-gray .th   { fill:#ECEAE3; }
    .c-gray .ts   { fill:#9B9A93; }

    .c-amber rect { fill:rgba(240,160,48,0.12); stroke:rgba(240,160,48,0.3); }
    .c-amber .th  { fill:#F0A030; }
    .c-amber .ts  { fill:#BA7517; }

    .c-blue rect  { fill:rgba(77,158,255,0.12); stroke:rgba(77,158,255,0.3); }
    .c-blue .th   { fill:#4D9EFF; }
    .c-blue .ts   { fill:#185FA5; }

    .c-red rect   { fill:rgba(255,87,87,0.12); stroke:rgba(255,87,87,0.3); }
    .c-red .th    { fill:#FF5757; }
    .c-red .ts    { fill:#A32D2D; }

    .c-teal rect  { fill:rgba(29,158,117,0.12); stroke:rgba(29,158,117,0.3); }
    .c-teal .th   { fill:#3DCC7E; }
    .c-teal .ts   { fill:#0F6E56; }

    .c-green rect { fill:rgba(61,204,126,0.12); stroke:rgba(61,204,126,0.3); }
    .c-green .th  { fill:#3DCC7E; }
    .c-green .ts  { fill:#27500A; }

    .arr { stroke:rgba(255,255,255,0.25); stroke-width:1.5; fill:none; }
  </style>
</defs>

<!-- Phone -->
<g class="c-gray">
  <rect x="40" y="30" width="130" height="44" rx="8" stroke-width="0.5"/>
  <text class="th" x="105" y="47" text-anchor="middle" dominant-baseline="central">User scans QR</text>
  <text class="ts" x="105" y="65" text-anchor="middle" dominant-baseline="central">camera app</text>
</g>

<line x1="170" y1="52" x2="210" y2="52" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>
<text class="ts" x="190" y="44" text-anchor="middle">HTTP GET</text>

<!-- Cloudflare Worker outer box -->
<g class="c-amber">
  <rect x="210" y="20" width="220" height="520" rx="12" stroke-width="0.5"/>
  <text class="th" x="320" y="46" text-anchor="middle" dominant-baseline="central">Cloudflare Worker</text>
  <text class="ts" x="320" y="62" text-anchor="middle" dominant-baseline="central">scnr.app/x9Km4p</text>
</g>

<!-- Step 1 -->
<g class="c-gray">
  <rect x="224" y="78" width="192" height="40" rx="6" stroke-width="0.5"/>
  <text class="th" x="320" y="93" text-anchor="middle" dominant-baseline="central">1. slug validation</text>
  <text class="ts" x="320" y="108" text-anchor="middle" dominant-baseline="central">regex + length check</text>
</g>
<line x1="320" y1="118" x2="320" y2="138" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>

<!-- Step 2 -->
<g class="c-gray">
  <rect x="224" y="138" width="192" height="40" rx="6" stroke-width="0.5"/>
  <text class="th" x="320" y="153" text-anchor="middle" dominant-baseline="central">2. KV cache lookup</text>
  <text class="ts" x="320" y="168" text-anchor="middle" dominant-baseline="central">qr_config:{slug}</text>
</g>
<line x1="320" y1="178" x2="320" y2="198" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>

<!-- Step 3 -->
<g class="c-gray">
  <rect x="224" y="198" width="192" height="52" rx="6" stroke-width="0.5"/>
  <text class="th" x="320" y="216" text-anchor="middle" dominant-baseline="central">3. gate checks</text>
  <text class="ts" x="320" y="232" text-anchor="middle" dominant-baseline="central">inactive? expired?</text>
  <text class="ts" x="320" y="244" text-anchor="middle" dominant-baseline="central">scan_limit hit? password?</text>
</g>
<line x1="320" y1="250" x2="320" y2="270" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>

<!-- Step 4 -->
<g class="c-gray">
  <rect x="224" y="270" width="192" height="40" rx="6" stroke-width="0.5"/>
  <text class="th" x="320" y="285" text-anchor="middle" dominant-baseline="central">4. fire analytics</text>
  <text class="ts" x="320" y="300" text-anchor="middle" dominant-baseline="central">ctx.waitUntil() — async</text>
</g>
<line x1="320" y1="310" x2="320" y2="330" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>

<!-- Step 5 -->
<g class="c-gray">
  <rect x="224" y="330" width="192" height="40" rx="6" stroke-width="0.5"/>
  <text class="th" x="320" y="345" text-anchor="middle" dominant-baseline="central">5. increment counters</text>
  <text class="ts" x="320" y="360" text-anchor="middle" dominant-baseline="central">scan_count in KV</text>
</g>
<line x1="320" y1="370" x2="320" y2="390" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>

<!-- Step 6 -->
<g class="c-teal">
  <rect x="224" y="390" width="192" height="40" rx="6" stroke-width="0.5"/>
  <text class="th" x="320" y="405" text-anchor="middle" dominant-baseline="central">6. 302 redirect</text>
  <text class="ts" x="320" y="420" text-anchor="middle" dominant-baseline="central">to destination_url</text>
</g>

<!-- KV miss → Firestore -->
<line x1="430" y1="158" x2="490" y2="158" stroke="#EF9F27" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>
<text class="ts" x="460" y="150" text-anchor="middle" fill="#EF9F27">KV miss</text>
<g class="c-blue">
  <rect x="490" y="130" width="150" height="56" rx="8" stroke-width="0.5"/>
  <text class="th" x="565" y="152" text-anchor="middle" dominant-baseline="central">Firestore</text>
  <text class="ts" x="565" y="170" text-anchor="middle" dominant-baseline="central">fetch + cache 300s</text>
</g>

<!-- Gate fail → Error page -->
<line x1="430" y1="224" x2="490" y2="224" stroke="#FF5757" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>
<text class="ts" x="460" y="216" text-anchor="middle" fill="#FF5757">gate fail</text>
<g class="c-red">
  <rect x="490" y="196" width="150" height="56" rx="8" stroke-width="0.5"/>
  <text class="th" x="565" y="218" text-anchor="middle" dominant-baseline="central">Error page</text>
  <text class="ts" x="565" y="236" text-anchor="middle" dominant-baseline="central">410 / PIN prompt</text>
</g>

<!-- Analytics → Cloud Run -->
<line x1="430" y1="290" x2="490" y2="290" stroke="#3DCC7E" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>
<text class="ts" x="460" y="282" text-anchor="middle" fill="#3DCC7E">async POST</text>
<g class="c-teal">
  <rect x="490" y="262" width="150" height="56" rx="8" stroke-width="0.5"/>
  <text class="th" x="565" y="284" text-anchor="middle" dominant-baseline="central">Cloud Run API</text>
  <text class="ts" x="565" y="302" text-anchor="middle" dominant-baseline="central">write to Firestore</text>
</g>

<!-- Redirect → Destination -->
<line x1="430" y1="410" x2="490" y2="410" stroke="#3DCC7E" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>
<g class="c-green">
  <rect x="490" y="382" width="150" height="56" rx="8" stroke-width="0.5"/>
  <text class="th" x="565" y="404" text-anchor="middle" dominant-baseline="central">Destination URL</text>
  <text class="ts" x="565" y="422" text-anchor="middle" dominant-baseline="central">user arrives ~50ms</text>
</g>

<!-- Timing note -->
<text class="ts" x="320" y="460" text-anchor="middle" fill="#9B9A93">Total time: ~10–50ms for user</text>
<text class="ts" x="320" y="478" text-anchor="middle" fill="#9B9A93">Analytics fires after redirect</text>

<!-- Legend -->
<text class="ts" x="224" y="506" fill="#9B9A93">Legend:</text>
<line x1="224" y1="520" x2="254" y2="520" stroke="#EF9F27" stroke-width="1.5"/>
<text class="ts" x="260" y="524" fill="#9B9A93">KV cache path</text>
<line x1="224" y1="538" x2="254" y2="538" stroke="#FF5757" stroke-width="1.5"/>
<text class="ts" x="260" y="542" fill="#9B9A93">gate blocked</text>
<line x1="350" y1="520" x2="380" y2="520" stroke="#3DCC7E" stroke-width="1.5"/>
<text class="ts" x="386" y="524" fill="#9B9A93">success path</text>
</svg>