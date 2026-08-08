# WhatsApp / Interakt cutover — OLD app → NEW app

**Status: NOT DONE.** Until it is, order-confirmation WhatsApp messages are still
being sent by the **OLD** app (`schneiders-orders`, separate codebase at
`/Users/ali/Scheniders`), which carries the un-fixed `productRepository` bug that
strips SKUs and names the wrong item in the message.

The NEW app (`scheniders-platform`, this repo) is **code-ready** — the fixes
landed on `main` in `ac88250` / `cb284dc` / `20b02ed`, and dispatch now runs
in-process rather than through a self-fetch that hit a protected `VERCEL_URL`
and 401'd. Nothing further is needed in code. Everything below is operational.

Verified 2026-08-07: both apps respond 200 in production, so this is a live
dual-send / wrong-sender situation, not a dormant one.

## The apps

| | OLD (retiring) | NEW (target) |
|---|---|---|
| Vercel project | `schneiders-orders` | `scheniders-platform` |
| Codebase | `/Users/ali/Scheniders` | this repo (`apps/platform`) |
| Public URL | `https://schneiders-orders.vercel.app` | `https://schenidersapp.xyz` (custom domain, live) |
| Supabase | `ibfdugifekivquwprqjc` | `sduvpgqwhxragxtxztur` |

## Order of operations

Do these **in this order**. Repointing the webhook before the NEW app can
actually send leaves a window where *nobody* sends a confirmation, which is
worse than sending a slightly wrong one.

### 1. Confirm NEW env vars (do first — this is the one that silently broke before)

Vercel → `scheniders-platform` → Settings → Environment Variables → **Production**:

- `INTERAKT_API_KEY` — must be present. Both these were dropped around 2026-06-01,
  which is what made sends fail silently in the first place.
- `NEXT_PUBLIC_SITE_URL` — must be `https://schenidersapp.xyz` (no trailing slash).
  Used by the LightFunnels webhook to schedule the QStash delayed-import callback
  ([lightfunnels/route.ts:106](../apps/platform/app/api/webhooks/lightfunnels/route.ts#L106));
  without it the route logs `No NEXT_PUBLIC_SITE_URL or VERCEL_URL set` and the
  callback is never scheduled. Do **not** rely on the `VERCEL_URL` fallback — that
  is the protected deployment URL that returns 401.

Redeploy after changing either — env changes do not apply to existing deployments.

How to tell it worked: a missing key is no longer silent. `sendTemplateMessage`
logs `[Interakt] API key not configured` and returns a failure result
([interakt.ts:307](../apps/platform/lib/interakt.ts#L307)), so the Vercel logs
will say plainly whether the key is there.

### 2. Repoint the LightFunnels webhook to NEW only

LightFunnels dashboard → webhook settings. Target:

```
https://schenidersapp.xyz/api/webhooks/lightfunnels
```

Remove (do not merely add alongside) the OLD app's endpoint. While both are
subscribed, every order gets two WhatsApp messages — one of them wrong.

### 3. Repoint the Interakt webhook

Interakt dashboard → Settings → Developers → Webhooks. Target:

```
https://schenidersapp.xyz/api/webhooks/interakt
```

⚠️ There was an untracked `docs/WHATSAPP_DEBUGGING_GUIDE.md` on disk documenting
the **OLD** URL (`schneiders-orders.vercel.app`) as the correct value. It was
never committed to this branch and has since been removed from the working tree.
If a copy resurfaces, correct it — otherwise the next person re-points Interakt
backwards.

### 4. Disable the OLD sender

In `/Users/ali/Scheniders`, disable the outbound WhatsApp send path (or remove
`INTERAKT_API_KEY` from that project's Vercel env, which is faster and fully
reversible). Leaving OLD deployed but unable to send is the safer intermediate
state than deleting the project — keep it until step 5 confirms NEW is healthy.

## 5. Verify

1. Place a real test order through the LightFunnels funnel.
2. Vercel logs for `scheniders-platform` → expect
   `[WhatsApp Dispatcher] Dispatching confirmation in-process for order …`
   and no `API key not configured`.
3. Check the received WhatsApp message names the **correct product** — this is
   the whole point of the cutover, and it is the one thing that looks identical
   in the logs whether it is right or wrong.
4. Confirm exactly **one** message arrives, not two.
5. Vercel logs for `schneiders-orders` → expect no send activity.

## Rollback

Re-add `INTERAKT_API_KEY` to the OLD project and repoint both webhooks back.
No data migration is involved in the cutover, so rollback is just configuration.

## Related

- Root-cause history: memory `project_whatsapp_interakt_pipeline`
- Send path in code: [`lib/whatsapp-dispatcher.ts`](../apps/platform/lib/whatsapp-dispatcher.ts)
  → [`lib/interakt.ts`](../apps/platform/lib/interakt.ts)
- Inbound routes: [`app/api/webhooks/lightfunnels/`](../apps/platform/app/api/webhooks/lightfunnels/route.ts),
  [`app/api/webhooks/interakt/`](../apps/platform/app/api/webhooks/interakt/route.ts)

Note: older `docs/WEBHOOK_SETUP.md` and `docs/WHATSAPP_DEBUGGING_GUIDE.md` were
untracked working-tree leftovers (not in this branch's history) and are gone.
This runbook is the tracked source of truth for the cutover.
