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
