-- Add is_draft to leads: an in-progress prospect auto-saved when an employee
-- accidentally dismisses the "Add lead" form. Drafts appear in the list with a
-- distinct look + DRAFT badge; saving the form promotes them (is_draft = false).
-- Excluded from pipeline analytics so they don't inflate counts.

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leads.is_draft IS
    'True while a lead is an unfinished draft (auto-saved on accidental form exit). Promoted to false when the employee saves the form.';

-- Drafts are listed/filtered often; index the common "real leads only" path.
CREATE INDEX IF NOT EXISTS idx_leads_is_draft ON public.leads(is_draft) WHERE is_draft = true;
