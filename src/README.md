# src/

The React 19 + Vite single-page app.

- `main.tsx`, `App.tsx`: entry point, router and auth gate.
- `pages/`: one file per screen (Landing, Dashboard, CreateQR, Pages, Forms, Analytics, Billing, Pricing, Settings, public tools, legal).
- `components/`: app shell, modals, toasts, switchers, footer hub.
- `lib/`: pure modules. **The API (`server/`) and the Cloudflare Worker (`worker/`) import some of these too** (`plans`, `qrContent`, `guestPage`, `routing`, `forms`, `webhooks`), so they must not touch the DOM or browser-only APIs, and anything the server imports needs `.js` on relative imports.
- `supabase.ts`: browser Supabase client (Google sign-in).
- `shared/`: small React contexts.

Env: only `VITE_*` variables reach the browser. Never put a secret in one. Details: [docs/06-frontend.md](../docs/06-frontend.md).
