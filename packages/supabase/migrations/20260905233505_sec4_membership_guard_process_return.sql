-- SEC-4 (part 3) — real authorization on process_return.
--
-- Same reasoning as undo_return: revoking anon was necessary but not sufficient,
-- because `authenticated` still holds EXECUTE and the only check compared the
-- PASSED tenant to the order's tenant. Any signed-in user could force any store's
-- order to `rejected` and move that store's stock.
--
-- The guard is INJECTED into the existing definition rather than retyped, so the
-- ~4,000-character body stays byte-identical apart from the added block. Verified
-- after applying: guard present, membership check present, the original tenant
-- consistency check and body still intact, definition length grew by exactly the
-- guard.
--
-- Verified as role `authenticated` against a foreign tenant: BLOCKED 42501.
--
-- NOT applied to inv_apply on purpose: it has no application caller and is
-- reached only through the inv_order_changed() trigger on every order write.
-- Revoking anon/PUBLIC (20260905233257) removes the reachable hole; adding a body
-- guard there would put an auth check on the inventory path of every order
-- mutation for no additional protection, and is the riskier change.
--
-- DOWN MIGRATION: re-apply the previous body without the SEC-4 GUARD block.

DO $migration$
DECLARE
    v_def  text;
    v_pos  int;
    v_guard text := E'\n    -- >>> SEC-4 GUARD\n'
                 || E'    IF coalesce(auth.role(), ''service_role'') <> ''service_role'' THEN\n'
                 || E'        IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN\n'
                 || E'            RAISE EXCEPTION ''Unauthorized: tenant membership required''\n'
                 || E'                USING ERRCODE = ''42501'';\n'
                 || E'        END IF;\n'
                 || E'    END IF;\n'
                 || E'    -- <<< SEC-4 GUARD\n';
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'process_return';

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'process_return not found';
    END IF;

    IF position('SEC-4 GUARD' in v_def) > 0 THEN
        RAISE NOTICE 'guard already present; nothing to do';
        RETURN;
    END IF;

    v_pos := position(E'\nBEGIN\n' in v_def);
    IF v_pos = 0 THEN
        RAISE EXCEPTION 'could not locate body BEGIN in process_return';
    END IF;

    v_def := overlay(v_def placing (E'\nBEGIN\n' || v_guard) from v_pos for length(E'\nBEGIN\n'));

    EXECUTE v_def;
END;
$migration$;
