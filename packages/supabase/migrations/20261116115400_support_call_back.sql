-- Merchant support, wave 4: "call me back".
--
-- A merchant asks for a call from the Help chat. It becomes a task in the
-- staff console's Today list (kind call_back, due now, or at 9 AM Baghdad when
-- asked overnight) with the number to call, and a line in the chat so the
-- inbox, the phone alerts and the 5-minute late alert all see it as they see
-- any merchant message.
--
--   support_tasks.phone, .requested_by_name   only on call_back tasks.
--   One open call-back per shop; the first-week kinds stay one per shop.
--   support_request_call_back(...)   the merchant's request (service role).
--   support_onboard_shops, support_tasks_due   replaced: the plan ignores
--                                              call-backs; the list carries
--                                              the number and who asked.

ALTER TABLE public.support_tasks
    ADD COLUMN phone text CHECK (phone ~ '^07[0-9]{9}$'),
    ADD COLUMN requested_by_name text CHECK (char_length(requested_by_name) BETWEEN 1 AND 120);

ALTER TABLE public.support_tasks DROP CONSTRAINT support_tasks_kind_check;
ALTER TABLE public.support_tasks ADD CONSTRAINT support_tasks_kind_check
    CHECK (kind IN ('welcome_call', 'store_check', 'first_order', 'trial_end', 'call_back'));
ALTER TABLE public.support_tasks ADD CONSTRAINT support_tasks_call_back_has_phone
    CHECK ((kind = 'call_back') = (phone IS NOT NULL));

ALTER TABLE public.support_tasks DROP CONSTRAINT support_tasks_one_kind;
CREATE UNIQUE INDEX support_tasks_one_kind ON public.support_tasks (tenant_id, kind) WHERE kind <> 'call_back';
CREATE UNIQUE INDEX support_tasks_one_open_call_back ON public.support_tasks (tenant_id)
    WHERE kind = 'call_back' AND done_at IS NULL;

CREATE OR REPLACE FUNCTION public.support_onboard_shops(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_shop record;
    v_admin uuid;
    v_assigned integer := 0;
    v_planned integer := 0;
    v_rows integer;
BEGIN
    -- One shop at a time, so each pick sees the shops given out before it.
    FOR v_shop IN
        SELECT t.id
        FROM public.tenants t
        LEFT JOIN public.support_shop_owners o ON o.tenant_id = t.id
        LEFT JOIN public.admin_users a ON a.user_id = o.admin_id
        WHERE t.is_demo IS NOT TRUE
          AND coalesce(t.is_prospect, false) = false
          AND t.status::text <> 'cancelled'
          AND (o.tenant_id IS NULL OR a.is_active IS NOT TRUE)
        ORDER BY t.created_at, t.id
    LOOP
        -- Support staff first; super admins only when there is no support staff.
        SELECT a.user_id INTO v_admin
        FROM public.admin_users a
        WHERE a.is_active AND a.admin_role IN ('support_staff', 'super_admin')
        ORDER BY (a.admin_role = 'support_staff') DESC,
                 (SELECT count(*) FROM public.support_shop_owners o WHERE o.admin_id = a.user_id),
                 a.created_at, a.user_id
        LIMIT 1;
        EXIT WHEN v_admin IS NULL;

        INSERT INTO public.support_shop_owners (tenant_id, admin_id, assigned_at, assigned_by)
        VALUES (v_shop.id, v_admin, p_now, NULL)
        ON CONFLICT (tenant_id) DO UPDATE
            SET admin_id = excluded.admin_id, assigned_at = excluded.assigned_at, assigned_by = NULL;
        v_assigned := v_assigned + 1;
    END LOOP;

    -- A call-back the merchant asked for is not part of the plan, so it does
    -- not stop a new shop from getting its first week.
    INSERT INTO public.support_tasks (tenant_id, kind, due_at)
    SELECT t.id, k.kind, k.due_at
    FROM public.tenants t
    CROSS JOIN LATERAL (VALUES
        ('welcome_call', t.created_at),
        ('store_check', t.created_at + interval '1 day'),
        ('first_order', t.created_at + interval '3 days'),
        ('trial_end', coalesce(t.trial_ends_at - interval '1 day', t.created_at + interval '6 days'))
    ) AS k(kind, due_at)
    WHERE t.is_demo IS NOT TRUE
      AND coalesce(t.is_prospect, false) = false
      AND t.status::text <> 'cancelled'
      AND t.created_at > p_now - interval '7 days'
      AND t.created_at <= p_now
      AND NOT EXISTS (SELECT 1 FROM public.support_tasks s WHERE s.tenant_id = t.id AND s.kind <> 'call_back')
    ON CONFLICT (tenant_id, kind) WHERE kind <> 'call_back' DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_planned := v_rows;

    RETURN jsonb_build_object('assigned', v_assigned, 'tasks', v_planned);
END;
$$;

CREATE OR REPLACE FUNCTION public.support_request_call_back(
    p_tenant_id uuid,
    p_user_id uuid,
    p_user_name text,
    p_phone text
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
    -- The demo store is a walk-through; nobody there is waiting for a call.
    IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.is_demo IS NOT TRUE) THEN
        RAISE EXCEPTION 'support_call_back_unavailable' USING errcode = 'P0001';
    END IF;

    SELECT * INTO v_task
    FROM public.support_tasks s
    WHERE s.tenant_id = p_tenant_id AND s.kind = 'call_back' AND s.done_at IS NULL
    FOR UPDATE;

    IF FOUND AND v_task.phone = p_phone THEN
        -- Asked again with the same number: staff already have it.
        RETURN jsonb_build_object('task_id', v_task.id, 'phone', v_task.phone, 'due_at', v_task.due_at);
    END IF;

    IF FOUND THEN
        UPDATE public.support_tasks s
        SET phone = p_phone, requested_by_name = v_name
        WHERE s.id = v_task.id
        RETURNING * INTO v_task;
    ELSE
        BEGIN
            INSERT INTO public.support_tasks (tenant_id, kind, due_at, phone, requested_by_name, created_at)
            VALUES (p_tenant_id, 'call_back', public.support_clock_start(v_now), p_phone, v_name, v_now)
            RETURNING * INTO v_task;
        EXCEPTION WHEN unique_violation THEN
            -- A second tap raced the first: keep the one it made.
            SELECT * INTO STRICT v_task
            FROM public.support_tasks s
            WHERE s.tenant_id = p_tenant_id AND s.kind = 'call_back' AND s.done_at IS NULL;
            RETURN jsonb_build_object('task_id', v_task.id, 'phone', v_task.phone, 'due_at', v_task.due_at);
        END;
    END IF;

    PERFORM public.support_merchant_send(
        p_tenant_id, p_user_id, v_name,
        'اتصلوا بي على ' || p_phone,
        jsonb_build_object('callBack', p_phone));

    RETURN jsonb_build_object('task_id', v_task.id, 'phone', v_task.phone, 'due_at', v_task.due_at);
END;
$$;

REVOKE ALL ON FUNCTION public.support_request_call_back(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_request_call_back(uuid, uuid, text, text) TO service_role;

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
