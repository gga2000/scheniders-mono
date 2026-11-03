-- Restoring an archived category used to publish it, even when it was a draft
-- before: a draft archived and then undone went live on the storefront. The
-- database now remembers the status a category had when it was archived, and
-- the app restores to that.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS status_before_archive text;

CREATE OR REPLACE FUNCTION public.remember_category_status_before_archive()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived' THEN
        NEW.status_before_archive := OLD.status;
    ELSIF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM 'archived' THEN
        NEW.status_before_archive := NULL;
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.remember_category_status_before_archive() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_categories_status_before_archive ON public.categories;
CREATE TRIGGER trg_categories_status_before_archive
    BEFORE UPDATE OF status ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.remember_category_status_before_archive();
