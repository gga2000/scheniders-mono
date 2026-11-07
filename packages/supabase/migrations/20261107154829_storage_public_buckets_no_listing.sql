-- Public buckets serve files by URL without any policy. Their open SELECT
-- policies only added one thing: anyone could LIST every store's file names.
-- Reads through the API are now limited to the caller's own store.
ALTER POLICY "Public Read Access for Product Images" ON storage.objects
  USING (bucket_id = 'product-images' AND public.storage_object_writable(bucket_id, name, owner_id));

ALTER POLICY "Public read tenant assets" ON storage.objects
  USING (bucket_id = 'tenant-assets' AND (storage.foldername(name))[1] IN (SELECT (public.get_user_tenant_ids())::text));

ALTER POLICY "Public read qc-evidence" ON storage.objects
  USING (bucket_id = 'qc-evidence' AND (storage.foldername(name))[1] IN (SELECT (public.get_user_tenant_ids())::text));
