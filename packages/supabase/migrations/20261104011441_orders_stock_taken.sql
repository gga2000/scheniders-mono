-- Stock taken in person (staff, owner, friend, samples). A take is an order
-- born 'completed' with no phone: the existing stock trigger drops the units
-- (open-box pile included). take_kind marks it so sales counts can skip it.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS take_kind text CHECK (take_kind IN ('staff','owner','friend','sample','other')),
  ADD COLUMN IF NOT EXISTS taken_by text;
GRANT SELECT (take_kind, taken_by) ON public.orders TO authenticated;

CREATE INDEX IF NOT EXISTS idx_orders_take_kind ON public.orders (tenant_id) WHERE take_kind IS NOT NULL;

-- Only the create function sets it: a browser may not turn a sale into a take.
CREATE OR REPLACE FUNCTION public.orders_take_server_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND (NEW.take_kind IS DISTINCT FROM OLD.take_kind OR NEW.taken_by IS DISTINCT FROM OLD.taken_by) THEN
    RAISE EXCEPTION 'take_kind is set by the server' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_take_server_only ON public.orders;
CREATE TRIGGER trg_orders_take_server_only
  BEFORE UPDATE OF take_kind, taken_by ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_take_server_only();


-- create_order_atomic is patched from its live definition (other work adds
-- columns to it), not replaced from a copy.
CREATE OR REPLACE FUNCTION pg_temp.patch_fn(_sig text, _edits text[][])
RETURNS void
LANGUAGE plpgsql
AS $patch$
DECLARE
  _def text;
  _i int;
  _n int;
BEGIN
  _def := pg_get_functiondef(_sig::regprocedure);
  FOR _i IN 1 .. array_length(_edits, 1) LOOP
    _n := (length(_def) - length(replace(_def, _edits[_i][1], ''))) / length(_edits[_i][1]);
    IF _n <> _edits[_i][3]::int THEN
      RAISE EXCEPTION 'patch %: anchor % found % times, expected %', _sig, _i, _n, _edits[_i][3];
    END IF;
    _def := replace(_def, _edits[_i][1], _edits[_i][2]);
  END LOOP;
  EXECUTE _def;
END;
$patch$;

SELECT pg_temp.patch_fn('public.create_order_atomic(jsonb,uuid)',
  ARRAY[
    ARRAY[E'_created_via text;', E'_created_via text; _take_kind text; _taken_by text;', '1'],
    ARRAY[E'  -- F-041: per-tenant', E'  -- Stock taken in person (staff, owner, friend, sample): no customer, no\n  -- courier, already done. The kind is checked here; the stock trigger drops\n  -- the units because the order is born completed.\n  _take_kind := NULLIF(_order_data->>''take_kind'', '''');\n  IF _take_kind IS NOT NULL THEN\n    IF _take_kind NOT IN (''staff'',''owner'',''friend'',''sample'',''other'') THEN\n      RAISE EXCEPTION ''unknown take_kind %'', _take_kind USING ERRCODE = ''22023'';\n    END IF;\n    _taken_by := NULLIF(btrim(_order_data->>''taken_by''), '''');\n    IF _taken_by IS NULL AND _take_kind <> ''sample'' THEN\n      RAISE EXCEPTION ''taken_by is required'' USING ERRCODE = ''22023'';\n    END IF;\n    IF COALESCE(_order_data->>''status'', '''') <> ''completed'' THEN\n      RAISE EXCEPTION ''a take is recorded as completed'' USING ERRCODE = ''22023'';\n    END IF;\n  END IF;\n\n  -- F-041: per-tenant', '1'],
    ARRAY[E'is_gift, created_via', E'is_gift, take_kind, taken_by, created_via', '1'],
    ARRAY[E', false), _created_via', E', false), _take_kind, _taken_by, _created_via', '1']
  ]);
