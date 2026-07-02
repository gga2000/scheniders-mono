-- Two-axis customer model — shared IMMUTABLE helpers.
--
-- The customers console used to collapse customer VALUE and COD RISK into ONE
-- "reliability" tier, with a binary "any bad event ever => Risky/Watch forever"
-- rule that over-flagged ~38% of customers and buried great repeat buyers behind
-- a single stale hiccup. We split them into two independent axes:
--
--   VALUE  (loyalty / volume) — by COMPLETED (delivered) orders.
--   RISK   (COD trust)        — recency- and pattern-weighted, NOT binary.
--
-- These two functions are the single source of truth for both axes. Every RPC
-- (get_paginated_customers, get_customer_dashboard_stats, get_customer_reliability)
-- calls them, and the TypeScript lib mirrors them exactly, so the cards, the
-- filter chips, the KPI strip and the order-creation warning can never disagree.
--
-- severe   = rejected + no_response + returned (RTO costs the merchant round-trip
--            shipping, so it ranks with refusals/ghosts).
-- moderate = cancelled + refund (friction, usually pre-shipment).
-- recent   = the event happened within the last 6 months (caller decides the window
--            when counting; these helpers just take the recent sub-counts).

CREATE OR REPLACE FUNCTION public.value_tier_calc(p_completed integer)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE
        WHEN COALESCE(p_completed, 0) >= 3 THEN 'vip'
        WHEN COALESCE(p_completed, 0) = 2 THEN 'good'
        ELSE 'newcomer'
    END;
$$;

CREATE OR REPLACE FUNCTION public.risk_level_calc(
    p_severe integer,
    p_recent_severe integer,
    p_moderate integer,
    p_recent_moderate integer,
    p_blocked boolean
)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE
        WHEN COALESCE(p_blocked, false) THEN 'blocked'
        WHEN COALESCE(p_recent_severe, 0) >= 2
             OR (COALESCE(p_severe, 0) >= 3 AND COALESCE(p_recent_severe, 0) >= 1) THEN 'high'
        WHEN COALESCE(p_recent_severe, 0) = 1
             OR COALESCE(p_recent_moderate, 0) >= 1
             OR (COALESCE(p_severe, 0) + COALESCE(p_moderate, 0)) >= 2 THEN 'caution'
        ELSE 'clean'
    END;
$$;
