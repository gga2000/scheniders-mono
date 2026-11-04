-- Stock taken in person (orders.take_kind) is not a sale: keep it out of the
-- sales counts, conversion, revenue charts, bestseller ranks and the public
-- store stats. Money pages read orders directly, so a take's product cost and
-- any price it was paid at still show there.
--
-- Each function is rewritten from its live definition with one exact text
-- anchor; the block aborts if an anchor is not found exactly the expected
-- number of times, so a changed function can never be patched silently wrong.
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

SELECT pg_temp.patch_fn('public.get_orders_panel_stats(uuid,date,date,time without time zone,text,text,text,text,boolean,text)',
  ARRAY[ARRAY[E'AND COALESCE(o.is_test, false) = false', E'AND COALESCE(o.is_test, false) = false\n      AND o.take_kind IS NULL', '1']]);

SELECT pg_temp.patch_fn('public.get_orders_aggregates(uuid,date,date,text,text,text,text,boolean,text)',
  ARRAY[
    ARRAY[E'AND (_date_from IS NULL', E'AND (CASE WHEN _order_type = ''take'' THEN o.take_kind IS NOT NULL ELSE o.take_kind IS NULL END)\n           AND (_date_from IS NULL', '1'],
    ARRAY[E'OR (_order_type = ''refund'' AND o.is_return = true)', E'OR (_order_type = ''take'')\n                OR (_order_type = ''refund'' AND o.is_return = true)', '1']
  ]);

SELECT pg_temp.patch_fn('public.get_dashboard_monthly_sales(uuid,integer)',
  ARRAY[ARRAY[E'AND o.status <> ''pending_checkout''', E'AND o.status <> ''pending_checkout''\n      AND o.take_kind IS NULL', '1']]);

SELECT pg_temp.patch_fn('public.get_product_sales(uuid)',
  ARRAY[ARRAY[E'AND NOT COALESCE(o.is_test, false)', E'AND NOT COALESCE(o.is_test, false)\n           AND o.take_kind IS NULL', '1']]);

SELECT pg_temp.patch_fn('public.refresh_tenant_public_stats()',
  ARRAY[ARRAY[E'AND coalesce(o.is_test, false) = false', E'AND coalesce(o.is_test, false) = false\n        AND o.take_kind IS NULL', '1']]);

SELECT pg_temp.patch_fn('public.refresh_bestseller_ranks(integer,integer)',
  ARRAY[ARRAY[E'AND it ? ''product_id''', E'AND o.take_kind IS NULL\n      AND it ? ''product_id''', '1']]);

SELECT pg_temp.patch_fn('public.get_dashboard_metrics(text)',
  ARRAY[
    ARRAY[E'WHERE o.is_archived = false\n      AND o.deleted_at IS NULL\n      AND o.status <> ''pending_checkout''', E'WHERE o.is_archived = false\n      AND o.deleted_at IS NULL\n      AND o.take_kind IS NULL\n      AND o.status <> ''pending_checkout''', '1'],
    ARRAY[E'WHERE o.is_archived = false\n            AND o.deleted_at IS NULL\n            AND o.status <> ''pending_checkout''', E'WHERE o.is_archived = false\n            AND o.deleted_at IS NULL\n            AND o.take_kind IS NULL\n            AND o.status <> ''pending_checkout''', '1']
  ]);
