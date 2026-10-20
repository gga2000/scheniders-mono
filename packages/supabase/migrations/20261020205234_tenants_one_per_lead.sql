-- =============================================================================
-- One tenant per lead
-- =============================================================================
--
-- FIXES
--   Two admin routes create a tenant for a lead, and both stamp it with
--   tenants.prospect_lead_id = <lead id>:
--     * POST /api/leads/[id]/convert      -> public.convert_lead_atomic()
--       (row-locks the lead; 20261020163000)
--     * POST /api/leads/[id]/build-store  -> plain PostgREST inserts, no lock
--   The lead row lock only serialises convert against convert. build-store
--   racing a convert (or run on an already-converted lead) inserted a second
--   tenant for the same lead.
--   -> a partial UNIQUE index on tenants(prospect_lead_id). Whichever path
--      loses the race fails with 23505 and writes nothing; both routes map
--      that to 409. Converting a prospect store reuses the existing tenant, so
--      the normal build-store -> convert flow never trips it.
--
-- LIVE BASIS (sduvpgqwhxragxtxztur, read 2026-10-20)
--   0 tenants with prospect_lead_id set, 0 duplicate groups; tenants has 28
--   rows, so a plain (non-concurrent) build is instant.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS public.tenants_prospect_lead_id_key;
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS tenants_prospect_lead_id_key
    ON public.tenants (prospect_lead_id)
    WHERE prospect_lead_id IS NOT NULL;

COMMENT ON INDEX public.tenants_prospect_lead_id_key IS
    'At most one tenant per lead: backstop for convert_lead_atomic vs the build-store route.';
