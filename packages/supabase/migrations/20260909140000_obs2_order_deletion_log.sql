-- OBS-2: order deletions had no queryable audit trail.
--
-- The delete route already wrote to a `deletion_log` table, but that table was
-- never created: its migration (packages/supabase/migrations/add-deletion-log.sql)
-- carried no timestamp prefix so it was never applied, and the route swallowed
-- the resulting insert error as a console warning. Every deletion has therefore
-- been recorded only in ephemeral function logs.
--
-- That old draft is deliberately NOT applied as written. It had no tenant_id,
-- no RLS, and stored a full `order_snapshots` JSONB — a second copy of customer
-- names, phones and addresses in an unprotected table. Orders here are
-- SOFT-deleted (deleted_at is set and a cron purges after 30 days), so the order
-- row itself remains the recovery path and a snapshot buys no recoverability.
-- This table therefore records who deleted what and when, plus the human-readable
-- order numbers staff need to identify the batch, and no personal data.

CREATE TABLE IF NOT EXISTS public.order_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_by_email text,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  order_count integer NOT NULL CHECK (order_count > 0),
  order_ids uuid[] NOT NULL,
  -- Human-readable order numbers (orders.order_id), so an operator can see what
  -- a batch contained without joining to rows that may since have been purged.
  order_numbers text[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_order_deletion_log_tenant_deleted_at
  ON public.order_deletion_log (tenant_id, deleted_at DESC);

ALTER TABLE public.order_deletion_log ENABLE ROW LEVEL SECURITY;

-- Readable by members of the tenant it belongs to, on the same basis as orders.
CREATE POLICY order_deletion_log_tenant_select
  ON public.order_deletion_log
  FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- Writes come from the delete route under the service role only. An audit row a
-- user could forge or amend would not be worth having, so no INSERT, UPDATE or
-- DELETE policy exists for ordinary callers.

COMMENT ON TABLE public.order_deletion_log IS
  'Who deleted which orders, and when. Deliberately holds no customer data: '
  'orders are soft-deleted, so the order row remains the recovery path. See OBS-2.';
