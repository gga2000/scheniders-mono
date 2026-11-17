-- A lead's phones, tags and branches are saved whole; a save that changes
-- one no longer undoes a colleague's change to it (staff console audit, round
-- 11 workflow finding 6, P3).
--
-- The lead form sends only the fields this person changed (#1372), but a list
-- that changed is sent whole, from the copy read when the form opened. Noor
-- adds the tag "called twice" while Ali's form is open; Ali adds a phone and
-- a tag and saves: his tags, read before Noor's, replace hers, and nothing
-- says so.
--
-- admin_edit_lead takes the lists as the form opened them (_was, optional:
-- phone_numbers, tags, branches). Under the lead's lock, a list stored now
-- that differs from it was changed meanwhile: nothing is saved, no row is
-- written, and the answer names the lists ('stale'), which the console says
-- in words. Without _was, as before. Everything else is the live body
-- (md5 of prosrc 1f3749f2..., equal to migration 20261117105714).
--
-- The new argument has a default, so the console deployed before this keeps
-- calling it with four named arguments. The old signature is dropped in the
-- same transaction, so there is one function to choose.
--
-- Rollback: DROP FUNCTION public.admin_edit_lead(uuid, jsonb, uuid, text,
-- jsonb); then run migration 20261117105714 again.

DROP FUNCTION public.admin_edit_lead(uuid, jsonb, uuid, text);

CREATE FUNCTION public.admin_edit_lead(
    _lead_id uuid,
    _changes jsonb,
    _admin_user_id uuid DEFAULT NULL::uuid,
    _actor_email text DEFAULT NULL::text,
    _was jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    -- The lead form's fields (apps/admin lib/lead-update.ts, less status and owner).
    _editable CONSTANT text[] := ARRAY[
        'merchant_name', 'industry_id', 'industry_detail', 'platform', 'platform_url', 'handle',
        'follower_count', 'post_count', 'management_name', 'management_info', 'page_phone',
        'phone_numbers', 'contact_via_dm', 'website_url', 'email', 'avg_view_count',
        'avg_like_count', 'avg_comments_count', 'avg_order_count', 'address', 'city',
        'governorate_code', 'is_online_only', 'branches', 'priority', 'tags',
        'source_campaign', 'source_medium', 'is_draft'
    ];
    -- Saved whole: a save that changes one sends it as the form opened it.
    _lists CONSTANT text[] := ARRAY['phone_numbers', 'tags', 'branches'];
    _bad text;
    _old public.leads;
    _new public.leads;
    _changed text[];
    _stale text[];
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_edit_lead is service-role only' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(_changes) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'admin_edit_lead takes an object of fields' USING ERRCODE = '22023';
    END IF;
    SELECT k INTO _bad FROM jsonb_object_keys(_changes) AS k WHERE k <> ALL (_editable) LIMIT 1;
    IF _bad IS NOT NULL THEN
        RAISE EXCEPTION 'admin_edit_lead cannot change %', _bad USING ERRCODE = '22023';
    END IF;
    IF _was IS NOT NULL AND jsonb_typeof(_was) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'admin_edit_lead takes the lists as they opened as an object' USING ERRCODE = '22023';
    END IF;
    SELECT k INTO _bad FROM jsonb_object_keys(coalesce(_was, '{}'::jsonb)) AS k WHERE k <> ALL (_lists) LIMIT 1;
    IF _bad IS NOT NULL THEN
        RAISE EXCEPTION 'admin_edit_lead compares only %, not %', array_to_string(_lists, ', '), _bad USING ERRCODE = '22023';
    END IF;

    SELECT * INTO _old FROM public.leads WHERE id = _lead_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false, 'changed', '[]'::jsonb);
    END IF;

    -- A list that is not as the form opened it was changed by a colleague
    -- meanwhile: saving this one whole would undo their change, so nothing
    -- is saved. No list (null) reads as an empty one.
    SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO _stale
    FROM jsonb_object_keys(coalesce(_was, '{}'::jsonb)) AS k
    WHERE coalesce(nullif(to_jsonb(_old) -> k, 'null'::jsonb), '[]'::jsonb)
          IS DISTINCT FROM coalesce(nullif(_was -> k, 'null'::jsonb), '[]'::jsonb);
    IF cardinality(_stale) > 0 THEN
        RETURN jsonb_build_object('found', true, 'changed', '[]'::jsonb, 'stale', to_jsonb(_stale));
    END IF;

    _new := jsonb_populate_record(_old, _changes);
    SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO _changed
    FROM jsonb_object_keys(_changes) AS k
    WHERE to_jsonb(_old) -> k IS DISTINCT FROM to_jsonb(_new) -> k;

    IF cardinality(_changed) > 0 THEN
        UPDATE public.leads SET
            merchant_name = _new.merchant_name,
            industry_id = _new.industry_id,
            industry_detail = _new.industry_detail,
            platform = _new.platform,
            platform_url = _new.platform_url,
            handle = _new.handle,
            follower_count = _new.follower_count,
            post_count = _new.post_count,
            management_name = _new.management_name,
            management_info = _new.management_info,
            page_phone = _new.page_phone,
            phone_numbers = _new.phone_numbers,
            contact_via_dm = _new.contact_via_dm,
            website_url = _new.website_url,
            email = _new.email,
            avg_view_count = _new.avg_view_count,
            avg_like_count = _new.avg_like_count,
            avg_comments_count = _new.avg_comments_count,
            avg_order_count = _new.avg_order_count,
            address = _new.address,
            city = _new.city,
            governorate_code = _new.governorate_code,
            is_online_only = _new.is_online_only,
            branches = _new.branches,
            priority = _new.priority,
            tags = _new.tags,
            source_campaign = _new.source_campaign,
            source_medium = _new.source_medium,
            is_draft = _new.is_draft
        WHERE id = _lead_id;

        INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, action, details)
        VALUES (
            _admin_user_id, _actor_email, 'edit_lead',
            jsonb_build_object('lead_id', _lead_id, 'merchant_name', _new.merchant_name, 'fields', to_jsonb(_changed))
            || CASE WHEN 'merchant_name' = ANY (_changed)
                    THEN jsonb_build_object('was', _old.merchant_name) ELSE '{}'::jsonb END
        );
    END IF;

    RETURN jsonb_build_object('found', true, 'changed', to_jsonb(_changed));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_edit_lead(uuid, jsonb, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_edit_lead(uuid, jsonb, uuid, text, jsonb) TO service_role;