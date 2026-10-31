-- Printing page: record a print run atomically, scoped to the caller's active store.
--
-- The page used to insert print_history from the browser without tenant_id, which the
-- tenant_isolation_insert policy rejects, and swallowed the error: no print has been
-- recorded since the multi-tenant migration. It then ran one UPDATE per order with a
-- read-modify-write print_count. This replaces both with one transaction.
--
-- DOWN MIGRATION:
--   DROP FUNCTION IF EXISTS public.record_print_run(uuid[], text, text, text, text);

CREATE OR REPLACE FUNCTION public.record_print_run(
    p_order_ids uuid[],
    p_print_type text,
    p_label_size text,
    p_batch_name text,
    p_invoice_template text DEFAULT 'prime'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant uuid;
    v_ids uuid[];
    v_found integer;
    v_batch uuid;
BEGIN
    IF auth.role() = 'service_role' THEN
        RAISE EXCEPTION 'record_print_run records what a signed-in operator printed; call it as that operator';
    END IF;

    v_tenant := public.require_current_tenant();

    IF p_print_type NOT IN ('label', 'invoice') THEN
        RAISE EXCEPTION 'unknown print type %', p_print_type USING ERRCODE = '22023';
    END IF;

    SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_order_ids) AS x;
    IF v_ids IS NULL OR cardinality(v_ids) = 0 OR cardinality(v_ids) > 500 THEN
        RAISE EXCEPTION 'a print run needs between 1 and 500 orders' USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_found
      FROM public.orders o
     WHERE o.id = ANY (v_ids) AND o.tenant_id = v_tenant;
    IF v_found <> cardinality(v_ids) THEN
        RAISE EXCEPTION 'some orders are not in this store' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.print_batches (
        tenant_id, name, order_count, total_value, cities, order_ids, invoice_template, print_type
    )
    SELECT v_tenant,
           left(p_batch_name, 120),
           cardinality(v_ids),
           coalesce(sum(o.price), 0),
           coalesce(array_agg(DISTINCT o.city) FILTER (WHERE o.city IS NOT NULL), '{}'),
           v_ids,
           p_invoice_template,
           CASE p_print_type WHEN 'label' THEN 'labels' ELSE 'invoice' END
      FROM public.orders o
     WHERE o.id = ANY (v_ids) AND o.tenant_id = v_tenant
    RETURNING id INTO v_batch;

    INSERT INTO public.print_history (tenant_id, order_id, batch_id, print_type, label_size, printed_by)
    SELECT v_tenant, x, v_batch, p_print_type, p_label_size, auth.uid()::text
      FROM unnest(v_ids) AS x;

    UPDATE public.orders o
       SET printed_at = now(),
           print_count = coalesce(o.print_count, 0) + 1,
           last_batch_id = v_batch
     WHERE o.id = ANY (v_ids) AND o.tenant_id = v_tenant;

    RETURN v_batch;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_print_run(uuid[], text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_print_run(uuid[], text, text, text, text) TO authenticated;
