-- A leading administrative type word (قضاء / ناحية / بلدية / مركز) labels the unit rather than
-- naming it, so it must not make two rows for the same place look distinct:
-- "قضاء الصويرة" and "الصويرة" are one qadha.
CREATE OR REPLACE FUNCTION public.iraq_district_identity_key(p_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = public, pg_temp AS $$
  SELECT waseet_strip_article(waseet_search_key(
           regexp_replace(p_name, '^\s*(قضاء|ناحية|ناحيه|بلدية|بلديه|مركز)\s+', '')));
$$;;
