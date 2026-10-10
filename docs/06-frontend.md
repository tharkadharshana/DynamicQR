# 06 — Frontend (React SPA)

Stack: React 19, React Router 7 (`BrowserRouter`), Vite 6, Recharts 3, `qr-code-styling` (create/edit preview and download), `qrcode` (thumbnails and the viewer modal), and lucide-react (a few icons). Styling is mostly the hand-written design system in [src/dynamicqr.css](../src/dynamicqr.css), which uses CSS variables and supports dark and light themes. [Landing.css](../src/pages/Landing.css) covers the marketing page. Tailwind 4 is loaded through [index.css](../src/index.css), and only Pricing and a few utility classes use it.

## Boot and auth gate — [App.tsx](../src/App.tsx)

1. [main.tsx](../src/main.tsx) unregisters any old service workers and renders `<App/>` in StrictMode.
2. `App` subscribes to `supabase.auth.onAuthStateChange`. On a session it sets `user` and fetches `/api/user/plan` into `planData`.
3. While `loading` is true, the app shows a full-screen "Loading…". An 8 s safety timeout ends the wait.
4. Route tree:

| Path | Signed out | Signed in |
|---|---|---|
| `/legal/privacy-policy`, `/legal/terms-and-conditions`, `/legal/refund-policy` | ✅ | ✅ |
| `/login` | Landing | redirect to `/` |
| `/` | redirect to `/login` | Dashboard |
| `/create` | | CreateQR |
| `/edit/:id` | | CreateQR (edit mode, `id` = slug) |
| `/analytics` | | AccountAnalytics |
| `/analytics/:slug` | | Analytics (single or multi-QR) |
| `/billing` | | Billing |
| `/pricing` | | Pricing (signed in only, so there is no public pricing page) |
| `/settings` | | Settings |
| `/api-docs` | | ApiDocs (static content) |
| `*` | `/login` | `/` |

Signed-in routes render inside [DynamicQRLayout](../src/components/DynamicQRLayout.tsx). It provides the sidebar, the top bar (theme toggle, "+ New QR"), a mobile drawer, the trial-ended / expired banner, and `<Outlet context={{ planData }} />`.

## Shared modules

| Module | Purpose |
|---|---|
| [lib/api.ts](../src/lib/api.ts) | `apiFetch()` gets the token from `supabase.auth.getSession()`, sets JSON and Bearer headers, and throws `ApiError(message, status)` on non-2xx responses. It also has `formatNumber`, `clampPct`. |
| [lib/plans.ts](../src/lib/plans.ts) | `PLANS`, `TRIAL_LIMITS`, `ADDONS`, `DEFAULT_ADDONS`. **Imported by both the SPA and server.ts.** |
| [supabase.ts](../src/supabase.ts) | Browser client (anon key, persisted session, auto refresh). Also `loginWithGoogle`, `logout`, `getCurrentUser`. |
| [shared/UIContext.tsx](../src/shared/UIContext.tsx) | `useUI()` gives `showModal({type:'alert'|'confirm'|'prompt', validationString…})`, `showToast(type,msg)` (5 s), `theme` / `toggleTheme` (stored in localStorage; toggles the `.light` class on `<html>`). |
| [lib/qrContent.ts](../src/lib/qrContent.ts) | `getQRContent(qr)`, `vcardText()`, `SHORT_DOMAIN` / `SHORT_HOST`. It defines what every QR encodes and is shared with server.ts. |
| [components/QRViewerModal.tsx](../src/components/QRViewerModal.tsx) | Modal with a 280 px preview, a 1024 px PNG download and copy link. Uses plain `qrcode`, so **dot style, corners and logo are lost** (fixed in Phase 1). |
| [components/ErrorBoundary.tsx](../src/components/ErrorBoundary.tsx) | Catches render errors and offers a reload |
| [components/ConfirmationModal.tsx](../src/components/ConfirmationModal.tsx), [ToastContainer.tsx](../src/components/ToastContainer.tsx) | Rendered by UIContext |

## Pages

### Landing — [Landing.tsx](../src/pages/Landing.tsx)

The marketing page, shown at `/login`. It has a hero, features, how-it-works, an analytics teaser, pricing, testimonials and a CTA. Every CTA calls `loginWithGoogle()`.

Copy to review before launch:

- "Loved by 10,000+ businesses" (the product has no paying customers).
- "city-level location" and the "Peak hours heatmap" (neither exists).

### Dashboard — [Dashboard.tsx](../src/pages/Dashboard.tsx)

Data comes from `GET /api/qr` (codes with stats), the account `devices`, `countries`, `recent` and `timeseries` endpoints, and `/api/user/plan`.

It shows:

- stat cards: total scans, unique visitors, active codes, plan usage
- a time-series sparkline (N days or a custom range)
- the QR table with 32 px thumbnails, status, View / Stats / Edit / Delete
- device split, top countries, recent scans

The "↑ 0% vs last month" figures are hard-coded. The data loads once and does not poll.

### CreateQR — [CreateQR.tsx](../src/pages/CreateQR.tsx)

The page has a form with four cards and a live preview on the right.

1. **Name and type**: URL, vCard, WiFi, Text, Email. Each type has its own fields.
2. **Style**: colours, dot style, corner style, logo, error correction, output size.
3. **Options**: Dynamic toggle, Password, Expiry (`datetime-local`), Scan limit.
4. **Visitor Guard**: scans per visitor and time window (60 s, 1 h, 24 h, 7 d).

Behaviour:

- Only URL codes can be dynamic. Any other type forces static and disables the toggle; the server enforces the same rule. Dynamic is on by default for URL.
- The PRO feature toggles are blocked when `planData.plan === 'free'`. During a trial `plan` is still `'free'`, so **trial users see Pro features as locked even though the backend allows them**. The UI should check `planData.limits.*` instead.
- Submit sends `POST /api/qr` or `PUT /api/qr/:id` with the whole `formData`. On 403 it shows a toast and goes to `/billing`.
- The preview uses `qr-code-styling` at 180×180 px. Downloads use the same instance, so **every PNG/SVG is 180 px** whatever "Output size" says. "Print PDF" downloads a PNG.
- The logo is read as a data URL (≤1 MB allowed). The API rejects JSON bodies over 100 KB, so medium logos fail with "Failed to save QR code".

### Analytics (one or more QRs) — [Analytics.tsx](../src/pages/Analytics.tsx)

Route `/analytics/:slug`. A multi-select switches between:

- the per-QR endpoints (`/api/analytics/:slug/*`), for exactly one code
- the account endpoints with `?slugs=` (several codes)

Sections: summary, time series (default days = plan `analytics_days`), countries, devices (pie), referrers (always empty), browsers, OS, recent scans, and the "advanced" block (always empty). The QR viewer modal is available here.

### AccountAnalytics — [AccountAnalytics.tsx](../src/pages/AccountAnalytics.tsx)

Route `/analytics`. Shows account totals, the time series, a per-QR performance table that links to `/analytics/:slug`, and top countries.

### Billing — [Billing.tsx](../src/pages/Billing.tsx)

Shows the current plan card, usage bars (monthly scans and QR codes), a monthly/annual toggle, upgrade cards that start the PayHere checkout, the invoice list, and the payment-method note.

Prices are in **LKR** through `formatPrice()`, because PayHere charges LKR. "Next billing" reads the ISO `plan_expires_at`. Invoices show `currency amount`.

### Pricing — [Pricing.tsx](../src/pages/Pricing.tsx)

Three plan cards, an FAQ and legal links (kept for the PayHere merchant review).

The upgrade button sends `{plan, interval:'monthly'}`. Before Phase 0 it left out `interval`, so the server always answered 400. Prices come from `formatPrice(…,'LKR',…)`.

Known issue: it advertises features that do not exist (workspaces, white-label, bulk generation, custom domain). They are removed in Phase 1.

### Settings — [Settings.tsx](../src/pages/Settings.tsx)

Sections: Plan usage, Quick links, Profile (the name is saved to Supabase `user_metadata.full_name`; the other fields go to `/api/user/profile`), Security (a note that Google handles passwords and 2FA, plus Revoke all sessions), Notifications (commented out), and Danger zone (Export data, Deactivate all, Delete account; deleting needs you to type `DELETE`).

### ApiDocs — [ApiDocs.tsx](../src/pages/ApiDocs.tsx)

Static documentation for `/api/v1` with `sk_live_` keys, webhooks and HMAC signatures. **No backend exists for any of it.** Hide the page, or label it "coming soon", until the backend is built.

### Legal pages

[PrivacyPolicy](../src/pages/PrivacyPolicy.tsx), [TermsConditions](../src/pages/TermsConditions.tsx) and [RefundPolicy](../src/pages/RefundPolicy.tsx) are static and public. The business assessment says this copy is generic. Review it before taking payments.

## QR content and the short domain

Every QR image (CreateQR preview and download, Dashboard thumbnails, the viewer modal) is built with `getQRContent()` from [lib/qrContent.ts](../src/lib/qrContent.ts). Dynamic codes encode `${VITE_SHORT_DOMAIN}/${slug}` (default `https://scnr.tharkak.com`), **never `window.location.origin`**.

Before Phase 0 the encoded host depended on where the dashboard was open. A code made on `*.vercel.app` or `localhost` skipped the Worker, and its scanners landed on `/login`. Slug labels in the UI use `SHORT_HOST`. `VITE_SHORT_DOMAIN` must never change after codes are printed.

## Dead frontend code

- [components/Layout.tsx](../src/components/Layout.tsx): the old "qik.app" sidebar, not imported.
- [pages/Login.tsx](../src/pages/Login.tsx): not routed. Landing replaced it.
- The `legalItems` nav in DynamicQRLayout is commented out.
- `vite.config.ts` defines `process.env.GEMINI_API_KEY`, which is unused.
- `Analytics.tsx` mounted with no slug is unreachable: `/analytics` renders AccountAnalytics.

## Repeated code to merge later

- `supabase.auth.getSession()` to get `userId` is repeated in every page. The uid is already in App's `user`.
- `/api/user/plan` is fetched by App, CreateQR, Dashboard and Pricing. Use the Outlet `planData` instead.
