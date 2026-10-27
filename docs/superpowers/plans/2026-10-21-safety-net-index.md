# PDP order safety net — plan index

**Spec:** docs/superpowers/specs/2026-10-21-pdp-order-safety-net-design.md
**Branch:** `feat/pdp-entry-atelier` (origin/main merged in 6ee1df5b)

**Build order is strict: P1 → P2 → P3 → P4 → P5.** Each piece starts after the one before it is committed, and each piece's preconditions check for that. Later pieces edit files that earlier pieces already changed: `checkout.ts`, `pdp_direct_order.client.tsx`, `pdp_direct_order.tsx`, `pdp_express/model.ts`, `pdp_express/checkout-row.tsx`, `fake-supabase.ts` and `database.types.ts`. Their line numbers were read before the earlier pieces landed. Every edit quotes its anchor text, so match on the text, not the line number.

| # | Plan | Goal | Tasks | Migration | Env vars | Merchant-gated |
|---|---|---|---|---|---|---|
| P1 | [p1-whatsapp-confirmation](2026-10-21-safety-net-p1-whatsapp-confirmation.md) | A storefront order gets the same instant `cod_order_confirm` WhatsApp an LF order gets. The storefront queues the order id through QStash to a new platform endpoint, which re-reads the row and applies every gate. `{{7}}` shows what the courier collects. | 8 (P1.1–P1.8) | `20261021130000_orders_confirmation_dispatched_at.sql` (`orders.confirmation_dispatched_at`) | Platform: `STOREFRONT_WA_CONFIRM_TENANT_IDS`. Storefront: `QSTASH_TOKEN`, `QSTASH_URL`, `STOREFRONT_ORDER_WEBHOOK_URL`. All server-only, all in `turbo.json` build.env. | P1.8 Step 5 rollout (Vercel env plus the tenant allowlist) waits for the merchant's "push". The Al-Waseet COD over-collect on discounted storefront orders needs a merchant decision before the first discounted order ships. |
| P2 | [p2-safe-submit](2026-10-21-safety-net-p2-safe-submit.md) | A submit is never lost or doubled. It covers a 20s deadline plus one same-key resend, a sessionStorage draft, a WhatsApp fallback when the order is unconfirmed, a 10-minute soft duplicate guard («طلبك واصلنا») and 503 + `retryable` for transient DB errors. Both PDP layouts and `checkout_form` get it. | 11 (P2.0–P2.10) | `20261021142000_create_storefront_order_duplicate_guard.sql` (new `create_storefront_order` wrapper; `create_order_atomic` unchanged) | none | Nothing is pushed until the merchant says so (P2.10). The P2.1 Step 5 live probe always rolls back. |
| P3 | [p3-half-filled-capture](2026-10-21-safety-net-p3-half-filled-capture.md) | A phone the buyer typed is kept only behind a merchant-shown consent line. The tenant comes from the host, both IP and phone are rate-limited, and the capture shows in the «متروكة» tab. Recovery is split into after-reminder and organic, and the reminder sweep can never message a capture without consent. | 10 (P3.1–P3.10) | `20261021160000_abandoned_carts_consent_and_recovery_kind.sql` (`consent_at`, `consent_text_version`, generated `recovery_kind`) | none new (reuses the existing `NEXT_PUBLIC_ROOT_DOMAIN` / `NEXT_PUBLIC_DEV_ROOT_DOMAIN`) | The reminder stays OFF. Turning it on needs approved wording, an approved Interakt `abandoned_cart_recovery` template and `commerce.cart_recovery.enabled` (P3.10 Step 6). Turning on `show_capture_consent` per store is the merchant's choice. |
| P4 | [p4-contact-line](2026-10-21-safety-net-p4-contact-line.md) | A "who contacts you" line under the order button, from structured `commerce.contact` (call number, optional hours, `whatsapp_confirm`). One shared resolver feeds it, and `resolveTrackerContact` now prefers the same `call_number`. | 4 (P4.1–P4.4) | none (jsonb config key only) | none | P4.4 writes the scheniders-iraq **draft** only. Publishing needs merchant sign-off **and** P1 live for the tenant (otherwise write `whatsapp_confirm: false`). Real call hours are an open merchant question. |
| P5 | [p5-thank-you-call-card](2026-10-21-safety-net-p5-thank-you-call-card.md) | An opt-in call card on `order_confirmation`. It shows the greeting, order number and the store number (copy + vCard), plus P4's `<ContactLine>` from the order moment. The WhatsApp line shows only once a send is logged. It also shows the masked phone and «أضف رقم ثاني» through a proof-authorised endpoint, adds Kurdish to `EXPRESS_STRINGS`, and bumps the signature template to v3. | 10 (P5.1–P5.10) | none (writes the existing `orders.secondary_phone`) | none | P5.10 (draft enable + live check + test-order soft delete) runs only after the merchant approves turning the card on. Publishing stays the merchant's action. |

## Migrations, in order

All three sort after the latest file on disk, `20261021120000_publish_store_config_v2_allow_template.sql`, and they are strictly increasing:

1. `20261021130000_orders_confirmation_dispatched_at.sql` (P1.1)
2. `20261021142000_create_storefront_order_duplicate_guard.sql` (P2.1)
3. `20261021160000_abandoned_carts_consent_and_recovery_kind.sql` (P3.1)

If a newer migration lands on main before a piece runs, rename that piece's file so it sorts last, and keep this order.

## Names that cross pieces

- `queueOrderConfirmation({ id, tenantId })` (P1). P2's duplicate return and both replay returns sit above it, so neither a replay nor a duplicate ever queues.
- RPC `create_storefront_order` (P2) replaces `create_order_atomic` in `submitCheckout`. P2.3 renames the RPC in P1's test mocks. P3's new checkout test mocks `create_storefront_order` directly.
- `SubmitStatus` = `idle | submitting | checking | ok | duplicate | unconfirmed | error` (P2). P3's capture beacon fires only on `idle` / `error`.
- `ExpressModel` members: `waFallbackHref` (P2, after `waHref`), `captureConsent` (P3, after `trustChips`), `contactConfig` (P4, after `reassurance`).
- `pdp_direct_order` schema tail: `scroll_hint_i18n` → `show_capture_consent`, `capture_consent_i18n` (P3) → `show_contact_line` (P4).
- `parseStoreContact`, `StoreContactConfig`, `<ContactLine contact locale initialNow className iconClassName>` (P4), used by P5.6.
- `schn:last-order` stash (`order_id`, `upsell_token`, `customer_name`) is rewritten by P2 and read by P5.
- The two `whatsapp_confirm` sources: P1's platform allowlist (`STOREFRONT_WA_CONFIRM_TENANT_IDS`, not visible to the storefront) and P4's per-store `commerce.contact.whatsapp_confirm`. Nothing syncs them. Set the flag true only for a tenant on the allowlist.
- P4.4 and P5.10 both write `tenants.store_config_v2_draft` for scheniders-iraq. Each changes only its own paths, bumps `updated_at`, and requires that no store-builder tab is open.
