-- Named order tags (Ali, 2026-11-02): each store defines tags such as "VIP" or
-- "call back", each with a colour; an order carries any number of them; cards
-- show them and the list filters by them. Replaces the unnamed tag_color dot
-- (2 orders used it; the column stays for old data).
--
-- order_tags holds the store's tags. orders.tag_ids holds the tags on an order:
-- an array keeps the orders list a single select and its filter a GIN lookup.
-- A trigger keeps tag_ids to tags of the order's own store, and deleting a tag
-- removes it from every order of that store.

CREATE TABLE IF NOT EXISTS public.order_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 24),
  color public.tag_color NOT NULL DEFAULT 'blue',
  created_by uuid DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS order_tags_tenant_name_key
  ON public.order_tags (tenant_id, lower(btrim(name)));

ALTER TABLE public.order_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_tags_select ON public.order_tags;
CREATE POLICY order_tags_select ON public.order_tags
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS order_tags_insert ON public.order_tags;
CREATE POLICY order_tags_insert ON public.order_tags
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids())
              AND public.has_tenant_permission(tenant_id, 'orders.edit'));

DROP POLICY IF EXISTS order_tags_update ON public.order_tags;
CREATE POLICY order_tags_update ON public.order_tags
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT public.get_user_tenant_ids())
         AND public.has_tenant_permission(tenant_id, 'orders.edit'))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids())
              AND public.has_tenant_permission(tenant_id, 'orders.edit'));

DROP POLICY IF EXISTS order_tags_delete ON public.order_tags;
CREATE POLICY order_tags_delete ON public.order_tags
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT public.get_user_tenant_ids())
         AND public.has_tenant_permission(tenant_id, 'orders.edit'));

REVOKE ALL ON public.order_tags FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_tags TO authenticated;

-- A tag never moves to another store.
CREATE OR REPLACE FUNCTION public.order_tags_keep_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'a tag cannot move to another store' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_order_tags_keep_tenant ON public.order_tags;
CREATE TRIGGER trg_order_tags_keep_tenant
  BEFORE UPDATE OF tenant_id ON public.order_tags
  FOR EACH ROW EXECUTE FUNCTION public.order_tags_keep_tenant();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tag_ids uuid[] NOT NULL DEFAULT '{}';

GRANT SELECT (tag_ids) ON public.orders TO authenticated;

CREATE INDEX IF NOT EXISTS orders_tag_ids_gin ON public.orders USING gin (tag_ids);

-- tag_ids holds each tag once, and only tags of the order's own store.
CREATE OR REPLACE FUNCTION public.orders_tag_ids_valid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.tag_ids IS NULL OR cardinality(NEW.tag_ids) = 0 THEN
    NEW.tag_ids := '{}';
    RETURN NEW;
  END IF;
  NEW.tag_ids := ARRAY(SELECT DISTINCT unnest(NEW.tag_ids));
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.tag_ids) AS t(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.order_tags g WHERE g.id = t.id AND g.tenant_id = NEW.tenant_id)
  ) THEN
    RAISE EXCEPTION 'tag_ids must be tags of this store' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_tag_ids_valid ON public.orders;
CREATE TRIGGER trg_orders_tag_ids_valid
  BEFORE INSERT OR UPDATE OF tag_ids, tenant_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_tag_ids_valid();

-- Deleting a tag takes it off every order of its store.
CREATE OR REPLACE FUNCTION public.order_tags_detach_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.orders
     SET tag_ids = array_remove(tag_ids, OLD.id)
   WHERE tenant_id = OLD.tenant_id
     AND tag_ids @> ARRAY[OLD.id];
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_order_tags_detach_on_delete ON public.order_tags;
CREATE TRIGGER trg_order_tags_detach_on_delete
  AFTER DELETE ON public.order_tags
  FOR EACH ROW EXECUTE FUNCTION public.order_tags_detach_on_delete();

REVOKE EXECUTE ON FUNCTION public.orders_tag_ids_valid() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_tags_detach_on_delete() FROM PUBLIC, anon, authenticated;
