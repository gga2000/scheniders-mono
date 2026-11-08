CREATE TABLE IF NOT EXISTS public.prime_link_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    requested_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    prime_phone text NOT NULL CHECK (prime_phone ~ '^07[0-9]{9}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    linked_at timestamptz,
    linked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS prime_link_requests_one_open ON public.prime_link_requests (tenant_id) WHERE linked_at IS NULL;
CREATE INDEX IF NOT EXISTS prime_link_requests_open_created ON public.prime_link_requests (created_at DESC) WHERE linked_at IS NULL;
ALTER TABLE public.prime_link_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prime_link_requests_select ON public.prime_link_requests;
CREATE POLICY prime_link_requests_select ON public.prime_link_requests FOR SELECT TO authenticated USING ((SELECT public.is_tenant_admin(tenant_id)));
DROP POLICY IF EXISTS prime_link_requests_insert ON public.prime_link_requests;
CREATE POLICY prime_link_requests_insert ON public.prime_link_requests FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_tenant_admin(tenant_id)) AND requested_by = (SELECT auth.uid()) AND linked_at IS NULL AND linked_by IS NULL);
REVOKE ALL ON public.prime_link_requests FROM anon;
REVOKE ALL ON public.prime_link_requests FROM authenticated;
GRANT SELECT ON public.prime_link_requests TO authenticated;
GRANT INSERT (tenant_id, prime_phone) ON public.prime_link_requests TO authenticated;
GRANT ALL ON public.prime_link_requests TO service_role;
