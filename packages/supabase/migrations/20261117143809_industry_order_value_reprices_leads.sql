-- A new average order prices the industry's leads again (staff console audit,
-- round 11 data finding 5, P3).
--
-- A lead's estimated monthly sales (leads.estimated_monthly_revenue) is
-- stored: leads_before_upsert prices it from the lead's daily orders and its
-- industry's average order whenever the lead is written. admin_edit_industry
-- changed the average order and touched no lead, so old leads kept the old
-- price while new ones took the new one, and an old lead jumped the next time
-- anyone fixed its phone number. Lead numbers sums the stored figures.
--
-- Now, when an edit changes avg_order_value_iqd, the same function prices
-- that industry's leads again with compute_lead_predictions, in the same
-- transaction, after the industry row is written. Only leads whose estimate
-- moves are written (a lead with no daily orders stays 0 and untouched).
-- Nothing else changes: the same locks, refusals, staff log row, answer and
-- grants. Built on the live body (md5 of prosrc 6703a4a4..., equal to
-- migration 20261117141316).
--
-- Rollback: run 20261117141316's CREATE OR REPLACE admin_edit_industry again.

CREATE OR REPLACE FUNCTION public.admin_edit_industry(
    _industry_id uuid,
    _changes jsonb,
    _admin_user_id uuid,
    _email text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
    _editable constant text[] := ARRAY['name', 'name_ar', 'icon', 'color', 'avg_order_value_iqd', 'is_active'];
    _old public.industries;
    _new public.industries;
    _changed text[];
BEGIN
    IF _industry_id IS NULL OR jsonb_typeof(_changes) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'an industry and its changes are required' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(_changes) AS k(key) WHERE k.key <> ALL (_editable)) THEN
        RAISE EXCEPTION 'only % can be edited here', array_to_string(_editable, ', ') USING ERRCODE = '22023';
    END IF;

    -- As admin_add_industry, admin_remove_industry and admin_move_industry,
    -- first: an edit and a remove, add or move at the same instant take turns.
    LOCK TABLE public.industries IN SHARE ROW EXCLUSIVE MODE;

    SELECT * INTO _old FROM public.industries i WHERE i.id = _industry_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;

    _new := jsonb_populate_record(_old, _changes);
    SELECT coalesce(array_agg(f.key ORDER BY f.n), ARRAY[]::text[]) INTO _changed
      FROM unnest(_editable) WITH ORDINALITY AS f(key, n)
     WHERE to_jsonb(_old) -> f.key IS DISTINCT FROM to_jsonb(_new) -> f.key;

    IF cardinality(_changed) > 0 THEN
        UPDATE public.industries
           SET name = _new.name,
               name_ar = _new.name_ar,
               icon = _new.icon,
               color = _new.color,
               avg_order_value_iqd = _new.avg_order_value_iqd,
               is_active = _new.is_active
         WHERE id = _industry_id;

        -- A lead's estimated monthly sales is stored, priced at its
        -- industry's average order when the lead was last saved. A new
        -- average order prices this industry's leads again now, in the same
        -- turn, so no estimate waits for an unrelated edit to jump. Leads
        -- whose estimate does not move are not written.
        -- (leads_before_upsert computes the same figure on every write.)
        IF 'avg_order_value_iqd' = ANY (_changed) THEN
            WITH priced AS (
                SELECT l.id, p.monthly_revenue
                  FROM public.leads l
                 CROSS JOIN LATERAL public.compute_lead_predictions(l.avg_view_count, l.industry_id, l.avg_order_count) AS p
                 WHERE l.industry_id = _industry_id
            )
            UPDATE public.leads l
               SET estimated_monthly_revenue = priced.monthly_revenue
              FROM priced
             WHERE l.id = priced.id
               AND l.estimated_monthly_revenue IS DISTINCT FROM priced.monthly_revenue;
        END IF;

        INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, admin_label, action, details)
        VALUES (
            _admin_user_id,
            _email,
            CASE WHEN _admin_user_id IS NULL AND _email IS NULL THEN 'system' END,
            'update_settings',
            jsonb_build_object(
                'setting', 'industries',
                'change', 'edited',
                'industry_id', _industry_id,
                'name', _new.name,
                'was', CASE WHEN _new.name IS DISTINCT FROM _old.name THEN _old.name END,
                'fields', to_jsonb(_changed)
            )
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'industry', to_jsonb(_new), 'changed', to_jsonb(_changed));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_edit_industry(uuid, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_edit_industry(uuid, jsonb, uuid, text) TO service_role;