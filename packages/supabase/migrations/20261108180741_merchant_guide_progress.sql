-- Merchant guide: one row per person per store, holding what the guide
-- itself must remember. Whether a setup step is done is NOT stored here:
-- the guide reads the real store (name, logo, products, delivery prices,
-- published config) every time, so a tick can never disagree with the shop.
--
-- answers      the welcome questions: {"channel":"online"|"online_and_shop","staff":true|false}
-- sound_on     the person's voice on/off choice
-- foundation_done_at  set once the foundation phase is finished; the guide
--              stops checking after this
-- done_seen_at set once the "foundation done" card was closed

CREATE TABLE IF NOT EXISTS public.merchant_guide_progress (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    answers jsonb NOT NULL DEFAULT '{}'::jsonb,
    sound_on boolean NOT NULL DEFAULT true,
    foundation_done_at timestamptz,
    done_seen_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id),
    CONSTRAINT merchant_guide_progress_answers_object CHECK (jsonb_typeof(answers) = 'object')
);

CREATE INDEX IF NOT EXISTS merchant_guide_progress_user_idx
    ON public.merchant_guide_progress (user_id);

CREATE OR REPLACE FUNCTION public.merchant_guide_progress_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_guide_progress_touch ON public.merchant_guide_progress;
CREATE TRIGGER merchant_guide_progress_touch
    BEFORE UPDATE ON public.merchant_guide_progress
    FOR EACH ROW EXECUTE FUNCTION public.merchant_guide_progress_touch();

ALTER TABLE public.merchant_guide_progress ENABLE ROW LEVEL SECURITY;

-- A person reads and writes only their own row, and only for a store they
-- are an active member of.
DROP POLICY IF EXISTS merchant_guide_progress_select ON public.merchant_guide_progress;
CREATE POLICY merchant_guide_progress_select ON public.merchant_guide_progress
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid())
           AND tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS merchant_guide_progress_insert ON public.merchant_guide_progress;
CREATE POLICY merchant_guide_progress_insert ON public.merchant_guide_progress
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid())
                AND tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS merchant_guide_progress_update ON public.merchant_guide_progress;
CREATE POLICY merchant_guide_progress_update ON public.merchant_guide_progress
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid())
           AND tenant_id IN (SELECT public.get_user_tenant_ids()))
    WITH CHECK (user_id = (SELECT auth.uid())
                AND tenant_id IN (SELECT public.get_user_tenant_ids()));

REVOKE ALL ON public.merchant_guide_progress FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.merchant_guide_progress TO authenticated;
