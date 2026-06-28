# Team Chat — Phase 6B: Web Push (G1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Browser push for mentions + DMs — subscription storage, a service worker, a subscribe/disable toggle, and an edge-function sender (triggered on `chat_notifications` insert) that respects mute/DND/prefs.

**Architecture:** `chat_push_subscriptions` table (RLS self) + DM-notification insert in `chat_send_message`. An edge function `send-chat-push` (Deno + `npm:web-push`) is invoked on `chat_notifications` INSERT via a DB trigger (pg_net), reads the recipient's subscriptions, filters by mute/DND/prefs, sends, prunes expired. Client: SW + `useWebPush` + subscribe/unsubscribe routes + a settings toggle.

**Decision (locked):** sender = Supabase **edge function**.

**HARD prerequisites (user-provided, NOT in this build):** VAPID keypair → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client) + edge secrets `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` + `EDGE_PUSH_SECRET` (trigger auth). **Push delivery is NOT verifiable headlessly — the user device-smokes it.** Everything below is "wired, pending VAPID + device smoke," never "working."

**Conventions:** `pnpm` PATH prefix. Gates: type-check + lint (0) + vitest. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. `git -C /Users/ali/scheniders-mono`. MCP up → apply migration + deploy edge function. LTR; `t()` EN+AR.

---

## Task 1: Migration — subscriptions table + DM notification

**Files:** Create `packages/supabase/migrations/20260624110000_chat_push_subscriptions.sql`

- [ ] **Step 1: Write + apply (MCP)**
```sql
CREATE TABLE IF NOT EXISTS public.chat_push_subscriptions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    tenant_id  uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    endpoint   text NOT NULL,
    p256dh     text NOT NULL,
    auth       text NOT NULL,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, endpoint)
);
ALTER TABLE public.chat_push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_push_subscriptions_self ON public.chat_push_subscriptions;
CREATE POLICY chat_push_subscriptions_self ON public.chat_push_subscriptions
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
```
Then extend `chat_send_message` (CREATE OR REPLACE — copy the current audited body from `20260622110000` / live, add ONE block): for a **DM** conversation, after the message insert, insert a `chat_notifications` row for the OTHER member (so DMs trigger push) — guarded so it doesn't duplicate a mention notification (skip if the peer was already @mentioned). Keep everything else identical.
- [ ] **Step 2: Smoke (BEGIN/ROLLBACK):** subscription RLS self-scoped (user A can't read B's); a DM message creates a `chat_notifications` row for the peer; a channel message does not (unless mentioned). Commit.

```bash
git -C /Users/ali/scheniders-mono add packages/supabase/migrations/20260624110000_chat_push_subscriptions.sql
git -C /Users/ali/scheniders-mono commit -m "feat(chat): push-subscriptions table + DM notification for push (Phase 6B)"
```

---

## Task 2: Edge function sender + trigger

**Files:** Create `supabase/functions/send-chat-push/index.ts`; a trigger migration `20260624110100_chat_push_trigger.sql`

- [ ] **Step 1: `send-chat-push/index.ts`** (Deno) — POST handler, auth via an `Authorization: Bearer <EDGE_PUSH_SECRET>` header (reject otherwise). Body = the new `chat_notifications` row (`{ recipient_id, actor_name, preview, conversation_id, tenant_id, message_id }`). Logic:
  - Service-role Supabase client (edge env `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).
  - Respect filters: skip if the recipient's `chat_members.muted` for that conversation; skip if `chat_user_status.dnd`; honor `chat_notification_prefs` (level 'none' → skip; 'mentions' → only if it's a mention). Read the conversation `kind` for the prefs lookup.
  - Load the recipient's `chat_push_subscriptions`; for each, `webpush.sendNotification(sub, JSON.stringify({ title: actor_name, body: preview, conversationId }))` using `npm:web-push` with VAPID from edge env (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`). On 404/410, delete that subscription row.
  - Return 200 always (best-effort; never block the chat flow).
- [ ] **Step 2: Deploy** via `mcp__supabase__deploy_edge_function` (name `send-chat-push`). It's inert until the user sets the VAPID + EDGE_PUSH_SECRET edge secrets — note that.
- [ ] **Step 3: Trigger migration** (`20260624110100`): an `AFTER INSERT ON chat_notifications` trigger (SECURITY DEFINER, EXCEPTION-swallowed) that calls the edge function via `net.http_post` (pg_net) with the `Authorization: Bearer <EDGE_PUSH_SECRET>` header + the row as JSON. The function URL + EDGE_PUSH_SECRET come from a `app_settings`/vault entry or a hardcoded project-ref URL + a DB setting — read how the repo stores such config (grep existing pg_net / http_post usage; if none, store the secret in a `vault`/settings row the user fills). Apply via MCP. Wrap in EXCEPTION so a push failure never rolls back the notification.
- [ ] **Step 4: Commit** (function + trigger migration).

```bash
git -C /Users/ali/scheniders-mono add supabase/functions/send-chat-push/index.ts packages/supabase/migrations/20260624110100_chat_push_trigger.sql
git -C /Users/ali/scheniders-mono commit -m "feat(chat): edge-function web-push sender + chat_notifications trigger"
```

---

## Task 3: Service worker + client subscribe

**Files:** Create `apps/platform/public/sw.js`, `apps/platform/hooks/chat/use-web-push.ts`, `apps/platform/app/api/chat/push/subscribe/route.ts`, `apps/platform/app/api/chat/push/unsubscribe/route.ts`

- [ ] **Step 1: `public/sw.js`** — `push` listener → `event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: <app icon>, badge: <badge>, data: { conversationId } }))`; `notificationclick` → `clients.matchAll` to focus an open app tab + postMessage `{type:'open-conversation', conversationId}` (else `clients.openWindow('/?chat=' + conversationId)`).
- [ ] **Step 2: `use-web-push.ts`** — `useWebPush()`: `supported` (`'serviceWorker' in navigator && 'PushManager' in window`); `permission` (Notification.permission); `enable()` → request permission → `navigator.serviceWorker.register('/sw.js')` → `reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) })` → POST to `/api/chat/push/subscribe`; `disable()` → unsubscribe + POST `/api/chat/push/unsubscribe`. Guard missing VAPID env (show "not configured"). `urlBase64ToUint8Array` helper.
- [ ] **Step 3: routes** — `subscribe`: auth-gated; upsert `{ user_id, tenant_id, endpoint, p256dh, auth, user_agent }` into `chat_push_subscriptions` (keys from the PushSubscription JSON). `unsubscribe`: delete by endpoint. Reuse the route auth pattern from `app/api/chat/unfurl/route.ts`.
- [ ] **Step 4: commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/public/sw.js apps/platform/hooks/chat/use-web-push.ts apps/platform/app/api/chat/push/
git -C /Users/ali/scheniders-mono commit -m "feat(chat): service worker + web-push subscribe/unsubscribe client"
```

---

## Task 4: UI toggle + notificationclick wiring + i18n

**Files:** Modify a chat settings surface (next to the 6A sound toggle in `conversation-list.tsx` header, or the presence stack), `apps/platform/components/chat/chat-runtime.tsx`, `apps/platform/lib/i18n.ts`

- [ ] **Step 1:** An "Enable notifications" toggle using `useWebPush()` — reflects `supported`/`permission`/`subscribed`; on click `enable()`/`disable()`; show "denied — change in browser settings" when blocked, and the iOS "install the app to enable push" hint when unsupported on iOS Safari.
- [ ] **Step 2:** In `chat-runtime.tsx` (mounted once), listen for the SW `message` (`navigator.serviceWorker.addEventListener('message', …)`) and on `open-conversation` call `useChatStore().open(conversationId)`.
- [ ] **Step 3:** EN+AR i18n: `chat.enablePush`/`chat.disablePush`/`chat.pushDenied`/`chat.pushUnsupported`/`chat.pushIosHint`/`chat.pushEnabled`. Verify i18n-completeness.
- [ ] **Step 4: type-check + lint (0) + commit.**

```bash
git -C /Users/ali/scheniders-mono add apps/platform/components/chat/conversation-list.tsx apps/platform/components/chat/chat-runtime.tsx apps/platform/lib/i18n.ts
git -C /Users/ali/scheniders-mono commit -m "feat(chat): enable-notifications toggle + open-from-push wiring"
```

---

## Task 5: Review + handoff
- [ ] Reviewer: subscription RLS self-scoped; the edge sender auth-gates on EDGE_PUSH_SECRET + respects mute/DND/prefs + prunes expired + never blocks chat; the trigger is EXCEPTION-swallowed; routes auth-gated; client guards missing VAPID + unsupported; no `any`/disable/`!`; i18n EN+AR.
- [ ] **Handoff doc** (in the commit / a short note): the exact env vars to set — `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (platform), edge secrets `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`/`EDGE_PUSH_SECRET`, the DB setting for the function URL + EDGE_PUSH_SECRET — and the device-smoke steps. Mark the feature **wired, pending VAPID + device smoke**.

## Self-Review (coverage map)
- Subscriptions + DM-notify → Task 1. Sender + trigger → Task 2. SW + subscribe + routes → Task 3. Toggle + open-from-push + i18n → Task 4. Review + env handoff → Task 5. Delivery verification → USER (device smoke).
