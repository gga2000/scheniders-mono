# Web Push (Phase 6B) — activation handoff

Everything is **built + deployed**; push is **disarmed** until you set the secrets below. No code change needed to turn it on.

## 1. Generate a VAPID keypair
```bash
npx web-push generate-vapid-keys
# → Public Key:  B....   Private Key:  ....
```

## 2. Platform env (Vercel / `.env`)
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<the public key>
```
(Without it the "Enable notifications" toggle shows "not configured".)

## 3. Edge function secrets (Supabase)
```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=<public key> \
  VAPID_PRIVATE_KEY=<private key> \
  VAPID_SUBJECT=mailto:you@yourdomain \
  EDGE_PUSH_SECRET=<any long random string>
```
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are auto-injected. The function `send-chat-push` is already deployed (verify_jwt off — it does its own bearer auth).

## 4. Arm the DB trigger
Set the SAME `EDGE_PUSH_SECRET` in `chat_push_config` so the trigger authenticates to the function:
```sql
UPDATE public.chat_push_config
SET edge_secret = '<the same EDGE_PUSH_SECRET>'
WHERE id = 1;
-- function_url is pre-seeded to .../functions/v1/send-chat-push
```
Until `edge_secret` is set, the trigger no-ops (chat keeps working; nothing sends).

## 5. Device smoke (you — not headless-verifiable)
1. Open the app (desktop Chrome/Firefox/Edge, or an **installed** PWA on iOS Safari — iOS won't allow push from a plain tab).
2. Click **Enable notifications** in the chat list header → grant permission.
3. From a SECOND account/session, @mention you or DM you.
4. Background the tab → you should get an OS notification; clicking it focuses the app + opens that conversation.

## Behavior already wired
- Push respects **mute** (`chat_members.muted`), **DND** (`chat_user_status.dnd`), **per-kind prefs** (`chat_notification_prefs.level='none'` silences). Expired subscriptions (404/410) auto-prune.
- DMs notify the peer; mentions notify the mentioned; a mention-in-a-DM does not double-notify.

## Known follow-ups
- `chat_notification_prefs.level='mentions'` currently behaves like 'all' (the notification row has no mention flag yet) — add a flag to refine.
- Phase-4 unfurl DNS-rebind IP-pinning (separate, documented in that route).
