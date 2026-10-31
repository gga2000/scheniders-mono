-- Customer search folds Arabic letters on both sides
-- (normalize_arabic_text_for_search(col) ILIKE normalize_arabic_text_for_search(pattern)),
-- which made every search a full scan that re-folded each row (about 220-300 ms
-- at 4.6k customers, growing linearly). These trigram indexes store the folded
-- name and city, so a search reads only the matching rows.
CREATE INDEX IF NOT EXISTS idx_mv_customer_metrics_name_folded_trgm
    ON public.mv_customer_metrics
    USING gin (public.normalize_arabic_text_for_search(latest_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_mv_customer_metrics_city_folded_trgm
    ON public.mv_customer_metrics
    USING gin (public.normalize_arabic_text_for_search(latest_city) gin_trgm_ops);