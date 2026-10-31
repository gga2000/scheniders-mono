-- Customers F1: customer_metadata (manual VIP/regular status) was writable by
-- any store member; it needs customers.edit like the sibling tables.
CREATE POLICY customer_metadata_need_edit_insert ON public.customer_metadata
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (public.has_tenant_permission(tenant_id, 'customers.edit'));
CREATE POLICY customer_metadata_need_edit_update ON public.customer_metadata
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'customers.edit'));
CREATE POLICY customer_metadata_need_edit_delete ON public.customer_metadata
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'customers.edit'));

-- Customers F3: assignments are normalised on write, so the tag filter can
-- compare the phone directly and use the unique index.
DO $$
DECLARE
    v_def text;
BEGIN
    v_def := pg_get_functiondef('public.get_paginated_customers(text,text,text,text,boolean,integer,integer,bigint,bigint,integer,text,text,integer,integer,text,text,integer,integer,boolean)'::regprocedure);
    IF position('normalize_phone_for_search(cta.customer_phone) = bq.customer_phone' IN v_def) = 0 THEN
        RAISE EXCEPTION 'get_paginated_customers tag clause not found';
    END IF;
    v_def := replace(v_def, 'normalize_phone_for_search(cta.customer_phone) = bq.customer_phone', 'cta.customer_phone = bq.customer_phone');
    EXECUTE v_def;
END
$$;
