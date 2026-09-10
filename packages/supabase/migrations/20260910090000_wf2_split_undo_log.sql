-- WF-2 (split half): split had no undo.
--
-- Unlike merge, split CREATES an order: it rewrites the original to the kept
-- items, forces it to 'delivered', and inserts a new return order for the
-- returned items. Reversing it therefore has to decide what happens to that
-- return order, which is why this was left as a product question.
--
-- The answer taken here is the conservative one: undo is offered only while the
-- return order is untouched — still 'rejected', never submitted to a courier,
-- and not refunded. Once anyone has acted on it, reversing would contradict
-- something that already happened in the real world, so the undo refuses and
-- says why rather than guessing.
--
-- As with the merge log, the snapshot holds only the columns split overwrites,
-- not whole rows, so no customer data is duplicated.

CREATE TABLE IF NOT EXISTS public.order_split_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  original_order_id uuid NOT NULL,
  return_order_id uuid NOT NULL,
  original_before jsonb NOT NULL,
  split_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_order_split_log_tenant_split_at
  ON public.order_split_log (tenant_id, split_at DESC);

ALTER TABLE public.order_split_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_split_log_tenant_select
  ON public.order_split_log
  FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

COMMENT ON TABLE public.order_split_log IS
  'Pre-split values of the columns split_order_atomic overwrites, plus the id of '
  'the return order it created, so a split can be undone while that return is '
  'still untouched. Holds no customer identity data. See WF-2.';
