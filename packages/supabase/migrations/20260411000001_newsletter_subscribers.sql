-- Newsletter subscribers table for store newsletter sections
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, email)
);

-- Index for fast lookups by tenant
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_tenant
  ON public.newsletter_subscribers(tenant_id);

-- RLS
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Tenants can read their own subscribers
CREATE POLICY "Tenants can view own subscribers"
  ON public.newsletter_subscribers
  FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- Anyone can subscribe (insert) — storefront is public
CREATE POLICY "Public can subscribe to newsletter"
  ON public.newsletter_subscribers
  FOR INSERT
  WITH CHECK (true);
