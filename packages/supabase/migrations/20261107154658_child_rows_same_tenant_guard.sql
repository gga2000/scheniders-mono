-- Rows that point at another row (an order, a product, a shop...) must point
-- at one of their OWN store's rows. RLS checks the row's tenant_id but not
-- the parent it links to, so without this a store could hang notes, payments,
-- variants or till events on another store's order or product.

-- 342 delivery_import_items from 2026-10-17 were saved without a store id:
-- take it from their import.
UPDATE public.delivery_import_items ch
   SET tenant_id = p.tenant_id
  FROM public.delivery_imports p
 WHERE p.id = ch.import_id
   AND ch.tenant_id IS NULL;

-- TG_ARGV: child column, parent table, parent column, parent column type.
CREATE OR REPLACE FUNCTION public.enforce_parent_same_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ref    text := to_jsonb(NEW) ->> TG_ARGV[0];
  v_parent uuid;
BEGIN
  IF v_ref IS NULL THEN
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT tenant_id FROM public.%I WHERE %I = $1::%s', TG_ARGV[1], TG_ARGV[2], TG_ARGV[3])
     INTO v_parent
    USING v_ref;
  -- A child saved without a store id takes its parent's (some tenant_id
  -- columns are nullable and older code paths leave them empty).
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_parent;
  ELSIF v_parent IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'linked record belongs to another store' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enforce_parent_same_tenant() FROM PUBLIC, anon, authenticated;

-- One trigger per single-column link between two store-owned tables.
DO $mig$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname,
           c.conrelid::regclass AS child,
           ca.attname AS col,
           c.confrelid::regclass AS parent,
           pa.attname AS pcol,
           format_type(pa.atttypid, pa.atttypmod) AS ptype
      FROM pg_constraint c
      JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = c.conkey[1]
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
     WHERE c.contype = 'f'
       AND c.connamespace = 'public'::regnamespace
       AND array_length(c.conkey, 1) = 1
       AND c.confrelid <> 'public.tenants'::regclass
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.confrelid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER %I BEFORE INSERT OR UPDATE OF %I, tenant_id ON %s FOR EACH ROW EXECUTE FUNCTION public.enforce_parent_same_tenant(%L, %L, %L, %L)',
      left('same_tenant_' || r.conname, 63), r.col, r.child, r.col,
      (SELECT relname FROM pg_class WHERE oid = r.parent), r.pcol, r.ptype
    );
  END LOOP;
END
$mig$;
