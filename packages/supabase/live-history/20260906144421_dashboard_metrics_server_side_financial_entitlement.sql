DO $mig$
DECLARE
  src text;
  old_decl text := '  v_days_elapsed   int;
  v_result jsonb;
BEGIN';
  new_decl text := '  v_days_elapsed   int;
  v_can_see_money  boolean;
  v_result jsonb;
BEGIN
  v_can_see_money := EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role IN (''admin'', ''super_admin'')
  );';
  old_recent text := '    FROM (SELECT o.* FROM public.orders o
          WHERE o.is_archived = false
            AND o.deleted_at IS NULL
            AND o.status <> ''pending_checkout''
          ORDER BY o.created_at DESC LIMIT 12) r';
  new_recent text := '    FROM (SELECT o.id, o.status, o.customer_name, o.city, o.price, o.created_at, o.items
          FROM public.orders o
          WHERE o.is_archived = false
            AND o.deleted_at IS NULL
            AND o.status <> ''pending_checkout''
          ORDER BY o.created_at DESC LIMIT 12) r';
  old_tail text := '  ) INTO v_result;
  RETURN v_result;
END;';
  new_tail text := '  ) INTO v_result;

  IF NOT v_can_see_money THEN
    v_result := jsonb_set(v_result, ''{todayStrip,revenueToday}'', ''null''::jsonb);
    v_result := jsonb_set(v_result, ''{todayStrip,revenueYesterday}'', ''null''::jsonb);
    v_result := jsonb_set(v_result, ''{todayStrip,revenueDelta}'', ''null''::jsonb);
    v_result := jsonb_set(v_result, ''{todayStrip,revenueDeltaPct}'', ''null''::jsonb);
    v_result := jsonb_set(v_result, ''{monthForecast,projectedRevenue}'', ''null''::jsonb);
    v_result := jsonb_set(v_result, ''{monthForecast,revenueThisMonth}'', ''null''::jsonb);

    v_result := jsonb_set(v_result, ''{weekOverWeek}'', (
      SELECT COALESCE(jsonb_agg(
        CASE WHEN e->>''isFinancial'' = ''true''
          THEN e || jsonb_build_object(''current'', NULL, ''previous'', NULL, ''delta'', NULL, ''deltaPct'', NULL)
          ELSE e END ORDER BY ord), ''[]''::jsonb)
      FROM jsonb_array_elements(v_result->''weekOverWeek'') WITH ORDINALITY AS x(e, ord)));

    v_result := jsonb_set(v_result, ''{enhancedLeaderboard,topProductsEnhanced}'', (
      SELECT COALESCE(jsonb_agg(e || jsonb_build_object(''revenue'', NULL) ORDER BY ord), ''[]''::jsonb)
      FROM jsonb_array_elements(v_result->''enhancedLeaderboard''->''topProductsEnhanced'') WITH ORDINALITY AS x(e, ord)));

    v_result := jsonb_set(v_result, ''{recentOrders}'', (
      SELECT COALESCE(jsonb_agg(e || jsonb_build_object(''price'', NULL) ORDER BY ord), ''[]''::jsonb)
      FROM jsonb_array_elements(v_result->''recentOrders'') WITH ORDINALITY AS x(e, ord)));
  END IF;

  RETURN v_result;
END;';
BEGIN
  src := pg_get_functiondef('public.get_dashboard_metrics(text)'::regprocedure);

  IF position(old_decl IN src) = 0 THEN RAISE EXCEPTION 'SEC-D2 aborted: declaration block not found'; END IF;
  IF position(old_recent IN src) = 0 THEN RAISE EXCEPTION 'SEC-D2 aborted: recent_orders block not found'; END IF;
  IF position(old_tail IN src) = 0 THEN RAISE EXCEPTION 'SEC-D2 aborted: result tail not found'; END IF;

  src := replace(src, old_decl, new_decl);
  src := replace(src, old_recent, new_recent);
  src := replace(src, old_tail, new_tail);

  EXECUTE src;
END
$mig$;;
