-- =============================================
-- Restore realtime delivery for new-order alerts + the order-activity dropdown.
--
-- Symptom: new orders stopped triggering the in-app sound + desktop notification
-- and the notifications dropdown stopped live-updating. Root cause: on the NEW
-- Supabase project, `orders` and `order_notifications` were never added to the
-- `supabase_realtime` publication, so the client postgres_changes subscriptions
-- (use-order-realtime → orders INSERT; use-order-activity-notifications →
-- order_notifications) received zero events.
--
-- Safety: both tables have tenant-scoped SELECT RLS (tenant_isolation_select:
-- tenant_id IN (SELECT get_user_tenant_ids())). Realtime postgres_changes
-- enforces SELECT RLS per subscriber, so each user only receives changes for
-- their own tenant — no cross-tenant leak.
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_notifications;

-- FULL replica identity so UPDATE/DELETE events carry the whole row (the
-- order-activity feed needs old/new for read-status sync + correct RLS
-- evaluation on updates). order_notifications is low-volume so the WAL cost is
-- negligible. `orders` intentionally stays at default replica identity: the
-- new-order alert is an INSERT (NEW row is always present + carries tenant_id
-- for RLS), and FULL would add WAL overhead on the hot order-update path.
ALTER TABLE public.order_notifications REPLICA IDENTITY FULL;
