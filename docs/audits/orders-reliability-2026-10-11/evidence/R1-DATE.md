# R1 — DATE investigator report (order date change error)

Summary: Prod (0cb1b8ca) still postpones by moving Order Date (`created_at`) forward. 2026-09-07 a live DB trigger rejects future created_at. Replacement UI (Scheduled For field, due-today queue, filing by scheduled day) never merged → only DB half shipped. 31 rejected saves 2026-09-08..10-09 (15 since 10-04 deploy). One postponement turned into a cancellation; one order has no postponement recorded.

## DATE-1 P0 — Prod writes future created_at; live trigger rejects whole save
- order-customer-card.tsx:391-397 `<DateTimePicker value={displayValue("created_at")} onChange={(iso)=>updateFormData("created_at", iso)} showTime />` no bound. packages/ui/src/datetime-picker.tsx:16-22 no min/max; emits new Date(...).toISOString() (115-116,137-138).
- hooks/use-order-details-form.ts:62-66 sends created_at (+original_created_at); line 75 single onUpdate with all edited fields → use-order-crud.ts:319 updateOrder → lib/repositories/order-repository.ts:394-418 direct `supabase.from("orders").update(updates).eq("id").eq("version").select().maybeSingle()` (PostgREST PATCH).
- Live: `trg_orders_created_at_not_future BEFORE INSERT OR UPDATE OF created_at ... enforce_order_created_at_not_future()`: `IF NEW.created_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'orders.created_at cannot be in the future (%). Use scheduled_date to postpone an order.' USING ERRCODE='23514'`.
- User sees raw English message in up to 3 toasts (use-orders-query.ts:355, use-order-crud.ts:424, use-order-details-form.ts:89). Message references a column with no UI. Same PATCH → phone/notes/address edits in the same save also lost.
- Logs (postgres 23514; edge PATCH /rest/v1/orders?id=eq.<id>&version=eq.N&select=* → 400): 10-08 15:38Z order 7480 x4; 10-08 23:34Z x4 + 10-09 01:08Z x7 order 7509 (two employees); 10-02 21:54Z order 7421; 10-02 22:00Z order 118705111; earlier 09-08..09-12 x13. All targets :00 seconds → picker.
- Business impact: 7421 postpone rejected 00:54:07 Baghdad → 00:55:02 cancelled with note "يريده يوم الخميس". 7509 after 11 rejections still confirmed, scheduled_date NULL, no note.
- Confidence: confirmed code+data+logs.

## DATE-2 P0 — "change date" feature built, never shipped; only DB half live
- Commits bc5ee8fd, a8eca649, 0cd5485f, d866c3ce, c4357f10, 17b2d849 (09-07/09) + c27ebbbf (09-13): none ancestors of origin/main. On feat/notifications-overhaul, ship/dashboard-audit-to-main, chore/orders-duplicate-detection, chore/remove-dead-product-cms. No PR ever carried them (gh pr list --head → []).
- Notifications work shipped via separate clean branch feat/notifications-overhaul-clean (PR #97) — scheduling commits stranded.
- Migration 20260907134322 orders_schedule_not_created_at applied live 09-07 13:43Z.
- Prod lacks: Scheduled For field, futureDateBlocked i18n, picker maxDate, due-today queue, scheduled_date in LIST_VIEW_COLUMNS, getWorkDayKey.
- Hypothesis: "Ali" set Scheduled Date on 4 orders 09-13 01:12–01:16 from local branch against live DB.

## DATE-3 P1 — "Move to today" fails when kept time-of-day is in the future
- Picker keeps original hh:mm when day changes → moving older order to today fails if original time > now+5m. Order 7480 three rejects then success hours later; also 7342, 7357, 7362. Staff learned to retry later.
- Why staff do it: default orders view = Today by created_at (lib/order-filter-utils.ts:194-201) — re-dating to today = getting order into today's list.

## DATE-4 P1 — prod's only scheduled_date control invisible downstream
- Unlabeled Sun icon (tooltip Tomorrow) order-details-modal.tsx:901-923 writes scheduled_date.
- LIST_VIEW_COLUMNS (order-repository.ts:20-59) omits scheduled_date → badge order-card.tsx:1431 never renders. Client date filter created_at only (use-order-filters.ts:179-190); server window .gte/.lte created_at (order-repository.ts:213-233); realtime predicate same (lib/order-window.ts:56-65). Postponed order never appears on due day.
- useOrderCrud.setScheduledDate (use-order-crud.ts:678-697) dead code. 25 orders have scheduled_date; 0 today-or-later.

## DATE-5 P2 — stranded branch not cherry-pickable
- Branch merge-base b1a760e6 (09-06) lacks main's windowed fetch (ab176c81, 4d850601, 46e2f944). c27ebbbf re-files on client only; on main the server window + belongsInWindow drop orders by created_at first. Needs scheduled_date in list columns + findWindow + belongsInWindow OR condition.

## DATE-6 P2 — "Tomorrow" button uses UTC date
- order-details-modal.tsx:905-907, use-order-crud.ts:685-693: new Date(); setDate(+1); toISOString().split('T')[0] → 00:00–02:59 Baghdad gives today. Active-state check line 919 same bug. Repo already has getLocalDateString (order-filter-utils.ts:180-183).

## DATE-7 P2 — future date in create-order silently dropped
- create-order-modal.tsx:138,470,620-624 always sends custom_created_at; use-order-crud.ts:525-539 fire-and-forget .update({created_at}) console.error only. Default = modal-open moment → every manual order backdated to modal-open time.

## DATE-8 P2 — migration drift for order dates
- 20260907134322 orders_schedule_not_created_at live; NOT on main (file on branches as 20260907164150 — version mismatch).
- 20260909214931 order_number_scan_ignores_created_at live; only on feat/flagship-template as 20260910003000.
- 20260910112715 orders_updated_at_trigger ≈ main's 20260822150000.
- Fresh env from main has no future-date guard. original_created_at comment says "only when corrected backwards" but prod sets on forward edits.

## Ruled out
RLS tenant_isolation_update tenant-only; column grants OK; no CHECK on dates; columns exist; other triggers uninvolved; no bulk/mobile date path; LF insert no rejections; date-range filter correct for UTC+3.
Incidental: 2026-10-08T22:50:58Z PATCH orders?id=eq.b3f05eba… → 500, 57014 statement timeout.

## Follow-ups for humans
Order 7509 confirmed, no postponement recorded. Order 7421 cancelled only because postpone failed.
