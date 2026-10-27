# PDP order safety net — design

Date: 2026-10-21 · Tenant: scheniders-iraq · Branch: feat/pdp-entry-atelier (local until merchant sign-off)
Status: approved by merchant ("Approve, build it"), WhatsApp wiring change explicitly approved ("Yes, connect it").

## Why

The biggest loss on this store happens after «ثبّت طلبي», not before it. On the Lightfunnels (LF) funnel
that the new storefront replaces: 15% of orders end `no_response`, 11% `rejected`, 8% `cancelled`; ~34
orders were cancelled as duplicates. LF orders that got the instant WhatsApp confirmation ended
`no_response` 14.6% of the time vs 28.9% without (correlational). Storefront orders today get **no**
WhatsApp, have **no** submit timeout or retry, lose the typed form on reload, never capture a half-filled
phone, and the thank-you page does not say who will call.

Success measure: on storefront orders, `no_response` rate and duplicate cancellations at or below the
LF baseline (no_response ~15–29%, duplicates ~34 / 180d).

## Scope (build order)

0. Bring the branch up to date with origin/main (merge; main changed checkout.ts replay handling,
   order_confirmation, order_tracker, pdp_direct_order stash, post_purchase_offer).
1. Instant WhatsApp confirmation for storefront orders.
2. Never-lose-the-buyer submit (classic and express PDP layouts).
3. Half-filled phone capture with consent (reminder OFF until template + wording approved).
4. "Who contacts you" line under the submit button (structured contact config).
5. Thank-you call card on the checkout_success page.

Out of scope: rebuilding the 6h reminder / 10h discount scheduler (dead since commit b44eaf52,
2026-03-07); the struck-price question (merchant decided to keep it); LF pipeline changes.

## Constraints

- Never change the checkout request body contract (`/api/checkout/orders`), the COD field flow, or the
  422 `new_price` self-heal. `create_order_atomic` and its idempotency semantics stay as they are.
- LF behaviour must be byte-for-byte unchanged: `lightfunnels/route.ts`, `webhook-handler.ts`,
  `whatsapp-dispatcher.ts` (reused unchanged), the LF checkout queue, `pending_checkout` semantics.
- `interakt.ts` changes only where agreed below, with tests for both LF and storefront orders.
- Multi-tenant: tenant always resolved server-side; never trust a client tenant id for new writes.
  New tables/columns RLS + tenant-scoped. Service-role and Interakt/QStash secrets stay server-only.
- Zero hardcoding (tokens/i18n), LTR document, Arabic-first, sections back-compat (new schema fields
  optional + `.catch`; classic markup byte-identical unless the change is opt-in).
- Local only until the merchant says push. DB migrations may be applied (additive only).

## 1. Instant WhatsApp confirmation

Flow: `submitCheckout` (storefront) → after a successful, **non-replay**, **non-draft-view**, **non-test**
insert → publish `{ order_id }` to QStash → new platform endpoint `POST /api/webhooks/storefront-order`
(QStash signature verified with the existing Receiver pattern) → loads the order with the service role,
takes the tenant **from the row**, requires `source = 'storefront'`, `is_test = false`, `status = 'new'`,
tenant listed in the platform env `STOREFRONT_WA_CONFIRM_TENANT_IDS` (comma-separated uuids; Interakt is one global sender, so only tenants whose customers expect messages from that number may be listed — scheniders-iraq first) → claims the send atomically
(conditional UPDATE on a new nullable `orders.confirmation_dispatched_at` column, `WHERE … IS NULL`) →
calls `triggerImmediateConfirmation(order.id, order.phone)` unchanged (which already gates on
`whatsapp_auto_send`, mirrors to `secondary_phone`, sets `contacted`, logs) → then
`sendNewOrderAlertToStaff` exactly as the LF route does.

- `submitCheckout` must expose `idempotent_replay` from the RPC so a replay never re-publishes.
- Template variable `{{7}}` (total) must be what the courier collects:
  `price - coalesce(discount_amount,0) + coalesce(delivery_fee,0)`. Implement in `interakt.ts` so LF rows
  (which carry zero discount/delivery) produce the identical value; tests cover both sources.
- If QStash publish fails, log with the order id (no silent catch) and mark the order
  `needs_attention` via the existing attention-reason helper so staff confirm manually.
- Env: `QSTASH_TOKEN` + platform endpoint URL added to the storefront project and declared in
  `turbo.json` build env (server-only, never `NEXT_PUBLIC_`).

## 2. Never-lose-the-buyer submit

Client (shared onSubmit in `pdp_direct_order.client.tsx`, so both layouts):
- `AbortController` timeout (~20s). On timeout or network error keep the idempotency key, show
  «نتأكد من طلبك…», and resubmit once with the **same key** (a same-key replay returns the existing
  order — on main the replay is answered before validation). Then show a clear failure with
  «ابعث نفس الطلب بالواتساب» (prefilled with the order details) as the fallback.
- Persist the idempotency key and the typed form per product in `sessionStorage`; restore on reload;
  clear on success. Correct the misleading "nothing was submitted" catch comment.
- Submit button `disabled` while submitting (keeps aria-busy).
Server:
- Transient DB/network failures return 5xx (or `retryable: true`), not 422.
- Skip the experiment-event insert on a replay.
- Soft duplicate guard: same tenant + normalized phone + same product within 10 minutes → return the
  existing order as a replay (no new row); the client shows «طلبك واصلنا، لا تطلبه مرة ثانية».
  A different product or after 10 minutes is a normal new order.

Known limitation (accepted): after an unconfirmed submit the key is kept in the draft on purpose,
so it outlives the form. If the shopper then edits quantity, variant or address and taps again
(or reloads and taps), the server replays the ORIGINAL order for that key and the page treats it as
success for the edited one. Retiring the key on edit would instead risk a second order when the
first did land. The WhatsApp confirmation (§1), queued when the original order was created, shows
what was actually placed.

## 3. Half-filled phone capture

- Harden `/api/cart/abandoned`: tenant resolved server-side (never from the body), per-IP + per-phone
  rate limit, `consent_at` + `consent_text_version` columns (additive migration), normalized phone.
- PDP (classic + express): once the phone validates, debounce a capture beacon with the product line,
  only if the consent line is shown. Consent line under the phone field (merchant-editable i18n prop,
  default «ممكن نراسلك واتساب بخصوص طلبك»).
- Surface captured rows in the platform orders «متروكة» worklist through a tenant-scoped read path
  (view/union), without changing `pending_checkout` semantics.
- A real order marks matching captures recovered; split "recovered after reminder" vs organic.
- Automatic reminder stays OFF (no sends) until the merchant approves wording + the Interakt template.

## 4. "Who contacts you" line

- New optional structured config (V2 `globals.contact` or `commerce.contact`): `call_number`,
  `call_hours` (days + from/to, timezone Asia/Baghdad). One shared resolver returns the line.
- Without hours: «راح توصلك رسالة واتساب لتأكيد طلبك، وبعدها اتصال من {number} — رد علينا ويطلع طلبك».
- With hours: "today" vs "tomorrow morning" variants computed from the order moment; never invents
  minutes. Rendered under the submit in both layouts (opt-in prop), and reused on the thank-you card.

## 5. Thank-you call card

On `order_confirmation` (opt-in prop, on top of main's version): «تم يا {first name}، طلبك ثابت», order
number, «رسالة واتساب وصلتك هسه — اضغط تأكيد» (only when step 1 is enabled for the tenant), the call
number with copy + save-to-contacts (vCard), the masked phone the buyer typed with «الرقم غلط؟ راسلنا»,
and «أضف رقم ثاني» when no backup was given (written through a tenant-scoped endpoint authorised by a
signed per-order token, following main's `upsell_token` pattern). Upsell / referral / new arrivals render
below the card (reordered, not removed).

## Testing

- Unit: dispatch gating (replay, draft, test, wrong source, double claim), `{{7}}` for LF and storefront
  rows, duplicate guard window, contact-line resolver (with/without hours, day/night), capture tenant
  resolution + rate limit, sessionStorage restore/clear, timeout → same-key resubmit.
- Snapshot: classic PDP and chrome baselines unchanged; order_confirmation default unchanged.
- Live (local, draft view): a test order is flagged is_test and sends nothing; a dev-only dry-run of the
  platform endpoint proves the claim + dispatch path without contacting Interakt.
