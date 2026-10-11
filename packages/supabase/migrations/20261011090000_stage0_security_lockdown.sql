-- Stage 0 security lockdown (orders reliability audit, 2026-10-11).
--
-- Every self-serve signup is an authenticated user, so anything below that was
-- reachable by `authenticated` was reachable by anyone on the internet.

-- 1. Backups bucket: every tenant's daily orders/customers CSV was readable,
--    overwritable and deletable by any authenticated user. Platform admins only;
--    the backup cron writes with the service role, which bypasses RLS.
DROP POLICY IF EXISTS "Allow authenticated full access to vault_backups" ON storage.objects;
CREATE POLICY "Platform admins manage vault_backups" ON storage.objects
    FOR ALL TO authenticated
    USING (
        bucket_id = 'vault_backups'
        AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = 'super_admin')
    )
    WITH CHECK (
        bucket_id = 'vault_backups'
        AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = 'super_admin')
    );

-- 2. current_tenant_id was writable to any tenant id. Service-role routes trust
--    it, so it may only point at a tenant the user actively belongs to.
ALTER POLICY user_update_own_profile ON public.user_profiles
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND (current_tenant_id IS NULL OR current_tenant_id IN (SELECT public.get_user_tenant_ids()))
    );

-- 3. Roles are a closed set; super_admin must never be minted by a route bug.
ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_role_check
    CHECK (role IS NULL OR role IN ('super_admin', 'admin', 'employee', 'viewer'));

-- 4. SECURITY DEFINER functions with no caller check. None of these has a
--    browser caller: inv_apply runs from triggers (as the owner), the rest are
--    called with the service role or by cron. Grants were via PUBLIC, so revoke
--    from PUBLIC as well as the API roles.
REVOKE EXECUTE ON FUNCTION public.inv_apply(uuid, jsonb, text, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_usage_tracking(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_order_usage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_customer_aggregates() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.adjust_customer_points(uuid, text, integer, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.iraq_flag_ambiguous_placements() FROM PUBLIC, anon, authenticated;

-- 5. zero_oversold / recompute_inventory have a browser caller (the products
--    page passes its own tenant), so they keep EXECUTE but now refuse a NULL or
--    foreign tenant from an API caller. NULL used to rewrite every tenant.
CREATE OR REPLACE FUNCTION public.zero_oversold(p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
       AND (p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids())) THEN
        RAISE EXCEPTION 'not a member of this tenant' USING ERRCODE = '42501';
    END IF;

    UPDATE public.products
       SET stock_quantity = reserved_quantity
     WHERE NOT is_supply AND reserved_quantity > stock_quantity
       AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

    UPDATE public.product_variants
       SET stock_quantity = reserved_quantity
     WHERE reserved_quantity > stock_quantity
       AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

    INSERT INTO public.inventory_ledger(tenant_id, product_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    VALUES (p_tenant_id, NULL, NULL, 0, 0, 0, 'zero_oversold');
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_inventory(p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
       AND (p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids())) THEN
        RAISE EXCEPTION 'not a member of this tenant' USING ERRCODE = '42501';
    END IF;

    IF p_tenant_id IS NULL THEN
        UPDATE public.products         SET reserved_quantity = 0;
        UPDATE public.product_variants SET reserved_quantity = 0;
    ELSE
        UPDATE public.products         SET reserved_quantity = 0 WHERE tenant_id = p_tenant_id;
        UPDATE public.product_variants SET reserved_quantity = 0 WHERE tenant_id = p_tenant_id;
    END IF;

    UPDATE public.products p SET reserved_quantity = sub.qty
      FROM (
        SELECT (e->>'product_id')::uuid AS pid,
               SUM(round((e->>'quantity')::numeric)::integer) AS qty
          FROM public.orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) e
         WHERE o.status = 'confirmed'
           AND (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
           AND nullif(e->>'variant_id','') IS NULL
           AND COALESCE((e->>'is_open_box')::boolean, false) = false
           AND nullif(e->>'product_id','') IS NOT NULL
           AND (e->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         GROUP BY 1
      ) sub
     WHERE p.id = sub.pid AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id);

    UPDATE public.product_variants pv SET reserved_quantity = sub.qty
      FROM (
        SELECT (e->>'variant_id')::uuid AS vid,
               SUM(round((e->>'quantity')::numeric)::integer) AS qty
          FROM public.orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) e
         WHERE o.status = 'confirmed'
           AND (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
           AND COALESCE((e->>'is_open_box')::boolean, false) = false
           AND nullif(e->>'variant_id','') IS NOT NULL
           AND (e->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         GROUP BY 1
      ) sub
     WHERE pv.id = sub.vid AND (p_tenant_id IS NULL OR pv.tenant_id = p_tenant_id);

    INSERT INTO public.inventory_ledger(tenant_id, product_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    VALUES (p_tenant_id, NULL, NULL, 0, 0, 0, 'recompute:reserved');
END;
$function$;
