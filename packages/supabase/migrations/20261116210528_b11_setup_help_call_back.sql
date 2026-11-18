-- Fermi B11: «تريد نساعدك بالإعداد؟», free help setting up the store.
--
-- A new merchant asks, from the store setup wizard, for our team to call and
-- set the store up with them. It is a call-back like the one in the Help chat
-- (kind call_back: one open per shop, first in the staff Today list, and the
-- merchant's Help chat says which number we will call), marked topic 'setup'
-- so staff know what the call is for.
--
--   support_tasks.topic                         'setup' on a setup-help call-back.
--   support_request_call_back(..., p_topic)     replaces the 4-argument version;
--                                               a plain call-back passes no topic.
--   support_tasks_due                           also returns the topic.

ALTER TABLE public.support_tasks
    ADD COLUMN topic text CHECK (topic IN ('setup'));
ALTER TABLE public.support_tasks ADD CONSTRAINT support_tasks_topic_on_call_back
    CHECK (topic IS NULL OR kind = 'call_back');

DROP FUNCTION public.support_request_call_back(uuid, uuid, text, text);

CREATE FUNCTION public.support_request_call_back(
    p_tenant_id uuid,
    p_user_id uuid,
    p_user_name text,
    p_phone text,
    p_topic text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_now timestamptz := clock_timestamp();
    v_name text := left(coalesce(nullif(btrim(p_user_name), ''), 'Member'), 120);
    v_task public.support_tasks;
BEGIN
    IF p_phone IS NULL OR p_phone !~ '^07[0-9]{9}$' THEN
        RAISE EXCEPTION 'support_bad_phone' USING errcode = 'P0001';
    END IF;
    IF p_topic IS NOT NULL AND p_topic <> 'setup' THEN
        RAISE EXCEPTION 'support_bad_topic' USING errcode = 'P0001';
    END IF;
    -- The demo store is a walk-through; nobody there is waiting for a call.
    IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_demo IS NOT TRUE) THEN
        RAISE EXCEPTION 'support_call_back_unavailable' USING errcode = 'P0001';
    END IF;

    SELECT * INTO v_task
    FROM public.support_tasks s
    WHERE s.tenant_id = p_tenant_id AND s.kind = 'call_back' AND s.done_at IS NULL
    FOR UPDATE;

    -- Asked again with the same number, and nothing new about why: staff
    -- already have it. A plain call-back on top of a setup one keeps it setup.
    IF FOUND AND v_task.phone = p_phone AND (p_topic IS NULL OR v_task.topic IS NOT DISTINCT FROM p_topic) THEN
        RETURN jsonb_build_object('task_id', v_task.id, 'phone', v_task.phone, 'due_at', v_task.due_at, 'topic', v_task.topic);
    END IF;

    IF FOUND THEN
        UPDATE public.support_tasks s
        SET phone = p_phone, requested_by_name = v_name, topic = coalesce(p_topic, s.topic)
        WHERE s.id = v_task.id
        RETURNING * INTO v_task;
    ELSE
        BEGIN
            INSERT INTO public.support_tasks (tenant_id, kind, due_at, phone, requested_by_name, topic, created_at)
            VALUES (p_tenant_id, 'call_back', public.support_clock_start(v_now), p_phone, v_name, p_topic, v_now)
            RETURNING * INTO v_task;
        EXCEPTION WHEN unique_violation THEN
            -- A second tap raced the first: keep the one it made.
            SELECT * INTO STRICT v_task
            FROM public.support_tasks s
            WHERE s.tenant_id = p_tenant_id AND s.kind = 'call_back' AND s.done_at IS NULL;
            RETURN jsonb_build_object('task_id', v_task.id, 'phone', v_task.phone, 'due_at', v_task.due_at, 'topic', v_task.topic);
        END;
    END IF;

    PERFORM public.support_merchant_send(
        p_tenant_id, p_user_id, v_name,
        CASE WHEN p_topic = 'setup' THEN 'أريد مساعدة مجانية بإعداد متجري. اتصلوا بي على ' ELSE 'اتصلوا بي على ' END || p_phone,
        jsonb_build_object('callBack', p_phone)
            || CASE WHEN p_topic IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('topic', p_topic) END);

    RETURN jsonb_build_object('task_id', v_task.id, 'phone', v_task.phone, 'due_at', v_task.due_at, 'topic', v_task.topic);
END;
$$;

REVOKE ALL ON FUNCTION public.support_request_call_back(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_request_call_back(uuid, uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.support_tasks_due(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id,
               'kind', s.kind,
               'topic', s.topic,
               'due_at', s.due_at,
               'attempts', s.attempts,
               'phone', s.phone,
               'requested_by', s.requested_by_name,
               'tenant_id', t.id,
               'business_name', t.business_name,
               'display_id', t.display_id,
               'trial_ends_at', t.trial_ends_at,
               'shop_status', t.status::text,
               'orders', (SELECT count(*) FROM public.admin_order_facts f WHERE f.tenant_id = t.id),
               'owner_id', o.admin_id,
               'owner_name', a.display_name,
               'calls', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                    'admin_name', c.admin_name, 'outcome', c.outcome,
                                    'note', c.note, 'created_at', c.created_at)
                                ORDER BY c.created_at DESC), '[]'::jsonb)
                         FROM (SELECT * FROM public.support_calls c
                               WHERE c.tenant_id = t.id
                               ORDER BY c.created_at DESC LIMIT 3) c))
             ORDER BY s.due_at, t.business_name, s.kind), '[]'::jsonb)
    FROM public.support_tasks s
    JOIN public.tenants t ON t.id = s.tenant_id
    LEFT JOIN public.support_shop_owners o ON o.tenant_id = t.id
    LEFT JOIN public.admin_users a ON a.user_id = o.admin_id
    WHERE s.done_at IS NULL
      AND t.is_demo IS NOT TRUE
      AND t.status::text <> 'cancelled'
      -- Due by the end of today, Baghdad time.
      AND s.due_at < (date_trunc('day', p_now AT TIME ZONE 'Asia/Baghdad') + interval '1 day') AT TIME ZONE 'Asia/Baghdad';
$$;
