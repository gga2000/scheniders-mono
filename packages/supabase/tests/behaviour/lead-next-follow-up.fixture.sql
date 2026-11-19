-- Throwaway Postgres database for lead_follow_ups_set_next
-- (20261119043125_lead_next_follow_up_in_step.sql): leads and their
-- follow-ups with the columns the trigger reads, as they are live
-- (information_schema, 2026-11-19), and the live foreign key that deletes a
-- lead's follow-ups with it. The lead's own AFTER UPDATE trigger is stood in
-- by one that counts its runs at the live depth check.
-- NEVER run this against Supabase: it creates roles.

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

CREATE TABLE public.leads (
    id uuid PRIMARY KEY,
    merchant_name text NOT NULL,
    next_follow_up_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    score_runs integer NOT NULL DEFAULT 0
);

CREATE TABLE public.lead_follow_ups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
    assigned_to uuid NOT NULL,
    scheduled_at timestamptz NOT NULL,
    title text NOT NULL,
    description text,
    is_completed boolean NOT NULL DEFAULT false,
    completed_at timestamptz,
    completed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Live: leads_after_upsert recounts the score only when pg_trigger_depth() < 2.
CREATE FUNCTION public.leads_after_upsert_stand_in() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth() < 2 THEN
        UPDATE public.leads SET score_runs = score_runs + 1 WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_leads_after_upsert AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_after_upsert_stand_in();

GRANT ALL ON public.leads, public.lead_follow_ups TO service_role;
