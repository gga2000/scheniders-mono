CREATE TABLE IF NOT EXISTS public.shipping_export_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  exported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  company text NOT NULL CHECK (company IN ('prime', 'waseet')),
  order_count integer NOT NULL CHECK (order_count > 0),
  succeeded boolean NOT NULL,
  failure_stage text CHECK (failure_stage IN ('file', 'batch_record')),
  error_message text,
  CONSTRAINT shipping_export_log_stage_matches_outcome
    CHECK ((succeeded AND failure_stage IS NULL) OR (NOT succeeded AND failure_stage IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_shipping_export_log_tenant_created_at
  ON public.shipping_export_log (tenant_id, created_at DESC);

ALTER TABLE public.shipping_export_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shipping_export_log_tenant_select ON public.shipping_export_log;
CREATE POLICY shipping_export_log_tenant_select
  ON public.shipping_export_log
  FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

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
  'Shipping export attempts and failures per company per day, bucketed on Asia/Baghdad. security_invoker: RLS applies to the caller. See OBS-3.';

COMMENT ON TABLE public.shipping_export_log IS
  'Every shipping-export attempt and its outcome. Holds no customer data. See OBS-3.';;
