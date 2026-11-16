-- Merchant support, wave 4: a named person for every shop and a first-week plan.
--
--   support_shop_owners      one support person per real shop. The merchant's
--                            Help chat shows their name. Staff can take a shop.
--   support_tasks            the first-week plan of a new shop, owned by its
--                            person: welcome call (day 0), store check (day 1),
--                            first order (day 3), before the trial ends (a day
--                            before trial_ends_at, else day 6).
--   support_calls            the call log: every finished, unanswered or put-off
--                            task with one line, so the next person sees it.
--
--   support_onboard_shops(now)   every 5 minutes from pg_cron: gives each real
--                                shop without an active owner the support person
--                                with the fewest shops, and plans the first week
--                                of shops opened in the last 7 days. Never the
--                                demo store, prospects or closed shops.
--   support_task_log(...)        staff record a task: done closes it; no answer
--                                brings it back in 3 hours; later, tomorrow.
--   support_tasks_due(now)       open tasks due by the end of today in Baghdad,
--                                with the shop's last calls.
--
-- Server-only tables: RLS on, no policies, service role only.

CREATE TABLE public.support_shop_owners (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants (id) ON DELETE CASCADE,
    admin_id uuid NOT NULL REFERENCES public.admin_users (user_id) ON DELETE CASCADE,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    -- null: shared out by support_onboard_shops.
    assigned_by uuid
);

CREATE INDEX support_shop_owners_admin ON public.support_shop_owners (admin_id);

COMMENT ON TABLE public.support_shop_owners IS
    'The support person each shop knows by name. Server-only: RLS on, no policies.';

CREATE TABLE public.support_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('welcome_call', 'store_check', 'first_order', 'trial_end')),
    due_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    done_at timestamptz,
    done_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT support_tasks_one_kind UNIQUE (tenant_id, kind)
);

CREATE INDEX support_tasks_open_due ON public.support_tasks (due_at) WHERE done_at IS NULL;

COMMENT ON TABLE public.support_tasks IS
    'First-week plan of each new shop. Server-only: RLS on, no policies.';

CREATE TABLE public.support_calls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    task_id uuid REFERENCES public.support_tasks (id) ON DELETE SET NULL,
    admin_id uuid NOT NULL,
    admin_name text NOT NULL CHECK (char_length(admin_name) BETWEEN 1 AND 120),
    outcome text NOT NULL CHECK (outcome IN ('done', 'no_answer', 'later')),
    note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_calls_tenant ON public.support_calls (tenant_id, created_at DESC);

COMMENT ON TABLE public.support_calls IS
    'Call log on a shop: what staff did on each task. Server-only: RLS on, no policies.';

ALTER TABLE public.support_shop_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_shop_owners, public.support_tasks, public.support_calls FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_shop_owners, public.support_tasks, public.support_calls TO service_role;

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
      AND NOT EXISTS (SELECT 1 FROM public.support_tasks s WHERE s.tenant_id = t.id)
    ON CONFLICT (tenant_id, kind) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_planned := v_rows;

    RETURN jsonb_build_object('assigned', v_assigned, 'tasks', v_planned);
END;
$$;

REVOKE ALL ON FUNCTION public.support_onboard_shops(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_onboard_shops(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.support_task_log(
    p_task_id uuid,
    p_admin_id uuid,
    p_admin_name text,
    p_outcome text,
    p_note text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_task public.support_tasks;
    v_now timestamptz := clock_timestamp();
BEGIN
    IF p_outcome NOT IN ('done', 'no_answer', 'later') THEN
        RAISE EXCEPTION 'support_bad_outcome' USING errcode = 'P0001';
    END IF;

    SELECT * INTO v_task FROM public.support_tasks t WHERE t.id = p_task_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'support_task_not_found' USING errcode = 'P0001';
    END IF;
    IF v_task.done_at IS NOT NULL THEN
        RAISE EXCEPTION 'support_task_already_done' USING errcode = 'P0001';
    END IF;

    INSERT INTO public.support_calls (tenant_id, task_id, admin_id, admin_name, outcome, note, created_at)
    VALUES (v_task.tenant_id, v_task.id, p_admin_id, left(p_admin_name, 120), p_outcome,
            left(btrim(coalesce(p_note, '')), 500), v_now);

    UPDATE public.support_tasks t
    SET attempts = t.attempts + 1,
        done_at = CASE WHEN p_outcome = 'done' THEN v_now END,
        done_by = CASE WHEN p_outcome = 'done' THEN p_admin_id END,
        due_at = CASE p_outcome
                     WHEN 'no_answer' THEN v_now + interval '3 hours'
                     WHEN 'later' THEN v_now + interval '1 day'
                     ELSE t.due_at
                 END
    WHERE t.id = v_task.id;

    RETURN jsonb_build_object('task_id', v_task.id, 'tenant_id', v_task.tenant_id);
END;
$$;

REVOKE ALL ON FUNCTION public.support_task_log(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_task_log(uuid, uuid, text, text, text) TO service_role;

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

REVOKE ALL ON FUNCTION public.support_tasks_due(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_tasks_due(timestamptz) TO service_role;

SELECT cron.schedule('support-onboard-shops', '*/5 * * * *', 'SELECT public.support_onboard_shops()');