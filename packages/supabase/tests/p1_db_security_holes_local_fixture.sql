-- =============================================================================
-- Local fixture for p1_db_security_holes.sql — a throwaway Postgres 16 database
-- shaped like the live objects the p1_db_security_holes.sql migrations touch.
-- =============================================================================
--
-- NEVER run this against Supabase: it creates roles, an auth/storage stub and
-- tables. It exists so the migrations and their tests can run on a plain
-- local cluster:
--
--   createdb p1sec, then follow HOW TO RUN in p1_db_security_holes.sql.
--
-- Function bodies, policies, grants, bucket rows and default ACLs below are
-- copied from the live project (pg_get_functiondef / pg_policies /
-- information_schema / storage.buckets / pg_default_acl, 2026-10-20). Tables
-- carry only the columns those objects and the tests use, except tenants and
-- user_profiles, which carry every live column (the triggers and column
-- grants depend on the full column list).
-- =============================================================================

-- Roles (Supabase API roles) -------------------------------------------------
DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

-- auth stub (same semantics as Supabase: claims from request.jwt.claims) ------
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    email text,
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')::text
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

-- Supabase-style grants on public ---------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Types -----------------------------------------------------------------------
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'limited', 'suspended', 'cancelled');
CREATE TYPE public.member_status AS ENUM ('pending', 'active', 'suspended');

-- Tables ----------------------------------------------------------------------
CREATE TABLE public.tenants (
    id uuid PRIMARY KEY,
    business_name text,
    slug text,
    plan text,
    status public.tenant_status DEFAULT 'trial',
    trial_ends_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    branding jsonb DEFAULT '{}'::jsonb,
    settings jsonb DEFAULT '{}'::jsonb,
    contact_email text,
    contact_phone text,
    address text,
    city text,
    metadata jsonb DEFAULT '{}'::jsonb,
    store_config jsonb DEFAULT '{}'::jsonb,
    is_prospect boolean DEFAULT false,
    prospect_lead_id uuid,
    store_config_draft jsonb,
    restrictions jsonb DEFAULT '{}'::jsonb,
    display_id text,
    store_config_v2 jsonb,
    store_config_v2_draft jsonb,
    config_version integer DEFAULT 1,
    store_config_rev bigint DEFAULT 0
);

CREATE TABLE public.user_profiles (
    id uuid PRIMARY KEY REFERENCES auth.users (id),
    email varchar,
    display_name varchar,
    role varchar,
    avatar_url text,
    is_active boolean DEFAULT true,
    last_login_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    total_actions_count integer DEFAULT 0,
    weekly_actions_count integer DEFAULT 0,
    monthly_actions_count integer DEFAULT 0,
    current_tenant_id uuid
);

CREATE TABLE public.tenant_members (
    tenant_id uuid REFERENCES public.tenants (id),
    user_id uuid REFERENCES auth.users (id),
    -- Live since 20261020215422_tenant_role_source_of_truth.
    role text NOT NULL DEFAULT 'employee'
        CONSTRAINT tenant_members_role_check CHECK (role IN ('admin', 'employee', 'viewer')),
    status public.member_status DEFAULT 'active',
    PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE public.wallet (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid UNIQUE REFERENCES public.tenants (id),
    balance_iqd numeric DEFAULT 0,
    total_charged_iqd numeric DEFAULT 0,
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.wallet_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid,
    type text,
    amount_iqd numeric,
    balance_after_iqd numeric,
    description text,
    reference_id text
);

CREATE TABLE public.products (
    id uuid PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants (id)
);

CREATE TABLE public.qc_quarantine (
    id uuid PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants (id)
);

CREATE TABLE public.performance_bonuses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid,
    amount numeric,
    reason text,
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    payroll_id uuid,
    is_applied boolean DEFAULT false,
    tenant_id uuid REFERENCES public.tenants (id)
);

CREATE TABLE public.payroll_records (
    id uuid PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants (id),
    employee_id uuid,
    pdf_url text
);

-- Live role matrix (20261020215422): only admin holds system.financials.view.
CREATE TABLE public.role_permissions (
    role varchar NOT NULL,
    permission varchar NOT NULL
);
-- Per-tenant overrides since 20261021223954.
CREATE TABLE public.user_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    permission text NOT NULL,
    is_granted boolean NOT NULL DEFAULT true,
    CONSTRAINT user_permissions_tenant_user_permission_key UNIQUE (tenant_id, user_id, permission)
);

CREATE TABLE public.store_config_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid,
    label text,
    is_named boolean,
    config jsonb,
    created_by uuid,
    author_name text,
    diff_summary jsonb,
    created_at timestamptz DEFAULT now()
);

-- Live helper functions --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_tenant_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tm.tenant_id
  FROM tenant_members tm
  JOIN user_profiles up ON up.id = tm.user_id
  WHERE tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND coalesce(up.is_active, true);
$function$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE tenant_id = p_tenant_id
          AND user_id = auth.uid()
          AND role = 'admin'
          AND status = 'active'
    );
$function$;

CREATE OR REPLACE FUNCTION public.tenant_block_active(p_tenant_id uuid, p_block text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_status TEXT;
    v_restrictions JSONB;
    v_paused_until TIMESTAMPTZ;
BEGIN
    SELECT status::TEXT, restrictions INTO v_status, v_restrictions FROM public.tenants WHERE id = p_tenant_id;
    IF NOT FOUND THEN RETURN FALSE; END IF;
    IF v_status <> 'limited' THEN RETURN FALSE; END IF;
    BEGIN
        v_paused_until := (v_restrictions ->> 'paused_until')::TIMESTAMPTZ;
    EXCEPTION WHEN OTHERS THEN
        v_paused_until := NULL;
    END;
    IF v_paused_until IS NOT NULL AND v_paused_until < now() THEN RETURN FALSE; END IF;
    RETURN COALESCE((v_restrictions -> 'blocks' ->> p_block)::BOOLEAN, FALSE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_storefront_writes_block()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_changed BOOLEAN := FALSE;
BEGIN
    IF NEW.branding IS DISTINCT FROM OLD.branding THEN v_changed := TRUE; END IF;
    IF NEW.store_config IS DISTINCT FROM OLD.store_config THEN v_changed := TRUE; END IF;
    IF v_changed AND public.tenant_block_active(NEW.id, 'storefront_writes') THEN
        RAISE EXCEPTION 'Tenant is paused — storefront edits are blocked'
          USING ERRCODE = 'P0001', HINT = 'TENANT_PAUSED:storefront_writes';
    END IF;
    RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_enforce_storefront_writes_block BEFORE UPDATE ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.enforce_storefront_writes_block();

-- Live (pre-fix) charge_wallet_atomic ------------------------------------------
CREATE OR REPLACE FUNCTION public.charge_wallet_atomic(_tenant_id uuid, _amount numeric, _description text DEFAULT 'Order charge'::text, _order_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _current_balance numeric;
    _new_balance numeric;
    _total_charged numeric;
    _wallet_id uuid;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL THEN
            RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
        END IF;
        IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
        END IF;
    END IF;
    SELECT id, balance_iqd, total_charged_iqd INTO _wallet_id, _current_balance, _total_charged
    FROM wallet WHERE tenant_id = _tenant_id FOR UPDATE;
    IF _wallet_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No wallet found');
    END IF;
    _new_balance := _current_balance - _amount;
    IF _new_balance < -10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', _current_balance);
    END IF;
    UPDATE wallet SET balance_iqd = _new_balance, total_charged_iqd = _total_charged + _amount, updated_at = now()
    WHERE id = _wallet_id;
    INSERT INTO wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, description, reference_id)
    VALUES (_tenant_id, 'charge', -_amount, _new_balance, _description, _order_id);
    RETURN jsonb_build_object('success', true, 'previous_balance', _current_balance, 'charged', _amount, 'new_balance', _new_balance);
END;
$function$;

-- Live (pre-fix) apply_store_config_v2_patch -----------------------------------
CREATE OR REPLACE FUNCTION public.apply_store_config_v2_patch(p_tenant_id uuid, p_is_draft boolean, p_path text[], p_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = p_tenant_id AND user_id = v_uid AND status = 'active') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF array_length(p_path, 1) IS NULL THEN RAISE EXCEPTION 'empty path'; END IF;
  IF p_path[1] NOT IN ('brand_kit', 'pages', 'globals', 'experiments', 'segments',
    'schedules', 'default_locale', 'enabled_locales', 'commerce', 'custom_css') THEN
    RAISE EXCEPTION 'path root "%" is not editable', p_path[1] USING ERRCODE = '22023';
  END IF;
  IF array_length(p_path, 1) > 64 THEN RAISE EXCEPTION 'patch path too deep' USING ERRCODE = '22023'; END IF;
  IF pg_column_size(p_value) > 524288 THEN RAISE EXCEPTION 'patch value too large' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('store_config_' || p_tenant_id::text));
  IF p_is_draft THEN
    UPDATE public.tenants SET store_config_v2_draft = jsonb_set(COALESCE(store_config_v2_draft, store_config_v2, '{}'::jsonb), p_path, p_value, true), updated_at = now() WHERE id = p_tenant_id;
  ELSE
    UPDATE public.tenants SET store_config_v2 = jsonb_set(COALESCE(store_config_v2, '{}'::jsonb), p_path, p_value, true), updated_at = now() WHERE id = p_tenant_id;
  END IF;
END;
$function$;

-- Live publish_store_config_v2 (unchanged by the migrations; legitimate live path)
CREATE OR REPLACE FUNCTION public.publish_store_config_v2(p_tenant_id uuid, p_config jsonb, p_diff_summary jsonb DEFAULT NULL::jsonb, p_expected_rev bigint DEFAULT NULL::bigint)
 RETURNS store_config_versions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_author text;
  v_row public.store_config_versions;
  v_rev bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = p_tenant_id AND user_id = v_uid
      AND status = 'active' AND role IN ('owner', 'admin', 'super_admin')) THEN
    RAISE EXCEPTION 'forbidden: publishing requires an admin role' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_config) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid store_config_v2 (must be a json object)'; END IF;
  IF (p_config->>'schema_version')::int IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'invalid store_config_v2 (schema_version must be 2)'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('store_config_' || p_tenant_id::text));
  IF p_expected_rev IS NOT NULL THEN
    SELECT store_config_rev INTO v_rev FROM public.tenants WHERE id = p_tenant_id;
    IF v_rev IS DISTINCT FROM p_expected_rev THEN RAISE EXCEPTION 'config_conflict' USING ERRCODE = '40001'; END IF;
  END IF;
  SELECT COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email) INTO v_author FROM auth.users WHERE id = v_uid;
  UPDATE public.tenants SET store_config_v2 = p_config, store_config_v2_draft = NULL, config_version = 2,
         store_config_rev = store_config_rev + 1, updated_at = now() WHERE id = p_tenant_id;
  INSERT INTO public.store_config_versions (tenant_id, label, is_named, config, created_by, author_name, diff_summary)
  VALUES (p_tenant_id, NULL, false, p_config, v_uid, v_author, p_diff_summary) RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

-- Live definition (20261020215422_tenant_role_source_of_truth).
CREATE OR REPLACE FUNCTION public.has_tenant_permission(p_tenant_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((
        SELECT CASE
            WHEN tm.role = 'admin' THEN true
            ELSE COALESCE(
                (SELECT o.is_granted
                   FROM public.user_permissions o
                  WHERE o.tenant_id = tm.tenant_id
                    AND o.user_id = tm.user_id
                    AND o.permission = p_permission),
                EXISTS (
                    SELECT 1
                      FROM public.role_permissions rp
                     WHERE rp.role = tm.role
                       AND rp.permission = p_permission
                )
            )
        END
          FROM public.tenant_members tm
          JOIN public.user_profiles up ON up.id = tm.user_id
         WHERE tm.tenant_id = p_tenant_id
           AND tm.user_id = auth.uid()
           AND tm.status = 'active'
           AND COALESCE(up.is_active, true)
    ), false);
$$;

-- Live function ACLs (proacl, 2026-10-20) ---------------------------------------
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids(), public.is_tenant_admin(uuid),
    public.charge_wallet_atomic(uuid, numeric, text, text),
    public.apply_store_config_v2_patch(uuid, boolean, text[], jsonb),
    public.publish_store_config_v2(uuid, jsonb, jsonb, bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.tenant_block_active(uuid, text), public.enforce_storefront_writes_block() FROM authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.has_tenant_permission(uuid, text) TO authenticated;

-- Live RLS policies -------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_storefront_read ON public.tenants FOR SELECT USING (status = ANY (ARRAY['trial'::tenant_status, 'active'::tenant_status]));
CREATE POLICY tenant_member_select ON public.tenants FOR SELECT TO authenticated USING (id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_member_update ON public.tenants FOR UPDATE TO authenticated
    USING (id IN (SELECT get_user_tenant_ids())) WITH CHECK (id IN (SELECT get_user_tenant_ids()));

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_read_profiles ON public.user_profiles FOR SELECT USING (id IN (
    SELECT tm.user_id FROM tenant_members tm WHERE tm.tenant_id IN (SELECT get_user_tenant_ids()) AND tm.status = 'active'::member_status));
CREATE POLICY user_read_own_profile ON public.user_profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY user_update_own_profile ON public.user_profiles FOR UPDATE USING (id = auth.uid())
    WITH CHECK ((id = auth.uid()) AND ((current_tenant_id IS NULL) OR (current_tenant_id IN (SELECT get_user_tenant_ids()))));
-- Live: role is the one user_profiles column authenticated/anon cannot UPDATE.
REVOKE UPDATE ON public.user_profiles FROM anon, authenticated;
GRANT UPDATE (id, email, display_name, avatar_url, is_active, last_login_at, created_at, updated_at,
    total_actions_count, weekly_actions_count, monthly_actions_count, current_tenant_id)
    ON public.user_profiles TO anon, authenticated;

ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_members_read ON public.tenant_members FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids()));

ALTER TABLE public.wallet ENABLE ROW LEVEL SECURITY;
-- F-031 (20261020215422): wallet reads need system.financials.view.
CREATE POLICY tenant_read_wallet ON public.wallet FOR SELECT USING (
    (tenant_id IN (SELECT get_user_tenant_ids())) AND has_tenant_permission(tenant_id, 'system.financials.view'::text));
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_read_wallet_transactions ON public.wallet_transactions FOR SELECT USING (
    (tenant_id IN (SELECT get_user_tenant_ids())) AND has_tenant_permission(tenant_id, 'system.financials.view'::text));

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_read ON public.products FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids()));
ALTER TABLE public.qc_quarantine ENABLE ROW LEVEL SECURITY;
CREATE POLICY qc_read ON public.qc_quarantine FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids()));

ALTER TABLE public.performance_bonuses ENABLE ROW LEVEL SECURITY;
-- F-031 (20261020215422): admin, system.financials.view, or the employee's own rows.
CREATE POLICY tenant_isolation_select ON public.performance_bonuses FOR SELECT USING (
    (tenant_id IN (SELECT get_user_tenant_ids())) AND (is_tenant_admin(tenant_id)
        OR has_tenant_permission(tenant_id, 'system.financials.view'::text) OR (employee_id = (SELECT auth.uid()))));
CREATE POLICY tenant_isolation_insert ON public.performance_bonuses FOR INSERT WITH CHECK (
    (tenant_id IN (SELECT get_user_tenant_ids())) AND (is_tenant_admin(tenant_id)
        OR has_tenant_permission(tenant_id, 'system.financials.view'::text)));
CREATE POLICY tenant_isolation_update ON public.performance_bonuses FOR UPDATE
    USING ((tenant_id IN (SELECT get_user_tenant_ids())) AND (is_tenant_admin(tenant_id)
        OR has_tenant_permission(tenant_id, 'system.financials.view'::text)))
    WITH CHECK ((tenant_id IN (SELECT get_user_tenant_ids())) AND (is_tenant_admin(tenant_id)
        OR has_tenant_permission(tenant_id, 'system.financials.view'::text)));
CREATE POLICY tenant_isolation_delete ON public.performance_bonuses FOR DELETE USING (
    (tenant_id IN (SELECT get_user_tenant_ids())) AND (is_tenant_admin(tenant_id)
        OR has_tenant_permission(tenant_id, 'system.financials.view'::text)));

ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON public.payroll_records FOR SELECT USING (
    (tenant_id IN (SELECT get_user_tenant_ids())) AND (is_tenant_admin(tenant_id)
        OR has_tenant_permission(tenant_id, 'system.financials.view'::text) OR (employee_id = (SELECT auth.uid()))));
CREATE POLICY tenant_isolation_insert ON public.payroll_records FOR INSERT WITH CHECK (
    (tenant_id IN (SELECT get_user_tenant_ids())) AND is_tenant_admin(tenant_id));
CREATE POLICY tenant_isolation_update ON public.payroll_records FOR UPDATE
    USING ((tenant_id IN (SELECT get_user_tenant_ids())) AND is_tenant_admin(tenant_id))
    WITH CHECK ((tenant_id IN (SELECT get_user_tenant_ids())) AND is_tenant_admin(tenant_id));
CREATE POLICY tenant_isolation_delete ON public.payroll_records FOR DELETE USING (
    (tenant_id IN (SELECT get_user_tenant_ids())) AND is_tenant_admin(tenant_id));

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_read_roles ON public.role_permissions FOR SELECT USING (auth.role() = 'authenticated'::text);
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_read_own_permissions ON public.user_permissions FOR SELECT USING (auth.role() = 'authenticated'::text);

ALTER TABLE public.store_config_versions ENABLE ROW LEVEL SECURITY;

-- storage stub --------------------------------------------------------------------
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE TABLE storage.buckets (
    id text PRIMARY KEY,
    name text,
    public boolean,
    file_size_limit bigint,
    allowed_mime_types text[]
);
CREATE TABLE storage.objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id text REFERENCES storage.buckets (id),
    name text,
    owner uuid,
    owner_id text,
    metadata jsonb,
    UNIQUE (bucket_id, name)
);
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[];
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    RETURN _parts[1 : array_length(_parts, 1) - 1];
END;
$$;
GRANT ALL ON storage.objects, storage.buckets TO anon, authenticated, service_role;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
    ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
    ('tenant-assets',  'tenant-assets',  true, 524288,  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']),
    ('qc-evidence',    'qc-evidence',    true, NULL,    NULL),
    ('payroll-pdfs',   'payroll-pdfs',   false, 10485760, ARRAY['application/pdf']);

-- Live storage.objects policies for these four buckets
CREATE POLICY "Admins can manage payroll pdfs" ON storage.objects FOR ALL
    USING ((bucket_id = 'payroll-pdfs'::text) AND (EXISTS (SELECT 1 FROM user_profiles
        WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.role)::text = 'admin'::text)))))
    WITH CHECK ((bucket_id = 'payroll-pdfs'::text) AND (EXISTS (SELECT 1 FROM user_profiles
        WHERE ((user_profiles.id = auth.uid()) AND ((user_profiles.role)::text = 'admin'::text)))));
CREATE POLICY "Allow Deletions for Product Images" ON storage.objects FOR DELETE USING (bucket_id = 'product-images'::text);
CREATE POLICY "Allow Updates to Product Images" ON storage.objects FOR UPDATE USING (bucket_id = 'product-images'::text);
CREATE POLICY "Allow Uploads to Product Images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images'::text);
CREATE POLICY "Public Read Access for Product Images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images'::text);
CREATE POLICY "Authenticated delete qc-evidence" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'qc-evidence'::text);
CREATE POLICY "Authenticated upload to qc-evidence" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'qc-evidence'::text);
CREATE POLICY "Public read qc-evidence" ON storage.objects FOR SELECT USING (bucket_id = 'qc-evidence'::text);
CREATE POLICY "Public read tenant assets" ON storage.objects FOR SELECT USING (bucket_id = 'tenant-assets'::text);
CREATE POLICY "Tenant members can delete assets" ON storage.objects FOR DELETE TO authenticated
    USING ((bucket_id = 'tenant-assets'::text) AND ((storage.foldername(name))[1] IN (SELECT (get_user_tenant_ids())::text)));
CREATE POLICY "Tenant members can upload assets" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK ((bucket_id = 'tenant-assets'::text) AND ((storage.foldername(name))[1] IN (SELECT (get_user_tenant_ids())::text)));

-- Fixture rows (synthetic ids; no production data) ----------------------------------
--   tenant A: admin A1, member (employee) M1, wallet balance 5000
--   tenant B: admin B1
--   O1: signed-up user in no tenant
--   X1: inactive member of tenant A
--   F1: employee of tenant A with a system.financials.view override there
INSERT INTO auth.users (id, email) VALUES
    ('a0000000-0000-0000-0000-0000000000a1', 'a1@example.test'),
    ('a0000000-0000-0000-0000-0000000000a2', 'm1@example.test'),
    ('b0000000-0000-0000-0000-0000000000b1', 'b1@example.test'),
    ('c0000000-0000-0000-0000-0000000000c1', 'o1@example.test'),
    ('a0000000-0000-0000-0000-0000000000a3', 'x1@example.test'),
    ('a0000000-0000-0000-0000-0000000000a4', 'v1@example.test'),
    ('a0000000-0000-0000-0000-0000000000a5', 'f1@example.test'),
    ('d0000000-0000-0000-0000-0000000000d1', 'sa@example.test');
INSERT INTO public.tenants (id, business_name, slug, plan, status, store_config_v2) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'Tenant A', 'tenant-a', 'starter', 'trial', '{"schema_version":2,"pages":{}}'),
    ('bbbbbbbb-0000-0000-0000-000000000002', 'Tenant B', 'tenant-b', 'starter', 'active', '{"schema_version":2,"pages":{}}');
INSERT INTO public.user_profiles (id, email, role, is_active) VALUES
    ('a0000000-0000-0000-0000-0000000000a1', 'a1@example.test', 'admin', true),
    ('a0000000-0000-0000-0000-0000000000a2', 'm1@example.test', 'employee', true),
    ('b0000000-0000-0000-0000-0000000000b1', 'b1@example.test', 'admin', true),
    ('c0000000-0000-0000-0000-0000000000c1', 'o1@example.test', 'admin', true),
    ('a0000000-0000-0000-0000-0000000000a3', 'x1@example.test', 'employee', false),
    ('a0000000-0000-0000-0000-0000000000a4', 'v1@example.test', 'viewer', true),
    ('a0000000-0000-0000-0000-0000000000a5', 'f1@example.test', 'employee', true),
    ('d0000000-0000-0000-0000-0000000000d1', 'sa@example.test', 'super_admin', true);
INSERT INTO public.tenant_members (tenant_id, user_id, role, status) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1', 'admin', 'active'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a2', 'employee', 'active'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a3', 'employee', 'active'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a4', 'viewer', 'active'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a5', 'employee', 'active'),
    ('aaaaaaaa-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-0000000000d1', 'admin', 'active'),
    ('bbbbbbbb-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-0000000000b1', 'admin', 'active');
-- F1: employee granted system.financials.view in tenant A by override; M1's
-- override for tenant B must not reach tenant A.
INSERT INTO public.user_permissions (tenant_id, user_id, permission, is_granted) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a5', 'system.financials.view', true),
    ('bbbbbbbb-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000a2', 'system.financials.view', true);
INSERT INTO public.role_permissions (role, permission) VALUES
    ('admin', 'system.financials.view'), ('admin', 'orders.view'),
    ('employee', 'orders.view'), ('viewer', 'orders.view');
INSERT INTO public.wallet (tenant_id, balance_iqd, total_charged_iqd) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 5000, 0),
    ('bbbbbbbb-0000-0000-0000-000000000002', 5000, 0);
INSERT INTO public.products (id, tenant_id) VALUES
    ('11111111-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001'),
    ('22222222-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002');
INSERT INTO public.qc_quarantine (id, tenant_id) VALUES
    ('33333333-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001'),
    ('44444444-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002');
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
    ('product-images', 'gallery/22222222-0000-0000-0000-00000000000b/1.jpg', NULL),
    ('product-images', 'products/22222222-0000-0000-0000-00000000000b-1700000000000.jpg', NULL),
    ('product-images', 'gallery/11111111-0000-0000-0000-00000000000a/1.jpg', NULL),
    ('qc-evidence', '44444444-0000-0000-0000-00000000000b/1-abc.jpg', 'b0000000-0000-0000-0000-0000000000b1'),
    ('qc-evidence', '33333333-0000-0000-0000-00000000000a/1-abc.jpg', 'a0000000-0000-0000-0000-0000000000a1');
INSERT INTO public.payroll_records (id, tenant_id, employee_id) VALUES
    ('55555555-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a2'),
    ('66666666-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-0000000000b1');
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
    ('payroll-pdfs', '66666666-0000-0000-0000-00000000000b.pdf', 'b0000000-0000-0000-0000-0000000000b1');
INSERT INTO public.performance_bonuses (employee_id, amount, tenant_id) VALUES
    ('a0000000-0000-0000-0000-0000000000a2', 1000, 'aaaaaaaa-0000-0000-0000-000000000001');
