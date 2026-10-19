-- Pin search_path on the bom_items updated_at trigger function so it's not
-- vulnerable to search_path poisoning (security linter warning 0011).
CREATE OR REPLACE FUNCTION bom_items_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
;
