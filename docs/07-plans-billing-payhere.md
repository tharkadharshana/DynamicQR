# 07 — Plans, Billing and PayHere

## Plan definitions and prices

[src/lib/plans.ts](../src/lib/plans.ts) is shared by the server and the SPA, and it is the **only** place prices live:

```ts
PRICES = {
  pro:  { USD: { monthly: 7,  annual: 70  }, LKR: { monthly: 2290, annual: 22900 } },
  team: { USD: { monthly: 29, annual: 290 }, LKR: { monthly: 9490, annual: 94900 } },
}
formatPrice('pro', 'LKR', 'monthly') // "LKR 2,290"
```

Annual = 10 × monthly, so 2 months are free. **PayHere charges LKR.** USD is reserved for Polar (Phase 1). The checkout, Pricing and Billing pages read `PRICES` and `formatPrice`. Landing still shows USD until its Phase 1 rewrite.

Limits by plan are in [doc 01](01-product-overview.md#plans-from-srclibplansts).

## License calculation: `getLicense(uid)` in [server.ts](../server.ts)

```
profile missing → free
isTrial     = is_trial && trial_expires_at > now
isExpired   = plan_expires_at && plan_expires_at < now
effective   = isExpired ? 'free' : profile.plan
limits      = (isTrial ? TRIAL_LIMITS : PLANS[effective]) + addons (Infinity → -1)
monthlyUsed = profiles.monthly_scans[YYYY-MM]        // account-wide
```

During a trial `effectivePlan` stays `'free'` while the limits are Pro's (with 3 QR codes). Code must check `limits.*`, not `plan === 'free'`. The CreateQR toggles still check the plan; that is fixed in Phase 1.

### Where limits are enforced

| Limit | Where |
|---|---|
| `qr_codes` | `POST /api/qr` (counts active codes) |
| `dynamic_qr`, `password_protect`, `expiry_gate`, `scan_limit_gate` | `POST /api/qr`; PUT for expiry, scan limit and password |
| `visitor_guard_gate` | Create and PUT force 5/3600 without it. `/internal/slug` resolves the limit for the Worker. |
| `monthly_scans` | `/internal/slug` → `quota_exceeded` (from the **account-wide** `monthlyUsed`), enforced by the Worker |
| `analytics_days` | timeseries `?days=` (a custom `start&end` range is still uncapped) |

## Checkout: `POST /api/billing/checkout`

Body: `{ plan: 'pro'|'team', interval: 'monthly'|'annual' }`. Both are required, otherwise 400.

1. Look up the amount in `PRICES[plan].LKR[interval]`, for example `"2290.00"`.
2. **Write a pending order:** `subscriptions { uid, plan, interval, order_id, amount, currency:'LKR', provider:'payhere', status:'pending' }`. This row is the **source of truth** at notify time.
3. Sign it: `hash = MD5(merchant_id + order_id + amount + 'LKR' + MD5(secret).upper).upper`.
4. Return the PayHere form fields:
   - `recurrence` = `1 Month` / `1 Year` and `duration` = `Forever`
   - `notify_url` = `{APP_URL}/api/billing/notify`
   - return goes to `/settings`, cancel goes to `/pricing`

The SPA posts a hidden form to `payhere.lk/pay/checkout` (sandbox when `PAYHERE_SANDBOX=true`).

## Webhook: `POST /api/billing/notify`

PayHere posts **form-urlencoded**, so this route has its own `express.urlencoded` parser.

1. Reject (401) unless `merchant_id === PAYHERE_MERCHANT_ID` and `md5sig` matches. The comparison uses `crypto.timingSafeEqual`.
2. Load the order by `order_id`. Unknown order → 400.
3. Reject (400) unless `payhere_amount` and `payhere_currency` equal the order's amount and currency.
4. **uid, plan and interval come from the order row.** `custom_1` and `custom_2` are ignored.
5. Branch:
   - `message_type` `RECURRING_STOPPED` / `RECURRING_COMPLETE`: mark the active row `cancelled`. **The plan is kept until `plan_expires_at`.**
   - `status_code 2` (success): requires `payment_id`, then calls `applyPayment(...)`.
   - `status_code -3` (chargeback): downgrade to free now, and mark the rows `chargeback`.
   - `status_code -1` / `-2` (cancelled or failed): mark the pending row `failed`.
6. Reply `OK`.

### `applyPayment()`: the only code that grants paid state

- It computes `expires_at = max(now, current expiry) + 1 or 12 months` from `interval`. Polar will pass its own `current_period_end` in Phase 1.
- The first payment of an order **claims the pending row** (`update … where payment_id is null`). A renewal **inserts a new row** with the new `payment_id`.
- **Idempotent through a DB constraint.** A unique index on `subscriptions(provider, payment_id)` rejects a replayed payment. The `23505` error is treated as "already applied", and the profile is not touched.
- It then updates `profiles { plan, plan_expires_at, plan_since, is_trial:false, payhere_order_id }`.

## Invoices: `GET /api/billing/invoices`

Up to 12 rows from `subscriptions` that are not `pending` or `failed`, newest first, with `date`, `currency` and `amount`.

## What QA covers (qa.ts section 22)

The QA signs payloads with the same merchant secret the server uses. CI uses dummy `qa-merchant` / `qa-secret` values. It checks:

- checkout → an LKR order at the Pro price
- a tampered `custom_2:'team'` still gives `pro`
- a payment ends the trial
- a monthly payment adds about 1 month
- a replayed `payment_id` does not extend the plan again
- a wrong amount, a wrong currency, an unknown order, or a success without `payment_id` → 400
- invoices are listed in LKR
- an annual payment adds 12 months on top of the current expiry
- `RECURRING_STOPPED` keeps the plan and the expiry
- a chargeback gives `free`

## Still open

- **PayHere field names for recurring installments** (`payment_id`, `message_type`) must be confirmed against the sandbox before relying on renewals. This is marked `ponytail:` in the code.
- **Polar (USD) and the LKR/USD switch** arrive in Phase 1, behind the payout-country check.
- **Add-ons were removed** (no UI, and the write path was broken). `profiles.addons` is still read by `getLicense` and is harmless.
- The trial UI gating (`plan === 'free'`) is fixed in Phase 1.
