-- Till batch 2c: each shop's daily sales goal, and staff clocking in and out at the till.

ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS daily_goal bigint;
ALTER TABLE public.shops
    ADD CONSTRAINT shops_daily_goal_positive CHECK (daily_goal IS NULL OR daily_goal BETWEEN 1 AND 1000000000000);

CREATE TABLE IF NOT EXISTS public.till_clock (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    shop_id     uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    clock_in    timestamptz NOT NULL DEFAULT now(),
    clock_out   timestamptz,
    -- true when the person never clocked out and the next clock-in closed the old shift.
    auto_closed boolean NOT NULL DEFAULT false,
    CHECK (clock_out IS NULL OR clock_out >= clock_in)
);
CREATE INDEX IF NOT EXISTS till_clock_tenant_in_idx ON public.till_clock (tenant_id, clock_in DESC);
-- One open shift per person.
CREATE UNIQUE INDEX IF NOT EXISTS till_clock_one_open_idx ON public.till_clock (tenant_id, user_id) WHERE clock_out IS NULL;

ALTER TABLE public.till_clock ENABLE ROW LEVEL SECURITY;
-- Owners and managers see everyone's hours; staff see their own. Only till functions write.
DROP POLICY IF EXISTS till_clock_select ON public.till_clock;
CREATE POLICY till_clock_select ON public.till_clock
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids())
           AND (user_id = (SELECT auth.uid()) OR public.has_tenant_permission(tenant_id, 'shops.manage')));
REVOKE ALL ON public.till_clock FROM anon, authenticated;
GRANT SELECT ON public.till_clock TO authenticated;

-- The cashier's open shift, if any: {clock_in, shop_id} or null.
CREATE OR REPLACE FUNCTION public.till_clock_status(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    s public.till_sessions%ROWTYPE;
    v jsonb;
BEGIN
    s := public.till_live_session(p_session_id);
    SELECT jsonb_build_object('clock_in', c.clock_in, 'shop_id', c.shop_id) INTO v
      FROM public.till_clock c
     WHERE c.tenant_id = s.tenant_id AND c.user_id = s.cashier_id AND c.clock_out IS NULL;
    RETURN v;
END;
$$;

-- Clocks the cashier of this session in (p_in true) or out. Clocking in closes a forgotten
-- open shift at 12 hours, marked auto_closed, so one missed clock-out never counts as days.
CREATE OR REPLACE FUNCTION public.till_clock_set(p_session_id uuid, p_in boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    s public.till_sessions%ROWTYPE;
    v_open public.till_clock%ROWTYPE;
BEGIN
    s := public.till_live_session(p_session_id);
    SELECT * INTO v_open FROM public.till_clock
     WHERE tenant_id = s.tenant_id AND user_id = s.cashier_id AND clock_out IS NULL
     FOR UPDATE;

    IF p_in THEN
        IF FOUND THEN
            IF v_open.shop_id = s.shop_id AND v_open.clock_in > now() - interval '12 hours' THEN
                RETURN jsonb_build_object('clock_in', v_open.clock_in, 'shop_id', v_open.shop_id);
            END IF;
            UPDATE public.till_clock
               SET clock_out = least(now(), v_open.clock_in + interval '12 hours'),
                   auto_closed = v_open.clock_in <= now() - interval '12 hours'
             WHERE id = v_open.id;
        END IF;
        INSERT INTO public.till_clock (tenant_id, shop_id, user_id) VALUES (s.tenant_id, s.shop_id, s.cashier_id)
        RETURNING * INTO v_open;
        RETURN jsonb_build_object('clock_in', v_open.clock_in, 'shop_id', v_open.shop_id);
    END IF;

    IF FOUND THEN
        UPDATE public.till_clock
           SET clock_out = least(now(), v_open.clock_in + interval '12 hours'),
               auto_closed = v_open.clock_in <= now() - interval '12 hours'
         WHERE id = v_open.id;
    END IF;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.till_clock_status(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.till_clock_set(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.till_clock_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.till_clock_set(uuid, boolean) TO authenticated;
