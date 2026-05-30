-- =====================================================================
-- Store section presets — Schneiders Builder v2
-- =====================================================================
-- Per-tenant library of reusable section configurations. The merchant
-- can "Save as preset" from any section row in the editor; presets
-- appear under a dedicated tab in the section picker and insert as
-- fresh `SectionInstance` copies (id rehashed).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.store_section_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  section_type text NOT NULL,
  /* The SectionInstance object (label, enabled, base, variants,
     visibility) WITHOUT its original `id` — the id is freshly assigned
     each time the preset is inserted into a page. */
  instance jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.store_section_presets IS
  'Reusable per-tenant section presets surfaced in the Builder v2 section picker.';

CREATE INDEX IF NOT EXISTS idx_store_section_presets_tenant_created
  ON public.store_section_presets (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_section_presets_tenant_type
  ON public.store_section_presets (tenant_id, section_type);

ALTER TABLE public.store_section_presets ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- RLS — tenant members can read/write their own tenant's presets.
-- ---------------------------------------------------------------------

CREATE POLICY "Tenant members can read their presets"
  ON public.store_section_presets
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can insert presets"
  ON public.store_section_presets
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can update their presets"
  ON public.store_section_presets
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can delete their presets"
  ON public.store_section_presets
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );
