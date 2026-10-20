-- Prevent the duplicate-district defect from recurring: one district per (governorate, folded
-- name), where folding removes the definite article and normalises ة/ه and أ/إ/آ/ء. Both
-- functions are IMMUTABLE, so they are indexable.
CREATE UNIQUE INDEX IF NOT EXISTS iraq_districts_gov_folded_name_key
    ON iraq_districts (governorate_code, waseet_strip_article(waseet_search_key(name_ar)));
