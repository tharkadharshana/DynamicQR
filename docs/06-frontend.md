# 06 — Frontend (React SPA)

Stack: React 19, React Router 7 (`BrowserRouter`), Vite 6, Recharts 3, `qr-code-styling` (every rendered QR), `qrcode` (small thumbnails and the Landing preview), and lucide-react. Styling is mostly the hand-written design system in [src/dynamicqr.css](../src/dynamicqr.css), which supports dark and light themes. [Landing.css](../src/pages/Landing.css) covers the marketing and legal pages. Tailwind 4 (loaded through [index.css](../src/index.css)) is used by Pricing.

## Boot and auth gate — [App.tsx](../src/App.tsx)

1. [main.tsx](../src/main.tsx) unregisters old service workers and renders `<App/>`.
2. `App` subscribes to `supabase.auth.onAuthStateChange`. With a session it fetches `/api/user/plan` into `planData`.
3. Routes:

| Path | Signed out | Signed in |
|---|---|---|
| `/legal/privacy-policy`, `/legal/terms-and-conditions`, `/legal/refund-policy` | ✅ | ✅ |
| `/login` | Landing | redirect to `/` |
| `/` | redirect to `/login` | Dashboard |
| `/create`, `/edit/:id` | | CreateQR |
| `/analytics` | | AccountAnalytics |
| `/analytics/:slug` | | Analytics (one or more codes) |
| `/billing`, `/pricing`, `/settings` | | Billing, Pricing, Settings |

Signed-in routes render inside [DynamicQRLayout](../src/components/DynamicQRLayout.tsx): sidebar, top bar, mobile drawer, the trial or lapse banner, and `<Outlet context={{ planData }} />`.

## Shared modules

| Module | Purpose |
|---|---|
| [lib/api.ts](../src/lib/api.ts) | `apiFetch()`: Supabase token, JSON headers, throws `ApiError(message, status)` |
| [lib/plans.ts](../src/lib/plans.ts) | `PLANS`, `TRIAL_LIMITS`, `PRICES`, `formatPrice()`, `GRACE_DAYS`. Shared with server.ts. |
| [lib/qrContent.ts](../src/lib/qrContent.ts) | `getQRContent()` (what a code encodes), `vcardText()`, `stylingOptions()` (qr-code-styling options), `resizeLogo()`, `SHORT_DOMAIN` / `SHORT_HOST`. Shared with server.ts. |
| [lib/checkout.ts](../src/lib/checkout.ts) | `startCheckout(plan, interval, currency, planData)`: LKR → PayHere form post; USD → Polar card checkout when `planData.polar_enabled`, else PayHere in USD |
| [lib/site.ts](../src/lib/site.ts) | `SITE` (legal name, location, support email, WhatsApp, hours, status URL, demo slug, founder) from `VITE_*` env, and `waLink(phone, text)` |
| [supabase.ts](../src/supabase.ts) | Browser client, `loginWithGoogle`, `logout` |
| [shared/UIContext.tsx](../src/shared/UIContext.tsx) | `useUI()`: modals, toasts, theme |
| [components/QRViewerModal.tsx](../src/components/QRViewerModal.tsx) | Styled preview (same renderer as the editor), 1200 px PNG download, copy link |
| [components/LegalLayout.tsx](../src/components/LegalLayout.tsx) | Shell and `Section` for the three legal pages |

## Pages

### Landing — [Landing.tsx](../src/pages/Landing.tsx)

Shown at `/login`. It contains only claims that are true:

- the hero is aimed at Sri Lankan businesses
- a live static-QR preview of the visitor's own link
- a trust strip: Built in {location}, WhatsApp support, status page, and "not a LANKAQR payment replacement"
- six features that exist
- the live demo QR (when `VITE_DEMO_SLUG` is set) or a setup offer, with "Book setup on WhatsApp" when `VITE_SUPPORT_WHATSAPP` is set
- LKR/USD pricing from `formatPrice()`, defaulting to LKR when the browser's time zone is Asia/Colombo

The fake logos, customer counts, testimonials, city and heatmap claims, and ticking counters were removed in Phase 1.

### Dashboard — [Dashboard.tsx](../src/pages/Dashboard.tsx)

Stat cards, a time series, the code table (thumbnail, status, View / Stats / Edit / Delete), device split, top countries, recent scans. There are no fake deltas or "live" labels: data loads when the page opens.

### CreateQR — [CreateQR.tsx](../src/pages/CreateQR.tsx)

Form cards (name and type, style, options, Visitor Guard) plus a live preview.

- Only URL codes can be dynamic; other types force static.
- **Feature toggles are gated on plan limits** through `locked(feature)`, not on the plan name, so trial users get their Pro features.
- Downloads render at the chosen output size, then the preview returns to 180 px. Logos are resized on the device before saving.
- On a 403 (`LIMIT_QR_CODES`, `LIMIT_DYNAMIC_QR`, `FEATURE_*`) it shows a toast and goes to `/billing`.

### Analytics and AccountAnalytics

[Analytics.tsx](../src/pages/Analytics.tsx) (`/analytics/:slug`, multi-select) shows the summary, time series, countries, devices (labelled "all time"), browsers, OS and recent scans. [AccountAnalytics.tsx](../src/pages/AccountAnalytics.tsx) shows account totals, the time series, per-code performance and countries. The always-empty referrer and "advanced" panels were removed in Phase 1.

### Billing — [Billing.tsx](../src/pages/Billing.tsx)

- current plan with honest limits
- **LKR · PayHere / USD · card** switch, plus a monthly/yearly switch
- an upgrade card that calls `startCheckout()`
- a comparison table with real limits
- invoices with currency
- "Manage card subscription" (Polar portal) when `polar_portal_url` is set

### Pricing — [Pricing.tsx](../src/pages/Pricing.tsx)

Three plan cards with real limits, a currency switch and an interval switch (both feed `startCheckout()`), and an FAQ covering the lapse rule, refunds, payment methods and "not a payment QR".

### Settings — [Settings.tsx](../src/pages/Settings.tsx)

Plan usage, profile, security (revoke sessions), danger zone (export, deactivate all, delete account).

### Legal pages

SaaS-specific [Terms](../src/pages/TermsConditions.tsx), [Privacy](../src/pages/PrivacyPolicy.tsx) and [Refunds](../src/pages/RefundPolicy.tsx), all on `LegalLayout`.

- The terms cover renewal, trial, the 30-day grace and pause rule, acceptable use, availability, data ownership, liability and Sri Lankan law.
- They read business details from `SITE`.
- **Have a lawyer review them before launch.**

## QR content and the short domain

Every QR image is built with `getQRContent()` and `stylingOptions()`. Dynamic codes encode `${VITE_SHORT_DOMAIN}/${slug}`, never `window.location.origin`. Slug labels use `SHORT_HOST`. `VITE_SHORT_DOMAIN` must never change after codes are printed.

## Removed in Phase 1

`ApiDocs.tsx` (documented an API that did not exist; comes back with the real API in Phase 4), `Layout.tsx`, `Login.tsx`, the referrer and advanced panels, the fake dashboard deltas and "Live" labels, and the AI Studio settings in `vite.config.ts`.
