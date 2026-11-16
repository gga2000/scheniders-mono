# Merchant support, wave 1

Date: 2026-11-16. Asked by Ali: "heavily focus on customer service", let the team give world-class support to subscribed merchants.

## Problem

A merchant who is stuck has no way to reach us from inside the app. Nine messages say "contact support" and give no channel. Staff have no place where questions arrive, nobody owns a question, and nothing is measured (audit: 0/10).

## Wave 1 scope

1. **Help button** in the merchant app header. It opens a support chat.
2. **Support chat** (merchant side). Every message carries the page the merchant is on, the open order, the last error and the browser, so staff never ask "which page?".
3. **Support inbox** in the staff console (`/support`): list of conversations sorted by who waits longest, the conversation, and a shop card (plan, status, wallet, orders this week, team, pinned notes).
4. **Cases, not loose messages**: each conversation has a status (waiting on us, waiting on merchant, solved), an owner, a reason, a first-reply time and a yes/no answer from the merchant to "did this solve it?".
5. The nine dead "contact support" messages get a button that opens the chat with the error attached.

Not in wave 1: voice notes and attachments, call-back request, view-as, shop check, WhatsApp door, help articles, AI drafts, staff phone ping, a reply-time promise shown to merchants (waits for Ali's hours).

## Data

Two new tables, both tenant-scoped, RLS on, no policies, no grants to `anon` or `authenticated`. Only server routes holding the service role read or write them, always scoped by the caller's verified tenant and user.

- `support_cases`: one row per conversation. `tenant_id`, `opened_by`, `status`, `owner_admin_id`, `reason`, `first_reply_at`, `waiting_since`, `solved_at`, `rating`, last-message fields, `merchant_last_read_at`. At most one unsolved case per member per shop (partial unique index).
- `support_messages`: `case_id`, `tenant_id`, `sender_kind` (merchant, staff, system), `body`, `context` (jsonb: page, order, error, browser).

Why not reuse the team chat tables: chat rows are readable by shop members through RLS and have no status, owner, reason or timers. Mixing staff into tenant chat would put platform staff inside tenant membership checks. Separate tables keep tenant isolation simple.

State changes go through SQL functions so each one is atomic:

| Function | What it does |
| --- | --- |
| `support_merchant_send` | Opens a case if none is open, adds the message, sets "waiting on us", starts the wait clock. Limits one member to 20 messages a minute. |
| `support_staff_reply` | Adds the reply, sets "waiting on merchant", records first reply time, first replier becomes owner, writes a notification for the merchant. |
| `support_staff_solve` | Needs a reason. Marks solved, adds a "solved" line. |
| `support_merchant_rate` | Merchant answers yes or no on a solved case. "No" reopens it. |

## Merchant app (`apps/platform`)

- `GET /api/support`: my thread (messages across my cases in this shop), the current case, unread count.
- `POST /api/support`: `send`, `rate`, `read`. Zod-validated. Tenant and user come from the session, never from the body.
- `SupportTrigger` in the header beside chat and notifications, with an unread dot.
- `SupportSheet`: right-side panel. Context chips above the input show what will be attached.
- `ContactSupportButton`: used by the nine error messages.
- Arabic and English strings for everything.

## Staff console (`apps/admin`)

- New permission `handle_support` for both roles.
- `GET /api/support/cases` (list + counts), `GET /api/support/cases/[id]` (messages + shop card), `POST /api/support/cases/[id]` (`reply`, `solve`, `assign`).
- `/support` page: three panes. English, like the rest of the console, until the admin redesign decides the console language and look.
- Sidebar item with the number waiting on us.

## Measured from day one

First reply time, time waiting, solved yes/no, reason. These feed the wave 3 scoreboard.

## Tests

- SQL: migration and the four functions run against a local Postgres 16 with stub tables.
- API: schema and route tests in Vitest for both apps; admin routes join the existing guard tests.
- `pnpm type-check`, `pnpm lint`.

## Wave 2: staff alert

A new merchant message pings support staff on their phone or computer.

- Staff press **Turn on alerts** on `/support`. The browser asks for permission, registers `public/support-sw.js` and stores its push subscription through `POST /api/support/push` (owner = the signed-in admin; `DELETE` turns it off). iPhone needs the page added to the Home Screen first.
- `admin_push_subscriptions`: one row per device. Server-only like the support tables (RLS on, no policies, no browser grants).
- Trigger `trg_support_notify_staff` on `support_messages` (merchant messages only) queues a call to the `send-staff-push` edge function with the shop name and a 140-character preview. Recipients: every active staff member with a device. A push failure never blocks the merchant's message.
- `send-staff-push` signs with the same VAPID keys as the merchant push, collapses alerts per conversation (one notification per case, rings again on each message) and drops subscriptions the push service has thrown away (404/410). Tapping the alert opens `/support?case=<id>`.
- Moving an unanswered alert to a supervisor after the promised reply time: built, see Support hours.

## Wave 2: saved replies the team edits

- One shared list in `support_saved_replies` (server-only like the other support tables). Seeded with the four wave 1 replies plus "Checking order".
- The reply box shows the list as buttons. Picking one fills `{name}` (merchant's first name), `{shop}` and `{order}` (newest order the merchant had open). A value the conversation does not have stays as written, so staff see the gap.
- "Edit replies" opens the list: add, change text or order, remove (second click confirms). Every change is in the staff activity log with who made it.

## Wave 2: scoreboard and shop check

- **Scoreboard** tab on `/support` (7 or 30 days): waiting now, conversations, typical first reply and the slowest 1 in 10, share answered within 5 minutes, typical time to solve, merchant yes/no, reasons, team table. One SQL function, `support_scoreboard`; demo store left out; first reply counts support hours (see Support hours).
- **Check this shop** button on the shop card beside a conversation. `support_shop_check` gathers store state (paused, payment lock, trial), real orders, products on the store and stock, wallet, WhatsApp (paused, 7-day sends), Al-Waseet calls, the Prime link, and errors merchants sent with their messages. The console marks each line fine, worth a look, broken or not in use, and links to where staff fix it (merchant page, WhatsApp page, the shop's Sentry issues). No fix buttons yet: each fix changes a shop, so it stays on the pages that already log it.

## Wave 2: picture of the screen

- In the Help chat, "Picture of this screen" captures the page behind the chat (the chat and its backdrop are left out) as a JPEG, at most 1600 px wide. `modern-screenshot` draws it, because html2canvas cannot read the app's oklch colours.
- `POST /api/support/shot` stores it in the private bucket `support-shots` as `<tenant_id>/<uuid>.jpg` (JPEG only, 1.5 MB, 10 per shop per 10 minutes). The next message carries the path in `context.screenshot`; the send route refuses a path outside the caller's shop folder.
- Merchant and staff see it through signed links (1 hour in the chat, 15 minutes in the console). No storage policy opens the bucket: screens can show customer names and phones.
- Not yet: deleting old pictures, and pictures that were taken but never sent.

## Support hours and the late alert (Ali, 2026-11-16: option A)

- **Promise:** every day 9 AM to 12 AM Baghdad time, first reply within 5 minutes. Iraq has no daylight saving, so it is plain wall clock. One rule in two places: `packages/shared/src/support-hours.ts` for the apps and `public.support_clock_start()` in the database.
- **Merchant chat:** under the title, «متصلون الآن · نرد خلال 5 دقائق» with a green dot, or «مغلق الآن · نرد عليك من الساعة 9 صباحاً» at night. The empty chat also shows the days and hours.
- **Clock:** a message inside hours starts the 5 minutes at once; a message between midnight and 9 AM starts them at 9 AM.
- **Late alert:** `support_alert_late()` runs every minute (pg_cron job `support-late-alert`). Once per wait, it pings the supervisor's phone when a merchant has waited 5 minutes of support hours: «No reply for N min · shop». The supervisor is every active super admin with alerts on; if none has a phone, every support person with one hears it. It is quiet at night and never alerts for the demo store. When no phone has alerts on, nothing is marked, so the first phone that turns them on still hears about the waiting merchants.
- **Inbox:** the wait chip turns amber when the 5-minute promise is broken and red after 15, both counted in support hours.
- **Scoreboard:** first reply time and "answered within 5 min" count from the clock start, so a 3 AM message answered at 9:03 is a 3-minute reply. Time to solve stays clock time.


## Wave 3: reply ping and voice notes

- **Reply ping:** a staff reply already writes a `support.reply` notification and solving writes `support.solved`. The phone push (`send-order-push`) now has its own words for both: «رد عليك دعم شنايدر» with the start of our reply, and «علّمنا محادثتك كمحلولة · هل انحلت مشكلتك؟». Tapping either opens the app on `/?support=open`, and the platform opens the Help chat for `?support=` on any page, then drops it from the address.
- **Voice notes:** a mic chip beside the camera chip records up to 2 minutes (32 kbit/s, the browser's own format: WebM on Chrome and Android, MP4 on iPhone). The note goes to the private `support-voice` bucket under `<shop id>/<uuid>.<webm|m4a|ogg>` through `POST /api/support/voice`, which checks the file really is audio from its first bytes, caps it at 2 MB and at 10 files per shop in 10 minutes (shared with pictures' rule). A message may carry a voice note with no text; its text is then «رسالة صوتية» (or "Voice note" in English).
- **Playback:** both apps sign 1-hour links for pictures and voice notes in one call per bucket, and only for files inside the shop's own folder. The staff console keeps the first link while it plays and shows "The voice note is no longer stored." when it is gone.

## Wave 3: Needs us (we write first)

- **List:** a "Needs us" tab in the staff inbox lists every real shop with something wrong right now, from `support_shops_needing_us()` (migration `20261116104616_support_reach_out.sql`). The problems it looks for are: store paused, locked for billing, wallet at or below 0, WhatsApp paused, Prime link failing, 3 or more Al-Waseet failures in 24 hours, orders stopped (5 or more in the 14 days before, none in 48 hours) and a trial ending within 2 days. The demo store, prospects and closed shops never show. Shops with the most problems come first, and the tab shows how many there are.
- **Each row:** shows the shop, who we would write to (the first active admin, otherwise the first active member), when we last wrote, and each problem with how long ago it started.
- **Write first:** "Write first" fills in an Arabic first line for the most serious problem, and staff can edit it before sending. `support_staff_start()` opens a conversation with the owner, or writes in their open one, and the merchant gets the usual reply ping. The writer owns the conversation, and the inbox then opens on it.
- **Counting:** `support_cases.started_by` says who started a conversation. The scoreboard's "Conversations", reply times and "answered within 5 min" count only conversations merchants started. Ours are counted as "we wrote first".

## Wave 3: 30-day file cleanup

- Pictures of the screen and voice notes are kept for 30 days. Every day at 4:40 AM Baghdad time, `/api/cron/support-files-cleanup` asks `support_old_files()` (migration `20261116105026_support_old_files.sql`) for up to 500 files older than that. It removes them through the Storage API, one bucket at a time. A full batch carries on in the next run.
- The messages themselves stay. The staff console says "no longer stored" in place of the file, and the merchant chat just shows the text.

## Wave 4, part 1: a named person and a first-week plan

- **Named support person.** `support_shop_owners` gives every real shop one support person (never the demo store, prospects or closed shops). `support_onboard_shops()` runs every 5 minutes from pg_cron. It gives each shop without an active person the support staff member with the fewest shops; super admins are used only when there is no support staff. The merchant's Help chat header shows «مسؤول حسابك: name». Staff can press "Take this shop" on the shop card or in Today.
- **First-week plan.** `support_tasks` gives every shop opened in the last 7 days four calls: welcome (day 0), store check (day 1), first order (day 3), and before the trial ends (a day before `trial_ends_at`, else day 6). The staff console tab **Today** lists the calls due by the end of the Baghdad day. Mine come first; the badge counts mine.
- **Call log.** Each call is recorded with Done, No answer (back in 3 hours) or Later (back tomorrow) and a one-line note in `support_calls`. The last 3 calls show on the task and on the shop card, so the next person knows what was said.
- Server-only tables (RLS on, no policies), service-role functions, behaviour suite `support-owners`.

## Wave 4, part 2: the merchant sees what staff did

- Merchant Settings now has a **Support activity** section (shop admins only). It lists every step our staff took on the shop that the merchant should know about: opening the store page, look-only views, trial, plan and pause changes, wallet top-ups, WhatsApp pause, writing first, and becoming the shop's person. Each line has the staff member's display name (never an email) and the time.
- `support_staff_visits(tenant)` reads `admin_activity_logs` with an allow-list. Internal steps such as notes, tags, priority, inbox moves and the call log stay off. The function is service-role only. `GET /api/support/visits` always uses the caller's own shop.

## Wave 4, part 3: look-only view as merchant

- Staff press **View as merchant** on the shop card. The console makes (once) a viewer login for that staff member, starts a 30-minute session in `support_view_sessions`, and gives a one-time link into the merchant app. Open it in a private window, because it replaces the platform login in that browser.
- The merchant app shows a red bar with the time left and an End button. When time runs out the screen closes over with "Session ended".
- **Locked in the database, not only in the app.** A statement trigger on every public table and on `storage.objects` refuses any insert, update or delete while `is_support_viewer()` is true, even inside definer functions. An event trigger locks each new table. `support_view_start` refuses while any table is unlocked (`support_view_unguarded_tables()`), so a missed table fails closed.
- The viewer sees the shop as a 'viewer' member plus money and settings pages. The app's request gate refuses every non-GET call for a look-only caller, and the order, MCP and courier callers refuse it outright.
- Each start is logged as `support_view`, so the merchant sees it under Support activity. Behaviour suite `support-view`.

## Wave 4, part 4: the same support on every plan, and "call me back"

- **Same on every plan.** Nothing in the Help chat, the call plan, view as merchant or the alerts reads the plan. The old `priority_support` plan flag gates nothing, and one-plan billing sets it to true for every shop.
- **Call me back.** Under the chat header the merchant can press "Call me" and leave a number, filled in from the shop's contact mobile. `support_request_call_back` makes a `call_back` task, due now or at 9 AM Baghdad when asked at night. It also writes «اتصلوا بي على 07…» into the chat, so the inbox, the phone alerts and the 5-minute late alert treat it like any merchant message. Each shop has one open call-back: asking again with the same number changes nothing, and a new number updates the task. Once the call is logged as done, a new request makes a new task. The demo store is refused.
- In the staff console's **Today** tab, call-backs come first, whoever owns the shop. Each shows the number as a tap-to-call button and who asked. Done, No answer and Later work as on any call.
- Migration `20261116115400_support_call_back.sql`. The first-week kinds stay one per shop, and a call-back never stops a new shop's plan. Behaviour suite `support-owners`.

## Wave 5, part 1: quick answers in the Help chat

- An empty chat lists ten common questions (top up, wallet charges, add a product, add staff, Prime, labels, order status, store look, blacklist, expenses). Each has a two-line answer and an "Open the page" button that closes the chat on that page.
- While the merchant types, up to three matching answers show above the input ("This may answer it"). Arabic spellings are folded (alef forms, taa marbuta, tashkeel) so «اضافة» and «إضافة» meet.
- The answers live in `apps/platform/lib/support/quick-answers.ts` and follow the app's own screen words, so changing a screen means changing its answer there. No money amounts are quoted; money answers point to Billing.

## Wave 5, part 2: notices

When something hits many shops at once (Prime is slow, a payment method is down), staff tell every merchant once instead of answering the same question twenty times.

- Staff write a short notice (up to 300 letters, Arabic) on the Support page and pick how long it shows: 2 hours, 6 hours, 1 day or 3 days. They can replace it or end it early.
- Merchants see it at the top of their Help chat, labelled "تنبيه من فريق الدعم", until it ends.
- One notice is live at a time; posting a new one ends the old one (`support_notice_post`, advisory lock plus a unique index on the open row). Ending is `support_notice_end`. Both are service-role only and logged in the staff activity log.
- `support_notices` is server-only (RLS on, no policies) and keeps every notice on record: no role can delete one.
- Behaviour suite `support-notices` covers access, refusals, replacement, early end and notices that ran out.

Found on the way: the view-as lock's event trigger saw a new table with a foreign key twice and failed the migration. Fixed in `support_view_lock_once` (one pass per table); the `support-view` suite now creates such a table.
