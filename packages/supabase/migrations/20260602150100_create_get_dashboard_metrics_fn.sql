-- Server-side dashboard metrics: computes all 14 dashboard aggregations in SQL
-- (Asia/Baghdad timezone, JSONB items unnest) so the client receives a few KB
-- instead of fetching the entire orders table. SECURITY INVOKER → RLS scopes
-- per tenant. Mirrors apps/platform/lib/analytics/dashboard-calculations.ts.
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_range text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now            timestamp;        -- "now" in Baghdad local (naive)
  v_today_start    timestamp;        -- midnight Baghdad today
  v_yesterday_start timestamp;
  v_range_cutoff   timestamptz;      -- created_at >= cutoff (timestamptz space)
  v_use_cutoff     boolean := true;
  v_month_start    timestamp;
  v_days_in_month  int;
  v_days_elapsed   int;

  v_result jsonb;
BEGIN
  -- Baghdad "now" as naive local timestamp (mirrors browser local clock)
  v_now := (now() AT TIME ZONE 'Asia/Baghdad');
  v_today_start := date_trunc('day', v_now);
  v_yesterday_start := v_today_start - interval '1 day';
  v_month_start := date_trunc('month', v_now);
  v_days_in_month := EXTRACT(day FROM (date_trunc('month', v_now) + interval '1 month - 1 day'))::int;
  v_days_elapsed := GREATEST(1, EXTRACT(day FROM v_now)::int);

  -- working_set range filter on created_at (Asia/Baghdad), matches filterOrdersByDateRange
  IF p_range = 'today' THEN
    v_range_cutoff := (v_today_start AT TIME ZONE 'Asia/Baghdad');
  ELSIF p_range = '7d' THEN
    v_range_cutoff := now() - interval '7 days';
  ELSIF p_range = '30d' THEN
    v_range_cutoff := now() - interval '30 days';
  ELSE
    v_use_cutoff := false;  -- 'all'
  END IF;

  WITH
  ws AS (
    SELECT
      o.*,
      (o.created_at AT TIME ZONE 'Asia/Baghdad')              AS c_local,
      (COALESCE(o.updated_at, o.created_at) AT TIME ZONE 'Asia/Baghdad') AS u_local
    FROM public.orders o
    WHERE o.is_archived = false
      AND ( NOT v_use_cutoff OR o.created_at >= v_range_cutoff )
  ),

  -- ===================== URGENCY =====================
  urgency_base AS (
    SELECT
      count(*) FILTER (
        WHERE status = 'new' AND price > 100000
          AND c_local < (v_now - interval '24 hours')
      ) AS unconfirmed_high_value,
      count(*) FILTER (
        WHERE status = 'rejected'
          AND u_local > (v_now - interval '7 days')
      ) AS failed_deliveries,
      count(*) FILTER (
        WHERE status = 'in_transit'
          AND u_local < (v_now - interval '3 days')
      ) AS stuck_in_transit
    FROM ws
  ),
  city_stats AS (
    SELECT
      city,
      count(*) AS total,
      count(*) FILTER (WHERE status = 'rejected') AS rejected
    FROM ws
    WHERE city IS NOT NULL AND city <> ''   -- mirror JS if (!o.city) return; (drop NULL + '')
    GROUP BY city
  ),
  high_return_cities AS (
    SELECT jsonb_agg(
             jsonb_build_object('city', city, 'rate', rate)
             ORDER BY rate DESC, city
           ) AS arr
    FROM (
      SELECT city, (rejected::numeric / total) * 100 AS rate
      FROM city_stats
      WHERE total >= 5
        AND (rejected::numeric / total) * 100 > 30
      ORDER BY rate DESC
      LIMIT 3
    ) hrc
  ),
  city_rejection_stats AS (
    SELECT COALESCE(
      jsonb_object_agg(
        city,
        jsonb_build_object(
          'total', total,
          'rejected', rejected,
          'rate', floor((rejected::numeric / total) * 100 + 0.5)::int
        )
      ), '{}'::jsonb) AS obj
    FROM city_stats
  ),

  -- ===================== FUNNEL =====================
  funnel_base AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE status IN ('confirmed','in_transit','delivered','completed','rejected')) AS verified,
      count(*) FILTER (WHERE status IN ('in_transit','delivered','completed','rejected')) AS shipped,
      count(*) FILTER (WHERE status IN ('delivered','completed')) AS delivered
    FROM ws
  ),

  -- ===================== LEADERBOARD =====================
  lb_src AS (
    SELECT * FROM ws WHERE status NOT IN ('cancelled','rejected')
  ),
  lb_city AS (
    SELECT city, count(*)::numeric AS cnt
    FROM lb_src
    WHERE city IS NOT NULL AND city <> ''   -- mirror JS if (o.city) (drop NULL + '')
    GROUP BY city
  ),
  lb_top_cities AS (
    SELECT COALESCE(jsonb_agg(
             jsonb_build_object('id', city, 'label', city, 'value', cnt,
                                'trend', 0, 'rank', rn)
             ORDER BY rn
           ), '[]'::jsonb) AS arr
    FROM (
      SELECT city, cnt, row_number() OVER (ORDER BY cnt DESC) AS rn
      FROM lb_city ORDER BY cnt DESC LIMIT 5
    ) t
  ),
  prod_lines AS (
    SELECT
      elem->>'name' AS name,
      COALESCE((elem->>'quantity')::numeric, 1) AS qty,
      l.price / jsonb_array_length(l.items) AS rev_share
    FROM lb_src l,
         jsonb_array_elements(l.items) elem
    WHERE jsonb_typeof(l.items) = 'array'
  ),
  prod_stats AS (
    SELECT name, sum(qty) AS cnt, sum(rev_share) AS revenue
    FROM prod_lines
    GROUP BY name
  ),
  lb_top_products AS (
    SELECT COALESCE(jsonb_agg(
             jsonb_build_object('id', name, 'label', name, 'value', cnt,
                                'trend', 0, 'rank', rn)
             ORDER BY rn
           ), '[]'::jsonb) AS arr
    FROM (
      SELECT name, cnt, row_number() OVER (ORDER BY cnt DESC) AS rn
      FROM prod_stats ORDER BY cnt DESC LIMIT 5
    ) t
  ),
  lb_top_products_enh AS (
    SELECT COALESCE(jsonb_agg(
             jsonb_build_object('id', name, 'label', name, 'value', cnt,
                                'revenue', revenue, 'trend', 0, 'rank', rn)
             ORDER BY rn
           ), '[]'::jsonb) AS arr
    FROM (
      SELECT name, cnt, revenue, row_number() OVER (ORDER BY cnt DESC) AS rn
      FROM prod_stats ORDER BY cnt DESC LIMIT 5
    ) t
  ),

  -- ===================== TODAY STRIP =====================
  today_strip_base AS (
    SELECT
      count(*) FILTER (WHERE c_local >= v_today_start) AS orders_today,
      count(*) FILTER (WHERE c_local >= v_yesterday_start AND c_local < v_today_start) AS orders_yesterday,
      COALESCE(sum(price) FILTER (
        WHERE c_local >= v_today_start
          AND status IN ('confirmed','delivered','completed')
      ), 0) AS revenue_today,
      COALESCE(sum(price) FILTER (
        WHERE c_local >= v_yesterday_start AND c_local < v_today_start
          AND status IN ('confirmed','delivered','completed')
      ), 0) AS revenue_yesterday
    FROM ws
  ),

  -- ===================== PIPELINE =====================
  pipeline_counts AS (
    SELECT status, count(*) AS cnt FROM ws GROUP BY status
  ),
  pipeline_stages AS (
    SELECT * FROM (VALUES
      (1, 'new',        'New',        'var(--pastel-yellow)', '#78350f', 'pastel-card-yellow'),
      (2, 'contacted',  'Contacted',  'var(--pastel-blue)',   '#1e3a5f', 'pastel-card-blue'),
      (3, 'confirmed',  'Confirmed',  'var(--pastel-green)',  '#14532d', 'pastel-card-green'),
      (4, 'in_transit', 'In Transit', 'var(--pastel-mint)',   '#134e4a', 'pastel-card-mint'),
      (5, 'delivered',  'Delivered',  'var(--pastel-purple)', '#4c1d95', 'pastel-card-purple')
    ) AS s(ord, status, label, color, text_color, bg_class)
  ),
  pipeline AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'status', s.status, 'label', s.label,
        'count', COALESCE(c.cnt, 0),
        'color', s.color, 'textColor', s.text_color, 'bgClass', s.bg_class
      ) ORDER BY s.ord
    ) AS arr
    FROM pipeline_stages s
    LEFT JOIN pipeline_counts c ON c.status = s.status
  ),

  -- ===================== ORDERS PER HOUR (today) =====================
  oph_counts AS (
    SELECT EXTRACT(hour FROM c_local)::int AS h, count(*) AS cnt
    FROM ws
    WHERE c_local >= v_today_start
    GROUP BY 1
  ),
  oph AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'hour', g.h,
        'label', CASE
                   WHEN g.h = 0 THEN '12AM'
                   WHEN g.h < 12 THEN g.h::text || 'AM'
                   WHEN g.h = 12 THEN '12PM'
                   ELSE (g.h - 12)::text || 'PM'
                 END,
        'count', COALESCE(c.cnt, 0)
      ) ORDER BY g.h
    ) AS arr
    FROM generate_series(0,23) g(h)
    LEFT JOIN oph_counts c ON c.h = g.h
  ),

  -- ===================== PEAK HEATMAP (7d x 24h) =====================
  hm_counts AS (
    SELECT
      EXTRACT(dow FROM c_local)::int AS dow,   -- 0=Sun matches getDay()
      EXTRACT(hour FROM c_local)::int AS h,
      count(*) AS cnt
    FROM ws
    GROUP BY 1,2
  ),
  hm_max AS (
    SELECT GREATEST(1, COALESCE(max(cnt), 0))::numeric AS mx FROM hm_counts
  ),
  heatmap AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'dayOfWeek', d.dow,
        'hour', h.hr,
        'count', COALESCE(c.cnt, 0),
        'intensity', COALESCE(c.cnt, 0)::numeric / (SELECT mx FROM hm_max)
      ) ORDER BY d.dow, h.hr
    ) AS arr
    FROM generate_series(0,6) d(dow)
    CROSS JOIN generate_series(0,23) h(hr)
    LEFT JOIN hm_counts c ON c.dow = d.dow AND c.h = h.hr
  ),

  -- ===================== DELIVERY RATE =====================
  dr_spark AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'day', to_char(day_start, 'Dy'),
        'rate', (
          SELECT CASE WHEN count(*) FILTER (
                        WHERE status IN ('delivered','completed','rejected')) = 0
                      THEN 0
                 ELSE floor(
                   count(*) FILTER (WHERE status IN ('delivered','completed'))::numeric
                   / count(*) FILTER (WHERE status IN ('delivered','completed','rejected'))
                   * 100 + 0.5)::int
                 END
          FROM ws
          WHERE u_local >= day_start AND u_local < day_start + interval '1 day'
            AND status IN ('delivered','completed','rejected')
        )
      ) ORDER BY i
    ) AS arr
    FROM (
      SELECT i, (v_today_start - make_interval(days => (6 - i))) AS day_start
      FROM generate_series(0,6) i
    ) days
  ),
  dr_window AS (
    SELECT
      (SELECT CASE WHEN count(*) FILTER (WHERE status IN ('delivered','completed','rejected'))=0 THEN 0
              ELSE floor(count(*) FILTER (WHERE status IN ('delivered','completed'))::numeric
                   / count(*) FILTER (WHERE status IN ('delivered','completed','rejected')) * 100 + 0.5)::int END
       FROM ws WHERE u_local >= v_now - interval '7 days' AND u_local < v_now
         AND status IN ('delivered','completed','rejected')) AS current_rate,
      (SELECT CASE WHEN count(*) FILTER (WHERE status IN ('delivered','completed','rejected'))=0 THEN 0
              ELSE floor(count(*) FILTER (WHERE status IN ('delivered','completed'))::numeric
                   / count(*) FILTER (WHERE status IN ('delivered','completed','rejected')) * 100 + 0.5)::int END
       FROM ws WHERE u_local >= v_now - interval '14 days' AND u_local < v_now - interval '7 days'
         AND status IN ('delivered','completed','rejected')) AS prev_rate
  ),

  -- ===================== AVG TIME PER STAGE =====================
  cycle_times AS (
    -- delivered_at is naive (already Baghdad-local); created_at -> c_local (naive Baghdad)
    SELECT EXTRACT(epoch FROM (delivered_at - c_local)) / 3600.0 AS h
    FROM ws
    WHERE status IN ('delivered','completed') AND delivered_at IS NOT NULL
  ),
  cycle_agg AS (
    SELECT COALESCE(avg(h), 0) AS avg_h, count(*) AS n
    FROM cycle_times WHERE h > 0 AND h < 720
  ),
  transit_times AS (
    SELECT EXTRACT(epoch FROM (v_now - u_local)) / 3600.0 AS h
    FROM ws WHERE status = 'in_transit'
  ),
  transit_agg AS (
    SELECT COALESCE(avg(h), 0) AS avg_h, count(*) AS n
    FROM transit_times WHERE h < 720
  ),
  pending_times AS (
    SELECT EXTRACT(epoch FROM (v_now - c_local)) / 3600.0 AS h
    FROM ws WHERE status IN ('new','contacted')
  ),
  pending_agg AS (
    SELECT COALESCE(avg(h), 0) AS avg_h, count(*) AS n
    FROM pending_times WHERE h < 720
  ),
  avg_time_per_stage AS (
    SELECT jsonb_build_array(
      jsonb_build_object('label','New → Delivered (full cycle)','avgHours',(SELECT avg_h FROM cycle_agg),'sampleSize',(SELECT n FROM cycle_agg)),
      jsonb_build_object('label','Pending response (avg age)','avgHours',(SELECT avg_h FROM pending_agg),'sampleSize',(SELECT n FROM pending_agg)),
      jsonb_build_object('label','In transit (avg wait)','avgHours',(SELECT avg_h FROM transit_agg),'sampleSize',(SELECT n FROM transit_agg))
    ) AS arr
  ),

  -- ===================== WEEK OVER WEEK =====================
  wow_sets AS (
    SELECT
      count(*) FILTER (WHERE c_local >= v_now - interval '7 days') AS cur_orders,
      count(*) FILTER (WHERE c_local >= v_now - interval '14 days' AND c_local < v_now - interval '7 days') AS prev_orders,
      count(*) FILTER (WHERE c_local >= v_now - interval '7 days' AND status IN ('delivered','completed','rejected')) AS cur_term,
      count(*) FILTER (WHERE c_local >= v_now - interval '7 days' AND status IN ('delivered','completed')) AS cur_succ,
      count(*) FILTER (WHERE c_local >= v_now - interval '14 days' AND c_local < v_now - interval '7 days' AND status IN ('delivered','completed','rejected')) AS prev_term,
      count(*) FILTER (WHERE c_local >= v_now - interval '14 days' AND c_local < v_now - interval '7 days' AND status IN ('delivered','completed')) AS prev_succ,
      COALESCE(sum(price) FILTER (WHERE c_local >= v_now - interval '7 days' AND status IN ('confirmed','delivered','completed')),0) AS cur_rev,
      COALESCE(sum(price) FILTER (WHERE c_local >= v_now - interval '14 days' AND c_local < v_now - interval '7 days' AND status IN ('confirmed','delivered','completed')),0) AS prev_rev
    FROM ws
  ),
  wow AS (
    SELECT
      cur_orders, prev_orders,
      CASE WHEN cur_term=0 THEN 0 ELSE floor(cur_succ::numeric/cur_term*100+0.5)::int END AS cur_rate,
      CASE WHEN prev_term=0 THEN 0 ELSE floor(prev_succ::numeric/prev_term*100+0.5)::int END AS prev_rate,
      cur_rev, prev_rev
    FROM wow_sets
  ),
  wow_arr AS (
    SELECT jsonb_build_array(
      jsonb_build_object(
        'label','Orders','current',cur_orders,'previous',prev_orders,
        'delta',cur_orders-prev_orders,
        'deltaPct', CASE WHEN prev_orders>0 THEN floor((cur_orders-prev_orders)::numeric/prev_orders*100+0.5)::int ELSE NULL END,
        'isFinancial',false
      ),
      jsonb_build_object(
        'label','Delivery Rate','current',cur_rate,'previous',prev_rate,
        'delta',cur_rate-prev_rate,'deltaPct',NULL,'isFinancial',false,'unit','%'
      ),
      jsonb_build_object(
        'label','Revenue','current',cur_rev,'previous',prev_rev,
        'delta',cur_rev-prev_rev,
        'deltaPct', CASE WHEN prev_rev>0 THEN floor((cur_rev-prev_rev)::numeric/prev_rev*100+0.5)::int ELSE NULL END,
        'isFinancial',true
      )
    ) AS arr
    FROM wow
  ),

  -- ===================== MONTH FORECAST =====================
  month_base AS (
    SELECT
      count(*) FILTER (WHERE c_local >= v_month_start) AS orders_month,
      COALESCE(sum(price) FILTER (WHERE c_local >= v_month_start AND status IN ('confirmed','delivered','completed')),0) AS revenue_month
    FROM ws
  ),
  month_forecast AS (
    SELECT jsonb_build_object(
      'projectedOrders', floor((orders_month::numeric / v_days_elapsed) * v_days_in_month + 0.5)::int,
      'projectedRevenue', floor((revenue_month::numeric / v_days_elapsed) * v_days_in_month + 0.5)::int,
      'daysElapsed', v_days_elapsed,
      'daysInMonth', v_days_in_month,
      'ordersThisMonth', orders_month,
      'revenueThisMonth', revenue_month,
      'ordersPerDay', orders_month::numeric / v_days_elapsed
    ) AS obj
    FROM month_base
  ),

  -- ===================== STAFF LEADERBOARD =====================
  staff_stats AS (
    SELECT
      last_status_changed_by_name AS name,
      count(*) FILTER (WHERE u_local >= v_today_start) AS today_cnt,
      count(*) FILTER (WHERE u_local >= v_now - interval '7 days') AS week_cnt
    FROM ws
    WHERE last_status_changed_by_name IS NOT NULL
      AND btrim(last_status_changed_by_name) <> ''   -- mirror JS name.trim() === ''
    GROUP BY last_status_changed_by_name
  ),
  staff_lb AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'name', name, 'ordersToday', today_cnt, 'ordersThisWeek', week_cnt, 'rank', rn
      ) ORDER BY rn
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT name, today_cnt, week_cnt,
             row_number() OVER (ORDER BY today_cnt DESC, week_cnt DESC) AS rn
      FROM staff_stats
      WHERE week_cnt > 0
      ORDER BY today_cnt DESC, week_cnt DESC
      LIMIT 8
    ) t
  ),

  -- ===================== RECENT ORDERS (NOT range-filtered) =====================
  recent_orders AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb) AS arr
    FROM (
      SELECT o.*
      FROM public.orders o
      WHERE o.is_archived = false
      ORDER BY o.created_at DESC
      LIMIT 12
    ) r
  )

  SELECT jsonb_build_object(
    'urgency', jsonb_build_object(
      'failedDeliveries', (SELECT failed_deliveries FROM urgency_base),
      'unconfirmedHighValue', (SELECT unconfirmed_high_value FROM urgency_base),
      'stuckInTransit', (SELECT stuck_in_transit FROM urgency_base),
      'highReturnCities', COALESCE((SELECT arr FROM high_return_cities), '[]'::jsonb),
      'cityRejectionStats', (SELECT obj FROM city_rejection_stats)
    ),
    'funnel', (
      SELECT jsonb_build_array(
        jsonb_build_object('id','1','label','All Orders','value',total,'fill','#E4C1F9'),
        jsonb_build_object('id','2','label','Verified','value',verified,'fill','#A6C8FF'),
        jsonb_build_object('id','3','label','Shipped','value',shipped,'fill','#FBE38E'),
        jsonb_build_object('id','4','label','Delivered','value',delivered,'fill','#C0EBA6')
      ) FROM funnel_base
    ),
    'leaderboard', jsonb_build_object(
      'topCities', (SELECT arr FROM lb_top_cities),
      'topProducts', (SELECT arr FROM lb_top_products)
    ),
    'todayStrip', (
      SELECT jsonb_build_object(
        'ordersToday', orders_today,
        'revenueToday', revenue_today,
        'ordersYesterday', orders_yesterday,
        'revenueYesterday', revenue_yesterday,
        'ordersDelta', orders_today - orders_yesterday,
        'revenueDelta', revenue_today - revenue_yesterday,
        'ordersDeltaPct', CASE WHEN orders_yesterday > 0
              THEN floor((orders_today - orders_yesterday)::numeric / orders_yesterday * 100 + 0.5)::int ELSE NULL END,
        'revenueDeltaPct', CASE WHEN revenue_yesterday > 0
              THEN floor((revenue_today - revenue_yesterday)::numeric / revenue_yesterday * 100 + 0.5)::int ELSE NULL END
      ) FROM today_strip_base
    ),
    'pipeline', (SELECT arr FROM pipeline),
    'ordersPerHour', (SELECT arr FROM oph),
    'peakHeatmap', (SELECT arr FROM heatmap),
    'deliveryRate', jsonb_build_object(
      'currentRate', (SELECT current_rate FROM dr_window),
      'sparkline', COALESCE((SELECT arr FROM dr_spark), '[]'::jsonb),
      'trend', (SELECT current_rate - prev_rate FROM dr_window)
    ),
    'avgTimePerStage', (SELECT arr FROM avg_time_per_stage),
    'weekOverWeek', (SELECT arr FROM wow_arr),
    'monthForecast', (SELECT obj FROM month_forecast),
    'enhancedLeaderboard', jsonb_build_object(
      'topCities', (SELECT arr FROM lb_top_cities),
      'topProducts', (SELECT arr FROM lb_top_products),
      'topProductsEnhanced', (SELECT arr FROM lb_top_products_enh)
    ),
    'staffLeaderboard', (SELECT arr FROM staff_lb),
    'recentOrders', (SELECT arr FROM recent_orders)
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(text) TO authenticated;
