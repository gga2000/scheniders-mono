-- WF-2: merge had no undo. It is the most destructive action on the page —
-- it sums two orders' money into one and archives the other — and nothing
-- recorded what the rows looked like beforehand, so the change was permanent.
--
-- This records a pre-merge snapshot inside the same transaction as the merge,
-- and adds an inverse operation that restores from it.
--
-- The snapshot deliberately holds ONLY the columns merge_orders_atomic actually
-- overwrites, not whole rows. A full row snapshot would duplicate customer name,
-- phone and address into another table for no undo benefit — the same reasoning
-- applied to the deletion log in OBS-2.

CREATE TABLE IF NOT EXISTS public.order_merge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  keep_order_id uuid NOT NULL,
  archive_order_id uuid NOT NULL,
  -- Only the merge-affected columns of each side.
  keep_before jsonb NOT NULL,
  archive_before jsonb NOT NULL,
  merged_by text,
  merged_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_order_merge_log_tenant_merged_at
  ON public.order_merge_log (tenant_id, merged_at DESC);

ALTER TABLE public.order_merge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_merge_log_tenant_select
  ON public.order_merge_log
  FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- Written and consumed only by the SECURITY DEFINER functions below.

COMMENT ON TABLE public.order_merge_log IS
  'Pre-merge values of the columns merge_orders_atomic overwrites, so a merge '
  'can be undone. Holds no customer identity data. See WF-2.';;
