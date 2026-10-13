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
| `/create`, `/edit/:id` | | CreateQR (guest-page codes redirect to the kit) |
| `/kit`, `/kit?edit=:slug` | | Restaurant Kit wizard |
| `/kit/print/:slug` | | A6 table tent print view |
| `/bulk` | | Bulk CSV create and print sheet (Team) |
| `/api-docs` | | REST API docs (shown in the nav on Team) |
| `/analytics` | | AccountAnalytics |
| `/analytics/:slug` | | Analytics (one or more codes) |
| `/billing`, `/pricing`, `/settings` | | Billing, Pricing, Settings |

Signed-in routes render inside [DynamicQRLayout](../src/components/DynamicQRLayout.tsx): sidebar, top bar, mobile drawer, the trial or lapse banner, and `<Outlet context={{ planData }} />`.

### Code splitting

Only `Landing` is imported eagerly. Every other page, and `DynamicQRLayout`, is a `React.lazy` chunk:

- `App` wraps `<Routes>` in `<Suspense>`, with the boot "Loading..." screen as the fallback.
- `DynamicQRLayout` wraps its `<Outlet>` in `<Suspense fallback={null}>`, so the sidebar stays on screen while the next page's chunk loads.
- `UIContext` lazy-loads `ConfirmationModal` and `ToastContainer`, which use `motion`, the first time a modal or toast is shown.

This keeps recharts, qr-code-styling and motion out of the landing page's entry chunk: 1.6 MB before, about 700 KB after. `scripts/check-bundle.mjs` fails CI if the entry grows past 800 KB. When you add a page, import it with `lazy()` in `App.tsx`. Don't import heavy libraries from `Landing.tsx` or `UIContext.tsx`.

Fonts (Fraunces and Instrument Sans) load from Google Fonts in [index.html](../index.html). They load as a non-blocking stylesheet (`media="print"` swapped to `all` on load) behind preconnect links, so they don't delay first paint.

## Shared modules

| Module | Purpose |
|---|---|
| [lib/api.ts](../src/lib/api.ts) | `apiFetch()`: Supabase token, JSON headers, throws `ApiError(message, status)` |
| [lib/plans.ts](../src/lib/plans.ts) | `PLANS`, `TRIAL_LIMITS`, `PRICES`, `formatPrice()`, `GRACE_DAYS`. Shared with server.ts. |
| [lib/qrContent.ts](../src/lib/qrContent.ts) | `getQRContent()` (what a code encodes), `vcardText()`, `stylingOptions()` (qr-code-styling options), `resizeLogo()`, `SHORT_DOMAIN` / `SHORT_HOST`. Shared with server.ts. |
| [lib/checkout.ts](../src/lib/checkout.ts) | `startCheckout(plan, interval, currency, planData)`: LKR → PayHere form post; USD → Polar card checkout when `planData.polar_enabled`, else PayHere in USD |
| [lib/guestPage.ts](../src/lib/guestPage.ts) | `renderGuestPage()` and `pickLang()`: the HTML, vCard or mailto a scan of a non-URL code returns. Shared by the Worker and the dev server. Has an assert self-check (`npx tsx src/lib/guestPage.ts`). |
| [lib/csv.ts](../src/lib/csv.ts) | `parseCsv()` / `csvToObjects()`: an RFC-4180 parser for bulk import (quotes, escaped quotes, newlines, BOM). Self-check: `npx tsx src/lib/csv.ts`. |
| [components/TeamSettings.tsx](../src/components/TeamSettings.tsx) | Settings → Team: API keys (create, shown once, revoke), members (invite, remove, seat count), custom domain (add, status, CNAME target, remove), report branding (agency name and logo) |
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

Accessibility: content between `<nav>` and `<footer>` sits in `<main>`. All text colors in `Landing.css` meet WCAG AA (4.5:1):

- `--ink3` and `--ink4` are dark enough for body text.
- `--coral-ink` (`#C2401F`) is used for coral text and for buttons with white labels.
- The brighter `--coral` (`#E85D3A`) is kept for decoration only: bars, borders, dots and the logo mark.

### Dashboard — [Dashboard.tsx](../src/pages/Dashboard.tsx)

A "Today's offer" card with one input per guest page ("Make live" PUTs `content_data`, so the change is live on the next scan), or a Restaurant Kit prompt when there is none. Then stat cards, a time series, the code table (thumbnail, status, View / Stats / Edit / Delete), device split, top countries, recent scans. There are no fake deltas or "live" labels: data loads when the page opens.

### CreateQR — [CreateQR.tsx](../src/pages/CreateQR.tsx)

Form cards (name and type, style, options, Visitor Guard) plus a live preview.

- Types, laid out like Hovercode's tabs: Link, PDF, WhatsApp, Google review, GS1, vCard, Page (the Restaurant Kit), and a **More ▾** menu with Instagram, Facebook, TikTok, YouTube, LinkedIn, X, phone, SMS, location, event, app store, Wi-Fi, text and email. URL-like types store `content_data.kind` and build `destination_url` with `buildDestination()`. Wi-Fi defaults to static so phones join directly.
- Design: dot style, corner square and corner dot styles, gradient, circle shape, logo, and a frame with a call to action that `framedSvg()` composes at download time. "Save as my default" stores `profiles.brand_style`, which prefills new codes.
- **Feature toggles are gated on plan limits** through `locked(feature)`, not on the plan name, so trial users get their Pro features.
- Downloads render at the chosen output size, then the preview returns to 180 px. Logos are resized on the device before saving.
- On a 403 (`LIMIT_QR_CODES`, `LIMIT_DYNAMIC_QR`, `FEATURE_*`) it shows a toast and goes to `/billing`.

### Restaurant Kit — [Kit.tsx](../src/pages/Kit.tsx) and [KitPrint.tsx](../src/pages/KitPrint.tsx)

The wizard has three steps:

1. The business: name, subtitle, brand colour.
2. Links: menu, Google review, WhatsApp number and message, phone, Wi-Fi, an extra button.
3. Today's offer and optional Sinhala and Tamil wording. Button labels are translated automatically.

`toContent()` turns the form into the guest page `content_data`, and stores the form under `kit` so it can be edited later. Create makes one dynamic `page` code and, when a Wi-Fi name is given, a static Wi-Fi code. It then opens the print view.

The print view lays out an A6 tent: the name, a trilingual "scan for menu" line, the styled QR at 250 px, the offer, the Wi-Fi QR and the short link. `@page { size: A6 }` with `window.print()` gives a PDF without any library. Opening it records `print_opened`.

### Analytics and AccountAnalytics

[Analytics.tsx](../src/pages/Analytics.tsx) (`/analytics/:slug`, multi-select) shows the summary, time series, a **busiest-hours** bar chart (UTC, all time), countries, devices (all time), browsers, OS and recent scans. **Download CSV** gives raw scans for one code (`events.csv`) or the daily series for several. **Print report** uses the browser's print, with print CSS hiding the app chrome. [AccountAnalytics.tsx](../src/pages/AccountAnalytics.tsx) shows account totals, the time series, per-code performance and countries. The always-empty referrer and "advanced" panels were removed in Phase 1.

### Billing — [Billing.tsx](../src/pages/Billing.tsx)

- current plan with honest limits
- **LKR · PayHere / USD · card** switch, plus a monthly/yearly switch
- an upgrade card that calls `startCheckout()`
- a comparison table with real limits
- invoices with currency
- "Manage card subscription" (Polar portal) when `polar_portal_url` is set

### Pricing — [Pricing.tsx](../src/pages/Pricing.tsx)

Three plan cards with real limits, a currency switch and an interval switch (both feed `startCheckout()`), and an FAQ covering the lapse rule, refunds, payment methods and "not a payment QR".

### Bulk create — [Bulk.tsx](../src/pages/Bulk.tsx)

Team only (`limits.bulk_create`). Takes a CSV with `title, destination_url, client`, from a file, paste, or the sample. It previews the rows, then creates each code through `POST /api/qr`, stopping at a plan cap. The print sheet is a grid of styled QRs with title and client, printed through the browser.

### Settings — [Settings.tsx](../src/pages/Settings.tsx)

Plan usage, profile, **weekly scan digest** toggle (`digestOptOut`), the **Team section** (`TeamSettings`), security (revoke sessions), danger zone (export, deactivate all, delete account). Members see a short note instead of the owner's Team controls. Printed Analytics reports show the agency's name and logo (white-label) when set.

### Legal pages

SaaS-specific [Terms](../src/pages/TermsConditions.tsx), [Privacy](../src/pages/PrivacyPolicy.tsx) and [Refunds](../src/pages/RefundPolicy.tsx), all on `LegalLayout`.

- The terms cover renewal, trial, the 30-day grace and pause rule, acceptable use, availability, data ownership, liability and Sri Lankan law.
- They read business details from `SITE`.
- **Have a lawyer review them before launch.**

## QR content and the short domain

Every QR image is built with `getQRContent()` and `stylingOptions()`. Dynamic codes encode `${activeDomain}/${slug}`: the account's **verified custom domain** (Team) when `/api/user/plan` returns one (`setShortDomain()` in App.tsx), otherwise `VITE_SHORT_DOMAIN`. Never `window.location.origin`. In-app slug labels use `shortHost()`; Landing uses the public `SHORT_HOST`. Codes printed earlier keep whatever domain they were printed with, and both domains keep resolving. `VITE_SHORT_DOMAIN` must never change after codes are printed.

## Removed in Phase 1

`ApiDocs.tsx` (documented an API that did not exist; comes back with the real API in Phase 4), `Layout.tsx`, `Login.tsx`, the referrer and advanced panels, the fake dashboard deltas and "Live" labels, and the AI Studio settings in `vite.config.ts`.
