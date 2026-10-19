CREATE TABLE IF NOT EXISTS public.customer_points (
    tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    phone      text NOT NULL,
    balance    integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, phone)
);

CREATE TABLE IF NOT EXISTS public.customer_points_ledger (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    phone      text NOT NULL,
    delta      integer NOT NULL,
    reason     text NOT NULL,
    order_id   uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_points_ledger_tenant_phone
    ON public.customer_points_ledger (tenant_id, phone);

ALTER TABLE public.customer_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_points_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_points_member_select ON public.customer_points;
CREATE POLICY customer_points_member_select ON public.customer_points
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS customer_points_ledger_member_select ON public.customer_points_ledger;
CREATE POLICY customer_points_ledger_member_select ON public.customer_points_ledger
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

CREATE OR REPLACE FUNCTION public.adjust_customer_points(
    _tenant_id uuid,
    _phone     text,
    _delta     integer,
    _reason    text,
    _order_id  uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _new integer;
BEGIN
    INSERT INTO public.customer_points (tenant_id, phone, balance, updated_at)
        VALUES (_tenant_id, _phone, _delta, now())
    ON CONFLICT (tenant_id, phone) DO UPDATE
        SET balance = public.customer_points.balance + _delta,
            updated_at = now()
    RETURNING balance INTO _new;

    IF _new < 0 THEN
        RAISE EXCEPTION 'insufficient_points';
    END IF;

    INSERT INTO public.customer_points_ledger (tenant_id, phone, delta, reason, order_id)
        VALUES (_tenant_id, _phone, _delta, _reason, _order_id);

    RETURN _new;
END;
$$;

NOTIFY pgrst, 'reload schema';;
