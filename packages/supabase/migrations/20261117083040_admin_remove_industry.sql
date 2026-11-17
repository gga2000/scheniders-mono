-- Taking an industry away in Settings > Industries is one write.
--
-- The console's Delete counted the leads using the industry, then removed the
-- industry when none did and switched it off when some did. The count's error
-- was not looked at: when the count failed it came back empty, the industry
-- was removed, and the database cleared it from every lead that used it
-- (leads.industry_id is ON DELETE SET NULL). A lead saved with the industry
-- between the count and the removal lost it the same way. The staff log row
-- was written in a second request.
--
-- admin_remove_industry locks the industry, counts its leads, then removes it
-- (no lead uses it) or switches it off (leads keep it), and writes the staff
-- log row, in one transaction. A lead saved with the industry while it runs
-- waits for it: it is counted, or it is refused because the industry is gone.
-- No lead loses its industry.
--
-- Answers {success: true, result: 'removed'} or {success: true, result:
-- 'switched_off', leads_using_it} or {success: false, error: 'not_found'}; a
-- refusal writes nothing. The service role only.

CREATE OR REPLACE FUNCTION public.admin_remove_industry(
    _industry_id uuid,
    _admin_user_id uuid,
    _email text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
    _name text;
    _leads integer;
BEGIN
    IF _industry_id IS NULL THEN
        RAISE EXCEPTION 'an industry is required' USING ERRCODE = '22023';
    END IF;

    -- Saving a lead with this industry takes a key-share lock on its row, so
    -- this waits for a lead being saved, and a lead saved now waits for this.
    SELECT i.name INTO _name
      FROM public.industries i
     WHERE i.id = _industry_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;

    SELECT count(*) INTO _leads FROM public.leads l WHERE l.industry_id = _industry_id;

    IF _leads > 0 THEN
        UPDATE public.industries SET is_active = false WHERE id = _industry_id;
    ELSE
        DELETE FROM public.industries WHERE id = _industry_id;
    END IF;

    INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, admin_label, action, details)
    VALUES (
        _admin_user_id,
        _email,
        CASE WHEN _admin_user_id IS NULL AND _email IS NULL THEN 'system' END,
        'update_settings',
        jsonb_build_object(
            'setting', 'industries',
            'change', CASE WHEN _leads > 0 THEN 'switched_off' ELSE 'removed' END,
            'industry_id', _industry_id,
            'name', _name,
            'leads_using_it', _leads
        )
    );

    IF _leads > 0 THEN
        RETURN jsonb_build_object('success', true, 'result', 'switched_off', 'leads_using_it', _leads);
    END IF;
    RETURN jsonb_build_object('success', true, 'result', 'removed');
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_remove_industry(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_industry(uuid, uuid, text) TO service_role;
