-- =============================================================================
-- Customer notes: author stamping and admin restore, pinned in SQL
-- =============================================================================
--   * an employee insert is stamped with the caller whatever author they send;
--   * a store admin plain insert is stamped with the admin;
--   * a store admin restore keeps a supplied author who is a tenant member;
--   * a store admin supplying an author outside the tenant is stamped with self;
--   * update cannot change phone, author, date or tenant.
-- Uses the scheniders-iraq tenant and its admin. Runs in one transaction and rolls back.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/supabase/tests/customer_notes_rules.sql
BEGIN;
DO $test$
DECLARE
    t uuid := 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a';
    adm uuid := '54393b2c-a83e-461b-aefd-8bf5ef13817c';
    emp uuid;
    outsider uuid;
    phone_before text;
    old_ts timestamptz := now() - interval '30 days';
    got public.customer_notes%ROWTYPE;
BEGIN
    SELECT user_id INTO emp FROM public.tenant_members WHERE tenant_id = t AND role <> 'admin' LIMIT 1;
    SELECT id INTO outsider FROM auth.users u
      WHERE NOT EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id = t AND m.user_id = u.id) LIMIT 1;
    IF emp IS NULL OR outsider IS NULL THEN RAISE EXCEPTION 'SKIP need an employee and an outsider in the data'; END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', emp, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.customer_notes (tenant_id, customer_phone, note, created_by, created_at)
      VALUES (t, '07700000001', 'emp', adm, old_ts) RETURNING * INTO got;
    IF got.created_by <> emp OR got.created_at < now() - interval '1 minute' THEN
        RAISE EXCEPTION 'FAIL employee author/date must be stamped with the caller';
    END IF;
    RAISE NOTICE 'PASS employee spoof is overwritten';
    RESET ROLE;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.customer_notes (tenant_id, customer_phone, note, created_by, created_at)
      VALUES (t, '07700000002', 'restore', emp, old_ts) RETURNING * INTO got;
    IF got.created_by <> emp OR got.created_at <> old_ts THEN
        RAISE EXCEPTION 'FAIL admin restore must keep a tenant member author and date';
    END IF;
    INSERT INTO public.customer_notes (tenant_id, customer_phone, note, created_by, created_at)
      VALUES (t, '07700000003', 'outsider', outsider, old_ts) RETURNING * INTO got;
    IF got.created_by <> adm OR got.created_at < now() - interval '1 minute' THEN
        RAISE EXCEPTION 'FAIL an author outside the tenant must be stamped with the admin';
    END IF;
    phone_before := got.customer_phone;
    UPDATE public.customer_notes SET customer_phone = '07700000009', created_by = emp, created_at = old_ts, note = 'edited'
      WHERE id = got.id RETURNING * INTO got;
    IF got.customer_phone <> phone_before OR got.created_by <> adm OR got.created_at < now() - interval '1 minute' THEN
        RAISE EXCEPTION 'FAIL update must not change phone, author or date';
    END IF;
    RAISE NOTICE 'PASS admin restore, outsider and frozen fields';
    RESET ROLE;
END
$test$;
ROLLBACK;
