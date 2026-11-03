-- Products audit r34 #2 (F6): the link between a product's main category and
-- its "primary" curated-collection row only ran one way. Marking a
-- product_categories row primary set products.category_id, but moving a
-- product (editor, bulk "move to category", MCP) set only products.category_id
-- and left the old row flagged primary, so the two disagreed.
--
-- Now a change of products.category_id moves the primary flag too: the row for
-- the new category (if the product is already in that collection) becomes
-- primary, and any other primary row is cleared. Curated memberships are not
-- added or removed: they stay the merchant's own list.
--
-- SECURITY DEFINER so the flag always follows, even for a caller whose role may
-- move products but not edit collections; it touches only rows of the product
-- the caller was already allowed to change.
CREATE OR REPLACE FUNCTION public.follow_product_primary_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    UPDATE public.product_categories
       SET is_primary = false
     WHERE product_id = NEW.id
       AND is_primary
       AND category_id IS DISTINCT FROM NEW.category_id;

    IF NEW.category_id IS NOT NULL THEN
        UPDATE public.product_categories
           SET is_primary = true
         WHERE product_id = NEW.id
           AND category_id = NEW.category_id
           AND NOT is_primary;
    END IF;
    RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.follow_product_primary_category() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_follow_product_primary_category ON public.products;
CREATE TRIGGER trg_follow_product_primary_category
    AFTER UPDATE OF category_id ON public.products
    FOR EACH ROW
    WHEN (OLD.category_id IS DISTINCT FROM NEW.category_id)
    EXECUTE FUNCTION public.follow_product_primary_category();

-- One-time repair of rows that already disagree (1 live at time of writing).
UPDATE public.product_categories pc
   SET is_primary = false
  FROM public.products p
 WHERE p.id = pc.product_id
   AND pc.is_primary
   AND pc.category_id IS DISTINCT FROM p.category_id;
