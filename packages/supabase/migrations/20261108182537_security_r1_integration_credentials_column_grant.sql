-- Security audit round 1: the column-level REVOKE in 20261108182347 had no
-- effect because anon/authenticated also held table-level SELECT. Replace the
-- table grant with a column grant that leaves out `credentials`. Only server
-- code (service role) reads credentials; anon needs nothing here.
REVOKE SELECT ON public.tenant_integrations FROM anon, authenticated;
GRANT SELECT (id, tenant_id, provider, is_active, connected_at, created_at, updated_at)
  ON public.tenant_integrations TO authenticated;
