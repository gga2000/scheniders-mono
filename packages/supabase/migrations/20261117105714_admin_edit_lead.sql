-- Staff console audit, round 9 later list: a lead edit that changed only its
-- name, phones, priority, tags or any other form field wrote no staff log
-- row (the route updated the row itself). Status and owner already go
-- through admin_change_leads with their rows; this is the rest of the form.
--
-- admin_edit_lead locks the lead, compares each field sent with what is
-- stored, saves only a real change, and writes one edit_lead row naming the
-- fields that changed, in the same transaction. A save that changes nothing
-- writes nothing. Only the lead form's fields may be sent; the columns the
-- server keeps (status, owner, scores, conversion, dates) are refused.

CREATE OR REPLACE FUNCTION public.admin_edit_lead(
    _lead_id uuid,
    _changes jsonb,
    _admin_user_id uuid DEFAULT NULL::uuid,
    _actor_email text DEFAULT NULL::text
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
    _bad text;
    _old public.leads;
    _new public.leads;
    _changed text[];
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

    SELECT * INTO _old FROM public.leads WHERE id = _lead_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false, 'changed', '[]'::jsonb);
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

REVOKE ALL ON FUNCTION public.admin_edit_lead(uuid, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_edit_lead(uuid, jsonb, uuid, text) TO service_role;
