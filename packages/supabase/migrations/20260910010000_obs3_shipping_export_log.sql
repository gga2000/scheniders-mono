-- OBS-3, the shipping half: make shipping-submission failure rate answerable.
--
-- The earlier OBS-3 migration left this open, on the reading that outcomes were
-- not recorded because `waseet_api_logs` held 46 rows against 759 shipped
-- orders. Checked properly against live data, the reason is different and the
-- log is not the gap:
--
--   * `waseet_api_logs` contains NO `create_order` rows at all — only lookups
--     (citys, regions, package-sizes, statuses) and get_merchant_invoices. The
--     API submission route exists but has never successfully created an order.
--   * What merchants actually use is a FILE export: the orders page builds a
--     Prime CSV or an Al-Waseet XLSX, hands it to the operator, and records a
--     `print_batches` row. 999 orders carry a delivery_order_id and every one of
--     them arrived that way.
--   * `print_batches` is only written when the export SUCCEEDS. A failed export
--     showed a toast and left nothing behind, so the failure rate of the path in
--     use is not merely unreliable — it is unrecorded.
--
-- This records every attempt, including the two distinct ways one fails: the
-- file itself could not be produced, or the file reached the operator but the
-- batch could not be recorded. Those are different incidents and conflating
-- them would misstate the rate.
--
-- No customer data: order ids only, like order_deletion_log (OBS-2).
--
-- DOWN MIGRATION:
--   DROP VIEW IF EXISTS public.v_shipping_export_outcomes;
--   DROP FUNCTION IF EXISTS public.log_shipping_export(uuid, text, integer, boolean, text, text);
--   DROP TABLE IF EXISTS public.shipping_export_log;

CREATE TABLE IF NOT EXISTS public.shipping_export_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  exported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  company text NOT NULL CHECK (company IN ('prime', 'waseet')),
  order_count integer NOT NULL CHECK (order_count > 0),
  succeeded boolean NOT NULL,
  -- Which half failed. NULL when the attempt succeeded.
  --   'file'         the CSV/XLSX could not be produced; nothing left the app.
  --   'batch_record' the operator has the file, but the batch row was not saved.
  failure_stage text CHECK (failure_stage IN ('file', 'batch_record')),
  error_message text,
  CONSTRAINT shipping_export_log_stage_matches_outcome
    CHECK ((succeeded AND failure_stage IS NULL) OR (NOT succeeded AND failure_stage IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_shipping_export_log_tenant_created_at
  ON public.shipping_export_log (tenant_id, created_at DESC);

ALTER TABLE public.shipping_export_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY shipping_export_log_tenant_select
  ON public.shipping_export_log
  FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- No INSERT/UPDATE/DELETE policy: rows are written only through the function
-- below, so an operator cannot amend their own record of what happened.

/**
 * Record one shipping-export attempt.
 *
 * The tenant is VALIDATED, not trusted: the caller passes the tenant it believes
 * it is acting for and the function refuses unless the caller is a member. This
 * runs as the definer, so it must never take a client-supplied tenant on faith.
 *
 * `auth.role()`, not `current_user` — inside a SECURITY DEFINER function
 * `current_user` is the owner, so a `current_user <> 'service_role'` guard is
 * always true and guards nothing. That mistake has already been made in this
 * schema once.
 */
CREATE OR REPLACE FUNCTION public.log_shipping_export(
  p_tenant_id uuid,
  p_company text,
  p_order_count integer,
  p_succeeded boolean,
  p_failure_stage text DEFAULT NULL,
  p_error_message text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RAISE EXCEPTION 'log_shipping_export records what a signed-in operator did; call it as that operator';
  END IF;

  IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT get_user_tenant_ids()) THEN
    RAISE EXCEPTION 'not a member of tenant %', p_tenant_id;
  END IF;

  INSERT INTO public.shipping_export_log (
    tenant_id, exported_by, company, order_count, succeeded, failure_stage, error_message
  ) VALUES (
    p_tenant_id, auth.uid(), p_company, p_order_count, p_succeeded, p_failure_stage,
    -- A provider message can be long and is not worth storing in full.
    left(p_error_message, 500)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_shipping_export(uuid, text, integer, boolean, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_shipping_export(uuid, text, integer, boolean, text, text) TO authenticated;

CREATE OR REPLACE VIEW public.v_shipping_export_outcomes
WITH (security_invoker = true) AS
SELECT l.tenant_id,
       l.company,
       (timezone('Asia/Baghdad', l.created_at))::date          AS day,
       count(*)                                                AS attempts,
       count(*) FILTER (WHERE l.succeeded)                     AS succeeded,
       count(*) FILTER (WHERE NOT l.succeeded)                 AS failed,
       count(*) FILTER (WHERE l.failure_stage = 'file')        AS failed_producing_file,
       count(*) FILTER (WHERE l.failure_stage = 'batch_record') AS failed_recording_batch,
       sum(l.order_count) FILTER (WHERE l.succeeded)           AS orders_exported
  FROM public.shipping_export_log l
 GROUP BY l.tenant_id, l.company, (timezone('Asia/Baghdad', l.created_at))::date;

COMMENT ON VIEW public.v_shipping_export_outcomes IS
  'Shipping export attempts and failures per company per day, bucketed on Asia/Baghdad. '
  'security_invoker: RLS applies to the caller. See OBS-3.';
