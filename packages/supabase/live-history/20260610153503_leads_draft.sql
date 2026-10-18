ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leads.is_draft IS
    'True while a lead is an unfinished draft (auto-saved on accidental form exit). Promoted to false when the employee saves the form.';

CREATE INDEX IF NOT EXISTS idx_leads_is_draft ON public.leads(is_draft) WHERE is_draft = true;;
