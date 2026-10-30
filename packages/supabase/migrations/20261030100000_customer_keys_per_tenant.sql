-- Blacklist and customer metadata are keyed per store, on the normalized phone.
--
-- Both tables had a primary key on the phone alone. One store blocking a number
-- stopped every other store from blocking it (and the duplicate-key error told
-- them someone else had), and the AI-summary route's service-role upsert on
-- `customer_phone` could move another store's metadata row to the caller's store.
-- Phones were also stored in whatever shape the caller sent (07…, +9647…, 7…),
-- so Lightfunnels intake compared +9647… against a stored 07… and never matched.
--
-- Now: a BEFORE trigger stores the phone as normalize_phone_for_search(phone)
-- (7XXXXXXXXX) whatever shape a writer sends, tenant_id is required, and the key
-- is (tenant_id, phone).

CREATE OR REPLACE FUNCTION public.blacklist_normalize_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    NEW.phone := public.normalize_phone_for_search(NEW.phone);
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.customer_metadata_normalize_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    NEW.customer_phone := public.normalize_phone_for_search(NEW.customer_phone);
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.blacklist_normalize_phone() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_metadata_normalize_phone() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_blacklist_normalize_phone
    BEFORE INSERT OR UPDATE OF phone ON public.blacklist
    FOR EACH ROW EXECUTE FUNCTION public.blacklist_normalize_phone();

CREATE OR REPLACE TRIGGER trg_customer_metadata_normalize_phone
    BEFORE INSERT OR UPDATE OF customer_phone ON public.customer_metadata
    FOR EACH ROW EXECUTE FUNCTION public.customer_metadata_normalize_phone();

-- Existing rows into the normalized shape (1 blacklist row, 0 metadata rows today).
UPDATE public.blacklist SET phone = phone;
UPDATE public.customer_metadata SET customer_phone = customer_phone;

ALTER TABLE public.blacklist ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.blacklist DROP CONSTRAINT blacklist_pkey;
ALTER TABLE public.blacklist ADD CONSTRAINT blacklist_pkey PRIMARY KEY (tenant_id, phone);

ALTER TABLE public.customer_metadata ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.customer_metadata DROP CONSTRAINT customer_metadata_pkey;
ALTER TABLE public.customer_metadata ADD CONSTRAINT customer_metadata_pkey PRIMARY KEY (tenant_id, customer_phone);
