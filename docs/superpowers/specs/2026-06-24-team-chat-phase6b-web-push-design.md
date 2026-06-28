# Team Chat — Phase 6B: Web Push (G1) — Design

**Date:** 2026-06-24
**Branch:** current (chat co-mingled).
**Parent:** Phase 6 spec §8 (web-push split out of 6A). **The final chat roadmap item.**
**Status:** Draft — needs the sender-architecture decision (§7) + VAPID keys (you provide).

---

## 1. Context & honest constraints

6A shipped (mute/sound/badge/presence/mark-all-read). G1 = browser push notifications for mentions + DMs, so a teammate is reachable when the tab is closed. Backend: `chat_notifications` already gets a row per @mention (via `chat_send_message`); DMs don't yet create a notification row. No push infra exists.

**Hard constraints (not closeable headlessly):**
- **VAPID keys** — web push requires a VAPID keypair. You generate it (`npx web-push generate-vapid-keys`) and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client) + `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (server/edge). Without them, subscribe + send are inert. I'll wire the env slots; the secrets are yours.
- **Device smoke** — push delivery can't be verified headlessly; you test on a real browser/device (grant permission → background the tab → trigger a mention → receive the OS notification).
- iOS Safari needs the PWA installed to allow push; desktop Chrome/Firefox/Edge work directly. Document this.

---

## 2. Data model & migration

Migration `20260624110000_chat_push_subscriptions.sql`:
- `chat_push_subscriptions (id uuid pk, user_id uuid fk→user_profiles on delete cascade, tenant_id uuid, endpoint text NOT NULL, p256dh text NOT NULL, auth text NOT NULL, user_agent text, created_at timestamptz default now(), UNIQUE(user_id, endpoint))`. RLS self-scoped (`user_id = auth.uid()`).
- (DM notifications) extend `chat_send_message` to also insert a `chat_notifications` row for the DM peer on a DM message (so DMs trigger push too) — OR keep push driven only by `chat_notifications` and add a small notify-on-DM path. Decision: add a `chat_notifications` insert for DM/group recipients in `chat_send_message` (mentions already covered) — gated so it doesn't double-insert for a mention.

## 3. Sender (§7 decides the where)
On a new `chat_notifications` row (mention or DM), send a Web Push to each of the recipient's `chat_push_subscriptions`, **respecting** the 6A mute (`chat_members.muted`) + DND (`chat_user_status.dnd`) + per-kind prefs (`chat_notification_prefs`). Payload: actor name + preview + a deep link (conversation id). Prune subscriptions that return 404/410 (expired).

## 4. Client
- **Service worker** `public/sw.js` — `push` event → `self.registration.showNotification(title, { body, icon, badge, data:{conversationId} })`; `notificationclick` → focus an existing app tab (postMessage to open that conversation) or `clients.openWindow`.
- `hooks/chat/use-web-push.ts` — `useWebPush()`: detect support; request `Notification.permission`; register the SW; `pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: urlBase64ToUint8Array(NEXT_PUBLIC_VAPID_PUBLIC_KEY) })`; POST the subscription to `POST /api/chat/push/subscribe` (upsert into the table); `unsubscribe` removes it. Expose `{ supported, permission, subscribed, enable(), disable() }`.
- `app/api/chat/push/subscribe/route.ts` + `.../unsubscribe/route.ts` — auth-gated; upsert/delete the caller's subscription (tenant from the user).
- **UI** — a "Enable notifications" toggle in the chat notification-settings area (next to the 6A sound toggle); reflects permission state (prompt / granted / denied) + subscribe state.
- `notificationclick` → the SW messages the app (or opens it) to `openMessage`/`setActiveConversation` the linked conversation.

## 5. i18n
EN+AR: enable/disable push, permission-denied, push-not-supported, install-PWA-for-iOS hint, settings labels.

## 6. Verification
- type-check + lint (0); migration applied + advisor + RLS smoke (subscriptions self-scoped); the sender respects mute/DND/prefs (SQL-level check).
- **Deferred to you:** VAPID env + real-device smoke (permission → background → mention → receive). I'll mark the feature "wired, pending VAPID + device smoke" — NOT "working."

## 7. Decision needed — sender architecture
Where does the push get sent from when a `chat_notifications` row is created?
- **(a) Supabase edge function** (recommended) — a `send-chat-push` edge function (Deno + the `web-push` API), invoked on `chat_notifications` INSERT via a DB trigger using `pg_net`/`supabase_functions.http_request` (or a DB webhook). VAPID private key lives in the edge function's secrets. Serverless, scales with the DB event, no platform-app involvement. Needs `supabase functions deploy` + edge secrets.
- **(b) Platform Next route** — `POST /api/chat/push/send` using the `web-push` npm lib + `VAPID_PRIVATE_KEY` from the platform env; called in-process from the existing message-dispatch path (or by a DB trigger hitting the route). Simpler to write/deploy with the app, but couples push to the platform app being up + reachable, and the existing send path is RPC-in-DB (the trigger would still need pg_net to call the route).
Recommendation: **(a) edge function** — it's the natural home for a DB-event-driven sender + keeps the VAPID secret off the platform app. I can draft + deploy it via the Supabase MCP (`deploy_edge_function`), with the trigger wired; you set the edge VAPID secret.
