-- Regression: a converted lead's owner and status are locked (commission
-- attribution). Run against a database with the migration applied; the probe
-- rolls itself back and reports through the exception text.
DO $$
DECLARE _id uuid; _t uuid; _ok text := 'none';
BEGIN
  SELECT id INTO _t FROM public.tenants LIMIT 1;
  INSERT INTO public.leads (merchant_name) VALUES ('zz audit probe') RETURNING id INTO _id;
  -- Conversion itself still works, and so do unrelated edits afterwards.
  UPDATE public.leads SET converted_tenant_id = _t, status = 'converted' WHERE id = _id;
  UPDATE public.leads SET priority = priority WHERE id = _id;
  BEGIN
    UPDATE public.leads SET assigned_to = (SELECT id FROM public.user_profiles LIMIT 1) WHERE id = _id;
    _ok := 'FAIL: reassign allowed';
  EXCEPTION WHEN others THEN _ok := 'PASS: ' || SQLERRM;
  END;
  RAISE EXCEPTION 'ROLLBACK_PROBE %', _ok;  -- expect: ROLLBACK_PROBE PASS: ...
END $$;
