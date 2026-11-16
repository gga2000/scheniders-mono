-- Fermi B9 (slow database queries), part 2d: the dashboard's best sellers and
-- stage times.
--
-- After part 2c, get_dashboard_metrics('all') still took ~110 ms on the
-- biggest store (5,600 orders). Timing each part on live showed two heavy ones:
--   * Best sellers (~25 ms): every line's share of its order's price was worked
--     out by dividing its gross by the order's gross, even for an order with a
--     single line (93% of orders), where that share is the whole price. Such an
--     order's line now takes the price as it is; the order total is added up
--     only for orders with more lines, whose shares are worked out as before.
--   * Stage times (~15 ms): the full-cycle hours of each delivered order were
--     worked out again at each of the seven places that read them, because
--     Postgres pastes a simple sub-query's formula into every reader.
--     cycle_times is now worked out once and kept (MATERIALIZED).
-- Same answer: on live (the biggest store), every range (all, 30d, 7d, today)
-- gave the same numbers everywhere. The only change in the reply: a best
-- seller's revenue made only of single-line orders prints without trailing
-- zeros (73500, not 73500.00000000000000000000). 'all' ~110 -> ~86 ms.
-- Built from the live body (part 2c's text), like the rounds before it: each
-- part must be found exactly once and exactly as part 2c left it, or this
-- migration fails.

DO $b9$
DECLARE
    v_def text;
    v_prod_old constant text := $q$  prod_lines_weighted AS (
    -- Each line's share of what the customer paid, by its gross over the
    -- order's gross (else an even split): the order total sits beside its lines.
    SELECT e.name, e.qty,
      CASE WHEN tot.lines_total > 0
           THEN l.price * (e.line_gross / tot.lines_total)
           ELSE l.price / NULLIF(jsonb_array_length(l.items), 0)
      END AS rev_share
    FROM lb_src l
    CROSS JOIN LATERAL (
      SELECT elem->>'name' AS name,
        COALESCE((elem->>'quantity')::numeric, 1) AS qty,
        COALESCE((elem->>'price')::numeric, 0) * COALESCE((elem->>'quantity')::numeric, 1) AS line_gross
      FROM jsonb_array_elements(l.items) elem
    ) e
    CROSS JOIN LATERAL (
      SELECT sum(COALESCE((x->>'price')::numeric, 0) * COALESCE((x->>'quantity')::numeric, 1)) AS lines_total
      FROM jsonb_array_elements(l.items) x
    ) tot
    WHERE jsonb_typeof(l.items) = 'array'
  ),
$q$;
    v_prod_new constant text := $q$  prod_lines_weighted AS (
    -- Each line's share of what the customer paid. An order's only line takes
    -- the whole price. With more lines, a line's share is its gross over the
    -- order's gross (else an even split); only those orders add up their gross.
    SELECT e.name, e.qty,
      CASE WHEN jsonb_array_length(l.items) = 1 THEN l.price
           WHEN tot.lines_total > 0
           THEN l.price * (e.line_gross / tot.lines_total)
           ELSE l.price / NULLIF(jsonb_array_length(l.items), 0)
      END AS rev_share
    FROM lb_src l
    CROSS JOIN LATERAL (
      SELECT elem->>'name' AS name,
        COALESCE((elem->>'quantity')::numeric, 1) AS qty,
        COALESCE((elem->>'price')::numeric, 0) * COALESCE((elem->>'quantity')::numeric, 1) AS line_gross
      FROM jsonb_array_elements(l.items) elem
    ) e
    CROSS JOIN LATERAL (
      SELECT sum(COALESCE((x->>'price')::numeric, 0) * COALESCE((x->>'quantity')::numeric, 1)) AS lines_total
      FROM jsonb_array_elements(l.items) x
      WHERE jsonb_array_length(l.items) > 1
    ) tot
    WHERE jsonb_typeof(l.items) = 'array'
  ),
$q$;
    v_cycle_old constant text := '  cycle_times AS (';
    v_cycle_new constant text := '  cycle_times AS MATERIALIZED (';
BEGIN
    v_def := pg_get_functiondef('public.get_dashboard_metrics(text,uuid)'::regprocedure);

    -- a. Best sellers: a single-line order's line takes the whole price.
    IF array_length(string_to_array(v_def, v_prod_old), 1) <> 2 THEN
        RAISE EXCEPTION 'B9: the dashboard best-seller part is not the one part 2c left';
    END IF;
    v_def := replace(v_def, v_prod_old, v_prod_new);

    -- b. Stage times: each delivered order's cycle hours worked out once.
    IF array_length(string_to_array(v_def, v_cycle_old), 1) <> 2 THEN
        RAISE EXCEPTION 'B9: the dashboard cycle-time part was not found exactly once';
    END IF;
    v_def := replace(v_def, v_cycle_old, v_cycle_new);

    EXECUTE v_def;
END
$b9$;