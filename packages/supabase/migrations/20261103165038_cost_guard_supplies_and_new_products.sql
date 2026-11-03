-- Cost guard: let staff who edit products keep doing the two cost writes the
-- editor asks of them. 20261103160203 extended the guard to INSERT and to
-- product_suppliers, which refused both for the employee role:
--   1. a starting cost typed on a NEW product or variant (the create form
--      shows the cost field to everyone who can add products);
--   2. any cost on a SUPPLY (packaging, vials): product_costs already shows
--      supply cost to products.edit, so they manage it too.
-- Changing the cost of an existing sellable product still needs cost access.
CREATE OR REPLACE FUNCTION public.guard_cost_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_col text;
    v_new jsonb;
    v_row jsonb := to_jsonb(NEW);
    v_is_supply boolean;
BEGIN
    -- Only direct writes from the API roles are guarded; the owner-run
    -- functions (receive, cost RPCs, order snapshots) are trusted.
    IF current_user NOT IN ('authenticated', 'anon') THEN
        RETURN NEW;
    END IF;
    IF public.can_see_product_cost(NEW.tenant_id) THEN
        RETURN NEW;
    END IF;
    IF public.has_tenant_permission(NEW.tenant_id, 'products.edit') THEN
        IF TG_TABLE_NAME = 'products' THEN
            v_is_supply := coalesce((v_row ->> 'is_supply')::boolean, false);
        ELSE
            SELECT p.is_supply INTO v_is_supply
            FROM public.products p
            WHERE p.id = (v_row ->> 'product_id')::uuid
              AND p.tenant_id = NEW.tenant_id;
        END IF;
        IF coalesce(v_is_supply, false) THEN
            RETURN NEW;
        END IF;
        IF TG_OP = 'INSERT' AND TG_TABLE_NAME IN ('products', 'product_variants') THEN
            RETURN NEW;
        END IF;
    END IF;
    FOREACH v_col IN ARRAY TG_ARGV LOOP
        v_new := v_row -> v_col;
        IF TG_OP = 'INSERT' THEN
            -- A new row may start blank; it may not start with a cost.
            IF v_new IS NOT NULL AND v_new NOT IN ('null'::jsonb, '0'::jsonb, '{}'::jsonb, '[]'::jsonb) THEN
                RAISE EXCEPTION 'not allowed to change cost' USING ERRCODE = '42501';
            END IF;
        ELSIF v_new IS DISTINCT FROM to_jsonb(OLD) -> v_col THEN
            RAISE EXCEPTION 'not allowed to change cost' USING ERRCODE = '42501';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$function$;
