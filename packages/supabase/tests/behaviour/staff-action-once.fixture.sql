-- Throwaway Postgres 16 database for the *_once wrappers (audit N3,
-- 20261116143323_staff_action_request_ids.sql, 20261116222030_trial_check_decide_once.sql,
-- 20261116230316_trial_check_decide_seen.sql).
-- The five staff functions they wrap are stubs with the live signatures: each counts its calls and answers
-- success, or the refusal set in test.refuse. The real functions have their
-- own suites (billing-lock, demo-store).
-- NEVER run this against Supabase: it creates roles and an auth stub.

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;

CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('test.role', true), ''), 'service_role')
$$;

CREATE TABLE public.tenants (id uuid PRIMARY KEY);

-- The trial check row a decision locks and compares (decided_at only).
CREATE TABLE public.trial_checks (tenant_id uuid PRIMARY KEY, decided_at timestamptz);

CREATE TABLE public.stub_calls (fn text NOT NULL, tenant_id uuid NOT NULL, amount integer NOT NULL);

CREATE FUNCTION public.stub_answer(_fn text, _tenant_id uuid, _amount integer) RETURNS jsonb
LANGUAGE plpgsql AS $$
BEGIN
    IF nullif(current_setting('test.refuse', true), '') IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', current_setting('test.refuse'));
    END IF;
    INSERT INTO public.stub_calls VALUES (_fn, _tenant_id, _amount);
    RETURN jsonb_build_object('success', true, 'tenant_id', _tenant_id,
        'calls', (SELECT count(*) FROM public.stub_calls WHERE fn = _fn AND tenant_id = _tenant_id));
END;
$$;

CREATE FUNCTION public.admin_extend_trial(_tenant_id uuid, _days integer, _reason text,
    _admin_user_id uuid DEFAULT NULL, _actor_email text DEFAULT NULL, _source text DEFAULT 'single')
RETURNS jsonb LANGUAGE sql AS $$ SELECT public.stub_answer('extend_trial', _tenant_id, _days) $$;

CREATE FUNCTION public.admin_extend_subscription(_tenant_id uuid, _days integer,
    _admin_user_id uuid DEFAULT NULL, _actor_email text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$ SELECT public.stub_answer('extend_subscription', _tenant_id, _days) $$;

CREATE FUNCTION public.admin_add_lock_orders(_tenant_id uuid, _orders integer, _reason text,
    _admin_user_id uuid DEFAULT NULL, _actor_email text DEFAULT NULL, _may_grant_unpaid boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql AS $$ SELECT public.stub_answer('add_lock_orders', _tenant_id, _orders) $$;

CREATE FUNCTION public.admin_force_unlock(_tenant_id uuid, _days integer, _reason text,
    _admin_user_id uuid DEFAULT NULL, _actor_email text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$ SELECT public.stub_answer('force_unlock', _tenant_id, _days) $$;

CREATE FUNCTION public.admin_trial_check_decide(_tenant_id uuid, _decision text, _reason text,
    _days integer DEFAULT NULL, _admin_user_id uuid DEFAULT NULL, _actor_email text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
    -- As the real one does on success: the row is decided now.
    IF nullif(current_setting('test.refuse', true), '') IS NULL THEN
        UPDATE public.trial_checks SET decided_at = clock_timestamp() WHERE tenant_id = _tenant_id;
    END IF;
    RETURN public.stub_answer('trial_check_decide', _tenant_id, coalesce(_days, 0));
END;
$$;
