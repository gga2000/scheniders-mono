-- R7-04: a store admin could file unlimited top-up requests and receipts.
-- Cap: 3 waiting requests per store, 10 receipt uploads per store per day.
CREATE OR REPLACE FUNCTION public.wallet_topup_pending_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Serialise inserts per store so two at once cannot both see 2 waiting.
  PERFORM pg_advisory_xact_lock(hashtextextended('wallet_topup:' || NEW.tenant_id::text, 0));
  IF (SELECT count(*) FROM public.wallet_topup_requests
      WHERE tenant_id = NEW.tenant_id AND outcome IS NULL) >= 3 THEN
    RAISE EXCEPTION 'topup_pending_limit' USING ERRCODE = 'P0001',
      HINT = 'Three top-up requests are already waiting for review.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.wallet_topup_pending_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER wallet_topup_requests_pending_limit
BEFORE INSERT ON public.wallet_topup_requests
FOR EACH ROW EXECUTE FUNCTION public.wallet_topup_pending_limit();

CREATE OR REPLACE FUNCTION public.wallet_receipt_upload_ok(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_tenant_admin(p_tenant)
     AND (SELECT count(*) FROM public.wallet_topup_requests
          WHERE tenant_id = p_tenant AND outcome IS NULL) < 3
     AND (SELECT count(*) FROM storage.objects
          WHERE bucket_id = 'wallet-receipts'
            AND name LIKE p_tenant::text || '/%'
            AND created_at > now() - interval '1 day') < 10;
$$;
REVOKE ALL ON FUNCTION public.wallet_receipt_upload_ok(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_receipt_upload_ok(uuid) TO authenticated;

DROP POLICY IF EXISTS wallet_receipts_insert ON storage.objects;
CREATE POLICY wallet_receipts_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'wallet-receipts'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  AND (SELECT public.wallet_receipt_upload_ok(((storage.foldername(objects.name))[1])::uuid))
);
