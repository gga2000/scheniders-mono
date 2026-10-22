-- F-002 part 1 of 3 (see 20261020150100_product_child_tables_tenant_guard header): guard function.
CREATE OR REPLACE FUNCTION public.tg_product_child_tenant_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_row     jsonb := to_jsonb(NEW);
    v_col     text;
    v_pid     uuid;
    v_tenant  uuid;
    v_owner   uuid;
BEGIN
    -- TG_ARGV: the product-id columns of this table, e.g. 'product_id',
    -- 'child_product_id'. All of them must point at one tenant's products.
    FOREACH v_col IN ARRAY TG_ARGV LOOP
        v_pid := (v_row->>v_col)::uuid;
        IF v_pid IS NULL THEN CONTINUE; END IF;

        SELECT tenant_id INTO v_tenant FROM public.products WHERE id = v_pid;
        IF NOT FOUND OR v_tenant IS NULL THEN
            RAISE EXCEPTION '%.%: product % not found', TG_TABLE_NAME, v_col, v_pid
                USING ERRCODE = '23503';
        END IF;

        IF v_owner IS NULL THEN
            v_owner := v_tenant;
        ELSIF v_owner <> v_tenant THEN
            RAISE EXCEPTION '%: products % and % belong to different tenants', TG_TABLE_NAME, v_row->>TG_ARGV[0], v_pid
                USING ERRCODE = '42501';
        END IF;
    END LOOP;

    IF v_owner IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.tenant_id IS NULL THEN
        NEW := jsonb_populate_record(NEW, jsonb_build_object('tenant_id', v_owner));
    ELSIF NEW.tenant_id <> v_owner THEN
        RAISE EXCEPTION '%: product % belongs to a different tenant than the row', TG_TABLE_NAME, v_row->>TG_ARGV[0]
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_product_child_tenant_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_product_child_tenant_guard() TO service_role;
