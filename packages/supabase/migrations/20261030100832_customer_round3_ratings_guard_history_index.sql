-- Customers page, round 3 database fixes (R3-05, R3-06).
--
--   * Ratings: an UPDATE could rewrite rater_id, tenant_id or another
--     member's stars, and deleting a rating left its ±10 in the trust score.
--     Now the author and store of a rating (and of a link) never change after
--     insert, only the author can edit or delete their rating (restrictive
--     policies on top of the store policy), and a delete rescores the customer.
--   * get_customer_order_history filtered all of a store's orders (~96 ms,
--     551 ms cold) because the tenant and phone were function calls inside the
--     WHERE. It now resolves both first, so the planner uses
--     idx_orders_tenant_normphone.

CREATE OR REPLACE FUNCTION public.community_ratings_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        NEW.tenant_id := OLD.tenant_id;
        NEW.rater_id := OLD.rater_id;
    ELSE
        NEW.rater_id := auth.uid();
    END IF;
    NEW.customer_phone := public.normalize_phone_for_search(NEW.customer_phone);
    NEW.rater_store_id := NEW.tenant_id;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.customer_links_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    a text := public.normalize_phone_for_search(NEW.phone_a);
    b text := public.normalize_phone_for_search(NEW.phone_b);
BEGIN
    IF a = '' OR b = '' OR a = b THEN
        RAISE EXCEPTION 'a link needs two different valid phones' USING ERRCODE = '22023';
    END IF;
    NEW.phone_a := least(a, b);
    NEW.phone_b := greatest(a, b);
    IF TG_OP = 'UPDATE' THEN
        NEW.tenant_id := OLD.tenant_id;
        NEW.linked_by := OLD.linked_by;
    ELSE
        NEW.linked_by := auth.uid();
    END IF;
    RETURN NEW;
END;
$function$;

CREATE POLICY community_ratings_author_updates ON public.community_ratings
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (rater_id = auth.uid());

CREATE POLICY community_ratings_author_deletes ON public.community_ratings
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (rater_id = auth.uid());

CREATE OR REPLACE FUNCTION public.trigger_update_trust_on_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.calculate_customer_trust(OLD.tenant_id, OLD.customer_phone);
        RETURN OLD;
    END IF;
    PERFORM public.calculate_customer_trust(NEW.tenant_id, NEW.customer_phone);
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE TRIGGER trg_update_trust_ratings
    AFTER INSERT OR UPDATE OR DELETE ON public.community_ratings
    FOR EACH ROW EXECUTE FUNCTION public.trigger_update_trust_on_rating();

CREATE OR REPLACE FUNCTION public.get_customer_order_history(p_phone text)
RETURNS TABLE(
    id uuid, order_id text, created_at timestamptz, status text, is_return boolean,
    items jsonb, price numeric, discount_amount numeric, delivery_fee numeric,
    payment_status text, notes text, customer_name text, city text,
    governorate_code text, address_details text, secondary_phone text
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_phone text := public.normalize_phone_for_search(
        translate(COALESCE(p_phone, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'));
BEGIN
    IF v_phone = '' THEN RETURN; END IF;
    RETURN QUERY
    SELECT o.id, o.order_id, o.created_at, o.status, COALESCE(o.is_return, false),
           o.items, o.price, o.discount_amount, o.delivery_fee,
           o.payment_status, o.notes, o.customer_name, o.city,
           o.governorate_code, o.address_details, o.secondary_phone
      FROM public.orders o
     WHERE o.tenant_id = v_tenant
       AND public.normalize_phone_for_search(o.phone) = v_phone
       AND o.deleted_at IS NULL
       AND NOT COALESCE(o.is_archived, false)
       AND NOT COALESCE(o.is_test, false)
       AND o.status <> 'pending_checkout';
END;
$function$;