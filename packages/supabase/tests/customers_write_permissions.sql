-- Rolled-back check: a viewer cannot tag or block; an employee can.
-- Uses the real store and a known employee; every statement ends in a RAISE.
DO $$
DECLARE r text := '';
BEGIN
  UPDATE tenant_members SET role='viewer' WHERE user_id='2db1e8a7-7607-48d5-9ccb-84d226a7860f' AND tenant_id='b5c4f2d4-834f-4af4-822d-9b9826a8f45a';
  PERFORM set_config('request.jwt.claims','{"sub":"2db1e8a7-7607-48d5-9ccb-84d226a7860f","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  BEGIN INSERT INTO customer_tags(tenant_id,name,color) VALUES ('b5c4f2d4-834f-4af4-822d-9b9826a8f45a','zz-dry','blue'); r := r||'TAG-ALLOWED;';
  EXCEPTION WHEN OTHERS THEN r := r||'TAG-DENIED;'; END;
  BEGIN INSERT INTO blacklist(tenant_id,phone,reason) VALUES ('b5c4f2d4-834f-4af4-822d-9b9826a8f45a','07000000000','x'); r := r||'BLOCK-ALLOWED;';
  EXCEPTION WHEN OTHERS THEN r := r||'BLOCK-DENIED;'; END;
  -- expect: DRYRUN TAG-DENIED;BLOCK-DENIED;  (as an employee: both ALLOWED)
  RAISE EXCEPTION 'DRYRUN %', r;
END $$;
